import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import {
  ServiceUnavailableException,
  type ExecutionContext,
} from "@nestjs/common";
import {
  APP_GUARD,
  ContextIdFactory,
  NestFactory,
  Reflector,
} from "@nestjs/core";
import {
  OPENXIANGDA_CONTRACT_VERSION,
  SCHEMA_VERSIONS,
  eventDeliverySignatureContentV2,
  sha256Digest,
  type AppEventHandlerContract,
  type GatewayInvocationPrincipal,
  type NativePrincipal,
  OPENXIANGDA_NOTIFICATION_APPLICATION_SEND_V2,
  OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2,
  OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2,
  OPENXIANGDA_NOTIFICATION_DINGTALK_ADVANCED_CARD_SEND_V2,
} from "openxiangda-contracts";
import {
  OpenXiangdaAuthzGuard,
  OpenXiangdaAssigneeProviderController,
  OpenXiangdaAssigneeProviderReceiver,
  OpenXiangdaApplicationCredentials,
  OpenXiangdaApplicationDataApiService,
  OpenXiangdaBusinessDataApiService,
  OpenXiangdaBusinessDirectoryService,
  OpenXiangdaBusinessNotificationService,
  OpenXiangdaBusinessProcessService,
  OpenXiangdaDataApiService,
  InMemoryOpenXiangdaEventReceiptStore,
  OpenXiangdaEventController,
  OpenXiangdaEventHandler,
  OpenXiangdaEventReceiver,
  OpenXiangdaEventContext,
  OpenXiangdaEventRegistry,
  OpenXiangdaGatewayAssertionVerifier,
  OpenXiangdaGatewayTransportGuard,
  OpenXiangdaModule,
  OpenXiangdaNotificationService,
  OpenXiangdaOperation,
  OpenXiangdaPlatformController,
  OpenXiangdaPlatformClient,
  OpenXiangdaPlatformError,
  OpenXiangdaRuntimeLeaseService,
  OpenXiangdaRuntimeSecrets,
  OpenXiangdaStandardOperations,
  databaseNowAssertion,
  OpenXiangdaWorkflowService,
  PlatformOpenXiangdaEventReceiptStore,
  eventSigningSecretsFromEnvironment,
  currentUserFromVerifiedContext,
  normalizeWorkflowCandidates,
  OPENXIANGDA_OPERATION_CONTRACT,
  OPENXIANGDA_REQUIRED_CAPABILITY,
} from "../src/index.js";

const applicationRuntimeEnvironment = {
  OPENXIANGDA_APP_CODE: "reference-app",
  OPENXIANGDA_PLATFORM_BASE_URL: "http://127.0.0.1:7001",
  OPENXIANGDA_ENVIRONMENT_KEY: "local",
  OPENXIANGDA_ENVIRONMENT_ID: "local",
  OPENXIANGDA_APP_VERSION_ID: "local-worktree",
  OPENXIANGDA_DEPLOYMENT_RUN_ID: "connected-development",
  OPENXIANGDA_ENVIRONMENT_HEAD_REVISION: "1",
  OPENXIANGDA_BACKEND_REVISION_ID: "local-worktree",
  OPENXIANGDA_APP_VERSION: "0.1.0-test",
  OPENXIANGDA_CONNECTED_DEV: "false",
};
Object.assign(process.env, applicationRuntimeEnvironment);

test("builds database-time assertions without accepting a caller clock", () => {
  assert.deepEqual(databaseNowAssertion("publishAt", "lte"), {
    kind: "database-now",
    field: "publishAt",
    operator: "lte",
  });
  assert.throws(
    () => databaseNowAssertion(" ", "lte"),
    /OPENXIANGDA_DATABASE_NOW_FIELD_REQUIRED/
  );
});

const eventHandler = {
  code: "instrument-events",
  endpointPath: "/__platform/events/instrument-events",
  eventTypes: [
    "openxiangda.data.record.created.v2",
    "openxiangda.data.record.updated.v2",
  ],
  dataSchemaVersions: ["2.0.0"],
  maxBodyBytes: 65_536,
  receiptProtocolVersion: 2,
} satisfies AppEventHandlerContract;

const eventHandlerManifest = {
  schemaVersion: SCHEMA_VERSIONS.eventHandlerManifest,
  appCode: "reference-app",
  handlers: [eventHandler],
};

function eventBody(input: {
  id: string;
  type: string;
  recordId: string;
  data?: Record<string, unknown>;
}) {
  return JSON.stringify({
    specversion: "1.0",
    id: input.id,
    source: "/applications/reference-app",
    type: input.type,
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    data: {
      resourceCode: "instruments",
      recordId: input.recordId,
      operation: input.type.includes("created") ? "created" : "updated",
      revision: 1,
      changedFields: [],
      projection: {},
      actor: { principalType: "user_union", subjectId: "user-1" },
      cause: { eventId: null, subscriptionCode: null, depth: 0 },
      ...(input.data || {}),
    },
    tenantid: "tenant-1",
    appcode: "reference-app",
    environment: "preproduction",
    schemaversion: "2.0.0",
  });
}

function eventHeaders(
  body: string,
  secret: string,
  deliveryId: string,
  subscriptionCode = "instrument-events",
  manifest: Record<string, unknown> = eventHandlerManifest
) {
  const event = JSON.parse(body) as { id: string };
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signingKeyVersion = "1";
  const handlerManifestDigest = sha256Digest(manifest);
  const signature = createHmac("sha256", secret)
    .update(
      eventDeliverySignatureContentV2({
        timestamp,
        signingKeyVersion,
        deliveryId,
        eventId: event.id,
        subscriptionCode,
        handlerManifestDigest,
        rawBody: body,
      })
    )
    .digest("hex");
  return {
    "content-type": "application/cloudevents+json; charset=utf-8",
    "x-openxiangda-event-id": event.id,
    "x-openxiangda-subscription-code": subscriptionCode,
    "x-openxiangda-delivery-id": deliveryId,
    "x-openxiangda-timestamp": timestamp,
    "x-openxiangda-signing-key-version": signingKeyVersion,
    "x-openxiangda-handler-manifest-digest": handlerManifestDigest,
    "x-openxiangda-signature": `v2=${signature}`,
  };
}

function eventReceiverOptions(fetch = globalThis.fetch) {
  return {
    ...options(fetch),
    eventHandlerManifest,
  };
}

test("boots the official module in a real Nest dependency graph", async () => {
  const context = await NestFactory.createApplicationContext(
    OpenXiangdaModule.forApplication({}),
    { logger: false, abortOnError: false }
  );
  const requestContext = ContextIdFactory.create();
  context.registerRequestByContextId(
    { headers: { authorization: "Bearer test" } },
    requestContext
  );
  const operations = await context.resolve(
    OpenXiangdaStandardOperations,
    requestContext
  );
  assert.ok(operations instanceof OpenXiangdaStandardOperations);
  await context.close();
});

test("registers transport verification and operation authorization as ordered global guards", () => {
  const module = OpenXiangdaModule.forApplication({ fetch: globalThis.fetch });
  const globalGuards = (module.providers || [])
    .filter(
      (provider): provider is { provide: symbol; useExisting: unknown } =>
        typeof provider === "object" &&
        provider !== null &&
        "provide" in provider &&
        provider.provide === APP_GUARD &&
        "useExisting" in provider
    )
    .map(provider => provider.useExisting);

  assert.deepEqual(globalGuards, [
    OpenXiangdaGatewayTransportGuard,
    OpenXiangdaAuthzGuard,
  ]);
});

test("keeps Kubernetes readiness local and exposes platform checks separately", async () => {
  const capabilities = test.mock.fn(async () => ({
    platformVersion: "2.0.0-test.1",
    contractVersion: OPENXIANGDA_CONTRACT_VERSION,
  }));
  const controller = new OpenXiangdaPlatformController(
    options(async () => response(null)) as any,
    { capabilities } as any
  );

  assert.deepEqual(controller.ready(), {
    status: "ready",
    appCode: "reference-app",
    environmentKey: "preproduction",
    environmentId: "environment-1",
    appVersionId: "app-version-1",
    deploymentRunId: "deployment-run-1",
    environmentHeadRevision: 4,
    backendRevisionId: "backend-revision-1",
    contractVersion: OPENXIANGDA_CONTRACT_VERSION,
  });
  assert.equal(capabilities.mock.callCount(), 0);

  assert.deepEqual(await controller.platformDependency(), {
    status: "ready",
    dependency: "platform",
    platformVersion: "2.0.0-test.1",
    contractVersion: OPENXIANGDA_CONTRACT_VERSION,
  });
  assert.equal(capabilities.mock.callCount(), 1);

  const unavailable = new OpenXiangdaPlatformController(
    options(async () => response(null)) as any,
    {
      capabilities: async () => {
        throw new Error("control plane unavailable");
      },
    } as any
  );
  await assert.rejects(
    () => unavailable.platformDependency(),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.equal(error.getStatus(), 503);
      return true;
    }
  );
});

test("loads only declared event secrets from deterministic runtime names", () => {
  assert.deepEqual(
    eventSigningSecretsFromEnvironment(
      ["instrument-events", "daily-summary-events", "instrument-events"],
      {
        OPENXIANGDA_EVENT_SECRET_INSTRUMENT_EVENTS: "active-instrument",
        OPENXIANGDA_EVENT_SECRET_INSTRUMENT_EVENTS_NEXT: "next-instrument",
        OPENXIANGDA_EVENT_SECRET_DAILY_SUMMARY_EVENTS: "active-summary",
        OPENXIANGDA_EVENT_SECRET_UNDECLARED: "must-not-load",
      }
    ),
    {
      "daily-summary-events": ["active-summary"],
      "instrument-events": ["next-instrument", "active-instrument"],
    }
  );
});

test("production rejects custom or in-memory event receipt stores", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(
      () =>
        OpenXiangdaModule.forApplication({
          fetch: globalThis.fetch,
          eventReceiptStore: new InMemoryOpenXiangdaEventReceiptStore(),
        }),
      /生产必须使用平台持久 receipt/
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("event registry fails fast on missing, duplicate and manifest-mismatched handlers", () => {
  class CorrectHandler {
    handle() {}
  }
  OpenXiangdaEventHandler(eventHandler)(CorrectHandler);

  class DuplicateHandler {
    handle() {}
  }
  OpenXiangdaEventHandler(eventHandler)(DuplicateHandler);

  class MismatchedHandler {
    handle() {}
  }
  OpenXiangdaEventHandler({
    ...eventHandler,
    eventTypes: ["openxiangda.data.record.created.v2"],
  })(MismatchedHandler);

  const registry = (providers: Array<Record<string, unknown>>, manifest = eventHandlerManifest) =>
    new OpenXiangdaEventRegistry(
      { getProviders: () => providers.map(provider => ({
        ...provider,
        host: { getProviderByKey: () => ({ instance: {} }) },
        isDependencyTreeStatic: () => true,
      })) } as any,
      new Reflector(),
      { ...options(globalThis.fetch), eventHandlerManifest: manifest }
    );

  assert.throws(() => registry([]).onModuleInit(), /handler 未注册/);
  assert.throws(
    () =>
      registry([
        { metatype: CorrectHandler, instance: new CorrectHandler() },
        { metatype: DuplicateHandler, instance: new DuplicateHandler() },
      ]).onModuleInit(),
    /重复注册/
  );
  assert.throws(
    () =>
      registry([
        { metatype: MismatchedHandler, instance: new MismatchedHandler() },
      ]).onModuleInit(),
    /generated manifest 不一致/
  );
  assert.doesNotThrow(() =>
    registry([], {
      schemaVersion: SCHEMA_VERSIONS.eventHandlerManifest,
      appCode: "reference-app",
      handlers: [],
    }).onModuleInit()
  );
});

const principal: NativePrincipal = {
  schemaVersion: SCHEMA_VERSIONS.nativePrincipal,
  tenantId: "tenant-1",
  appCode: "reference-app",
  environmentId: "environment-1",
  environmentKey: "preproduction",
  activeAppVersionId: "app-version-1",
  environmentHeadRevision: 4,
  principalType: "user" as const,
  subjectId: "user-1",
  userId: "user-1",
  displayName: "王老师",
  loginSessionId: "login-session-1",
  subjectKind: "role_union" as const,
  roleCodes: ["college_admin", "instrument_admin"],
  authzRevisionId: "authz-revision-1",
  authzVersion: 3,
  scopeDataVersion: "8",
  authorizationDigest: "a".repeat(64),
  isAppSuperAdmin: false,
  capabilities: ["app:reference-app:reservation:create"],
  expiresAt: "2026-08-11T00:00:00.000Z",
};

const roleUnionPrincipal: NativePrincipal = {
  ...principal,
  capabilities: [
    "app:reference-app:data:instruments:read",
    "app:reference-app:data:instruments:update",
  ],
  // The platform binds this to the earliest membership validTo boundary.
  expiresAt: "2026-08-21T12:00:00.000Z",
};

const applicationPrincipal = {
  principalType: "application" as const,
  clientRecordId: "client-record-1",
  clientId: "client-1",
  credentialVersion: 2,
  tenantId: "tenant-1",
  appCode: "reference-app",
  environmentKey: "preproduction",
  environmentId: "environment-1",
  appVersionId: "app-version-1",
  deploymentRunId: "deployment-run-1",
  headRevision: 4,
  scopes: ["app:invoke", "app:reference-app:reservation:create"],
  rateLimitPerMinute: 600,
  tokenId: "token-1",
};

function response<T>(data: T, status = 200) {
  return new Response(
    JSON.stringify({
      code: status,
      message: status < 400 ? "success" : "failed",
      data,
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

function options(fetch: typeof globalThis.fetch) {
  return {
    appCode: "reference-app",
    platformBaseUrl: "https://platform.example/",
    environmentKey: "preproduction",
    environmentId: "environment-1",
    appVersionId: "app-version-1",
    deploymentRunId: "deployment-run-1",
    environmentHeadRevision: 4,
    backendRevisionId: "backend-revision-1",
    version: "2.0.0-test.1",
    fetch,
  };
}

test("verifies a Gateway invocation with the current user role union", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(
    options(async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        schemaVersion: SCHEMA_VERSIONS.gatewayInvocationPrincipal,
        target: gatewayTarget,
        principal: roleUnionPrincipal,
        invocationTokenId: "invocation-role-union-1",
      });
    })
  );

  const verified = await client.verifyGatewayInvocation(
    "Bearer invocation-token",
    "signed-assertion"
  );
  assert.equal(verified.principal.subjectKind, "role_union");
  const headers = new Headers(requests[0]!.init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer invocation-token");
  assert.equal(
    headers.get("X-OpenXiangda-Gateway-Assertion"),
    "signed-assertion"
  );
  assert.equal(
    requests[0]!.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/invocations/verify"
  );
});

test("queries original process commands with current identity and encoded bounded filters", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(options(async (input, init) => {
    requests.push({ url: String(input), init });
    return response({ schemaVersion: SCHEMA_VERSIONS.businessProcessCommandList, items: [], nextCursor: null });
  }));
  await client.listBusinessProcessCommands('Bearer invocation-token', {
    environmentKey: 'preproduction', resourceCode: 'records', recordId: 'record/1',
    workflowCode: 'review', operationCode: 'submit', pageSize: 2, beforeCommandId: 'command/1',
  }, { code: 'records.read-process', requiredCapability: 'app:reference-app:process:read' });
  const url = new URL(requests[0]!.url);
  assert.equal(url.pathname, '/openxiangda-api/v2/applications/reference-app/business-process/commands');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    environmentKey: 'preproduction', resourceCode: 'records', recordId: 'record/1',
    workflowCode: 'review', operationCode: 'submit', pageSize: '2', beforeCommandId: 'command/1',
  });
  assert.equal(new Headers(requests[0]!.init?.headers).get('Authorization'), 'Bearer invocation-token');
  assert.equal(requests[0]!.init?.body, undefined);
  assert.equal(requests[0]!.init?.method ?? 'GET', 'GET');
});

test("posts operation proof to the current-initiator directory endpoint", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(
    options(async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        schemaVersion:
          "openxiangda.current-initiator-directory-snapshot/v2",
        userId: "user-1",
        displayName: "王老师",
        snapshotRevision: "c".repeat(64),
        resolvedAt: "2026-08-29T08:00:00.000Z",
      });
    })
  );

  await client.resolveCurrentInitiator("Bearer invocation-token", {
    code: "welfare.save",
    requiredCapability: "app:reference-app:welfare:save",
  });

  assert.equal(
    requests[0]!.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/directory/current-initiator?environmentKey=preproduction"
  );
  const headers = new Headers(requests[0]!.init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer invocation-token");
  assert.equal(
    headers.get("X-OpenXiangda-Business-Action-Code"),
    "welfare.save"
  );
  assert.deepEqual(JSON.parse(String(requests[0]!.init?.body)), {
    schemaVersion: "openxiangda.current-initiator-directory-request/v2",
  });
});

test("posts advanced DingTalk cards to the platform-owned Notification Hub binding", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(
    options(async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        id: "message-1",
        schemaVersion: "openxiangda.notification.message/v2",
        state: "informational",
      });
    })
  );

  await client.sendAdvancedDingTalkCard("Bearer user-token", {
    schemaVersion: OPENXIANGDA_NOTIFICATION_DINGTALK_ADVANCED_CARD_SEND_V2,
    bindingCode: "dingtalk_card_advanced",
    idempotencyKey: "purchase-card:request-42",
    title: "采购申请已创建",
    recipients: [{ userId: "user-2" }],
    cardTemplateId: "purchase-result-v2",
    cardParamMap: { applicant: "张三" },
    navigationTarget: {
      kind: "APP_ROUTE",
      appCode: "reference-app",
      routeCodes: {
        desktop: "purchase.detail",
        mobile: "purchase.detail-mobile",
      },
      pathParams: { id: "request-42" },
      access: "AUTHENTICATED",
    },
  });

  assert.equal(
    requests[0]!.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/notification-hub/send/dingtalk-card"
  );
  assert.equal(
    new Headers(requests[0]!.init?.headers).get("Authorization"),
    "Bearer user-token"
  );
  assert.deepEqual(JSON.parse(String(requests[0]!.init?.body)), {
    schemaVersion: OPENXIANGDA_NOTIFICATION_DINGTALK_ADVANCED_CARD_SEND_V2,
    environmentKey: "preproduction",
    bindingCode: "dingtalk_card_advanced",
    idempotencyKey: "purchase-card:request-42",
    title: "采购申请已创建",
    recipients: [{ userId: "user-2" }],
    cardTemplateId: "purchase-result-v2",
    cardParamMap: { applicant: "张三" },
    navigationTarget: {
      kind: "APP_ROUTE",
      appCode: "reference-app",
      routeCodes: {
        desktop: "purchase.detail",
        mobile: "purchase.detail-mobile",
      },
      pathParams: { id: "request-42" },
      access: "AUTHENTICATED",
    },
  });
});

test("posts channel-neutral application notifications with platform-owned environment scope", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(
    options(async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        id: "message-standard-1",
        schemaVersion: "openxiangda.notification.message/v2",
        state: "informational",
      });
    })
  );

  await client.sendNotification("Bearer user-token", {
    schemaVersion: OPENXIANGDA_NOTIFICATION_APPLICATION_SEND_V2,
    correlationId: "purchase:request-42",
    messageKey: "purchase:request-42:applicant",
    sourceSequence: 2,
    templateCode: "purchase.status.standard",
    state: "informational",
    recipients: [{ userId: "user-2" }],
    variables: { applicant: "张三", amount: 28600, status: "已提交" },
    navigationTarget: {
      kind: "APP_ROUTE",
      appCode: "reference-app",
      routeCodes: {
        desktop: "purchase.detail",
        mobile: "purchase.detail-mobile",
      },
      pathParams: { id: "request-42" },
      access: "AUTHENTICATED",
    },
    idempotencyKey: "purchase:request-42:revision:2",
  });

  assert.equal(
    requests[0]!.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/notification-hub/send"
  );
  assert.equal(
    new Headers(requests[0]!.init?.headers).get("Authorization"),
    "Bearer user-token"
  );
  assert.deepEqual(JSON.parse(String(requests[0]!.init?.body)), {
    schemaVersion: OPENXIANGDA_NOTIFICATION_APPLICATION_SEND_V2,
    environmentKey: "preproduction",
    correlationId: "purchase:request-42",
    messageKey: "purchase:request-42:applicant",
    sourceSequence: 2,
    templateCode: "purchase.status.standard",
    state: "informational",
    recipients: [{ userId: "user-2" }],
    variables: { applicant: "张三", amount: 28600, status: "已提交" },
    navigationTarget: {
      kind: "APP_ROUTE",
      appCode: "reference-app",
      routeCodes: {
        desktop: "purchase.detail",
        mobile: "purchase.detail-mobile",
      },
      pathParams: { id: "request-42" },
      access: "AUTHENTICATED",
    },
    idempotencyKey: "purchase:request-42:revision:2",
  });
  assert.equal("tenantId" in JSON.parse(String(requests[0]!.init?.body)), false);
  assert.equal("source" in JSON.parse(String(requests[0]!.init?.body)), false);
});

test("uses the canonical launch Surface and current-user application todo routes", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(
    options(async (input, init) => {
      requests.push({ url: String(input), init });
      return response({ items: [], total: 0 });
    })
  );

  await client.workflowLaunchSurface("Bearer user-token", "purchase-approval");
  await client.applicationTodos("Bearer user-token", {
    view: "informational",
    unread: true,
    keyword: "采购",
    limit: 12,
    offset: 24,
  });
  await client.recordApplicationTodoInteraction(
    "Bearer user-token",
    "11111111-1111-4111-8111-111111111111",
    "click"
  );

  assert.equal(
    requests[0]!.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/workflow/definitions/purchase-approval/launch-surface?environmentKey=preproduction"
  );
  assert.equal(
    requests[1]!.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/todos?environmentKey=preproduction&view=informational&limit=12&offset=24&unread=true&keyword=%E9%87%87%E8%B4%AD"
  );
  assert.equal(
    requests[2]!.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/todos/11111111-1111-4111-8111-111111111111/interactions"
  );
  assert.equal(new Headers(requests[0]!.init?.headers).get("Authorization"), "Bearer user-token");
  assert.deepEqual(JSON.parse(String(requests[2]!.init?.body)), {
    environmentKey: "preproduction",
    kind: "click",
  });
});

test("posts business notifications with immutable Named Action proof", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(
    options(async (input, init) => {
      requests.push({ url: String(input), init });
      return response({
        id: "message-business-1",
        schemaVersion: "openxiangda.notification.message/v2",
        state: "informational",
      });
    })
  );

  await client.sendBusinessNotification(
    "Bearer invocation-token",
    {
      schemaVersion: OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2,
      eventId: "11111111-1111-4111-8111-111111111111",
      correlationId: "purchase:request-42",
      messageKey: "purchase:request-42:applicant",
      sourceSequence: 2,
      recipients: [{ userId: "user-2" }],
      title: "采购申请已创建",
      summary: "点击查看申请详情",
      navigationTarget: {
        kind: "APP_ROUTE",
        appCode: "reference-app",
        routeCodes: {
          desktop: "purchase.detail",
          mobile: "purchase.detail-mobile",
        },
        pathParams: { id: "request-42" },
        access: "AUTHENTICATED",
      },
      idempotencyKey: "purchase:request-42:revision:2",
    },
    {
      code: "purchase.submit",
      requiredCapability: "app:reference-app:purchase:submit",
      connectedDevelopmentSessionToken: "dev-session-token",
    }
  );

  assert.equal(
    requests[0]!.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/notification-hub/send/business-action"
  );
  const headers = new Headers(requests[0]!.init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer invocation-token");
  assert.equal(
    headers.get("X-OpenXiangda-Business-Action-Code"),
    "purchase.submit"
  );
  assert.equal(
    headers.get("X-OpenXiangda-Business-Action-Capability"),
    "app:reference-app:purchase:submit"
  );
  assert.equal(headers.get("X-OpenXiangda-Dev-Session"), "dev-session-token");
  assert.deepEqual(JSON.parse(String(requests[0]!.init?.body)), {
    schemaVersion: OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2,
    eventId: "11111111-1111-4111-8111-111111111111",
    correlationId: "purchase:request-42",
    messageKey: "purchase:request-42:applicant",
    sourceSequence: 2,
    recipients: [{ userId: "user-2" }],
    title: "采购申请已创建",
    summary: "点击查看申请详情",
    navigationTarget: {
      kind: "APP_ROUTE",
      appCode: "reference-app",
      routeCodes: {
        desktop: "purchase.detail",
        mobile: "purchase.detail-mobile",
      },
      pathParams: { id: "request-42" },
      access: "AUTHENTICATED",
    },
    idempotencyKey: "purchase:request-42:revision:2",
    environmentKey: "preproduction",
  });
});

test("maps platform denials to stable Nest HTTP errors", async () => {
  const client = new OpenXiangdaPlatformClient(
    options(async () => response(null, 403))
  );
  await assert.rejects(
    () => client.capabilities(),
    (error: unknown) => {
      assert.ok(error instanceof OpenXiangdaPlatformError);
      assert.equal(error.getStatus(), 403);
      assert.equal(error.code, "PLATFORM_REQUEST_FAILED");
      return true;
    }
  );
});

test("runtime platform client uses the exact Native lease and Secret routes", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(
    options(async (input, init) => {
      requests.push({ url: String(input), init });
      if (String(input).endsWith("/lease")) {
        return response({
          schemaVersion: SCHEMA_VERSIONS.runtimeLeaseResult,
          granted: true,
          released: false,
          leaseToken: "lease-token",
          expiresAt: "2026-08-15T00:00:30.000Z",
          retryAfterMs: 0,
          target: {
            environmentId: "environment-1",
            appVersionId: "app-version-1",
            deploymentRunId: "deployment-run-1",
            headRevision: 4,
          },
        });
      }
      return response({
        schemaVersion: SCHEMA_VERSIONS.runtimeSecretValues,
        items: [
          {
            name: "integration-key",
            env: "INTEGRATION_KEY",
            value: "secret-value",
            version: 2,
            revision: 3,
          },
        ],
        target: {
          environmentId: "environment-1",
          appVersionId: "app-version-1",
          deploymentRunId: "deployment-run-1",
          headRevision: 4,
        },
      });
    })
  );

  await client.commandRuntimeLease("Bearer runtime-token", {
    action: "acquire",
    holderId: "pod-a",
  });
  await client.resolveRuntimeSecrets("Bearer runtime-token", [
    "integration-key",
  ]);
  assert.equal(
    requests[0]!.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/runtime/lease"
  );
  assert.equal(
    requests[1]!.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/runtime/secrets/resolve"
  );
  assert.equal(
    new Headers(requests[1]!.init?.headers).get("Authorization"),
    "Bearer runtime-token"
  );
});

test("runtime platform client uses only Native Data API routes", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(
    options(async (input, init) => {
      requests.push({ url: String(input), init });
      return response({ items: [], total: 0, limit: 20, offset: 0 });
    })
  );

  await client.queryData(
    "Bearer runtime-token",
    "instrument-admin",
    "instruments",
    { schemaVersion: SCHEMA_VERSIONS.dataQuery, limit: 20 }
  );
  await client.transactData("Bearer runtime-token", null, {
    schemaVersion: SCHEMA_VERSIONS.dataTransaction,
    idempotencyKey: "native-transaction-1",
    operations: [
      {
        operation: "create",
        resourceCode: "instruments",
        data: { name: "Microscope" },
      },
    ],
  });

  assert.equal(
    requests[0]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/data/instruments/query"
  );
  assert.equal(
    requests[1]?.url,
    "https://platform.example/openxiangda-api/v2/applications/reference-app/native/data/transactions"
  );
});

test("business action Data API sends guarded operation proof", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(
    options(async (input, init) => {
      requests.push({ url: String(input), init });
      return response({ items: [], total: 0, limit: 20, offset: 0 });
    })
  );
  await client.queryData(
    "Bearer invocation-token",
    null,
    "instruments",
    { schemaVersion: SCHEMA_VERSIONS.dataQuery, limit: 20 },
    {
      code: "reservation.create",
      requiredCapability: "app:reference-app:reservation:create",
      requestId: "request-reservation-create-1",
      connectedDevelopmentSessionToken: "dev-session-token",
    }
  );

  const headers = new Headers(requests[0]!.init?.headers);
  assert.equal(
    headers.get("X-OpenXiangda-Business-Action-Code"),
    "reservation.create"
  );
  assert.equal(
    headers.get("X-OpenXiangda-Business-Action-Capability"),
    "app:reference-app:reservation:create"
  );
  assert.equal(headers.get("X-OpenXiangda-Dev-Session"), "dev-session-token");
  assert.equal(headers.get("X-Request-ID"), "request-reservation-create-1");
});

test("event context propagates causation and trace headers to Native Data API", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const eventContext = new OpenXiangdaEventContext();
  const client = new OpenXiangdaPlatformClient(
    options(async (input, init) => {
      requests.push({ url: String(input), init });
      return response({ items: [], total: 0, limit: 20, offset: 0 });
    }),
    eventContext
  );
  const event = JSON.parse(
    eventBody({
      id: "event-causation",
      type: "openxiangda.data.record.updated.v2",
      recordId: "record-causation",
    })
  );
  event.traceid = "trace-causation";
  event.data.cause.depth = 2;

  await eventContext.run(
    event,
    "delivery-causation",
    "instrument-events",
    async context => {
      assert.equal(context.idempotencyKey, "event-causation");
      assert.equal(context.causationDepth, 3);
      await client.queryData(
        "Bearer runtime-token",
        null,
        "instruments",
        { schemaVersion: SCHEMA_VERSIONS.dataQuery, limit: 20 }
      );
    }
  );

  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(
    headers.get("X-OpenXiangda-Causation-Event-Id"),
    "event-causation"
  );
  assert.equal(
    headers.get("X-OpenXiangda-Origin-Subscription-Code"),
    "instrument-events"
  );
  assert.equal(
    headers.get("X-OpenXiangda-Origin-Delivery-Id"),
    "delivery-causation"
  );
  assert.equal(headers.get("X-OpenXiangda-Causation-Depth"), "3");
  assert.equal(headers.get("X-OpenXiangda-Trace-Id"), "trace-causation");
  assert.equal(eventContext.current(), null);
});

test("binds every Native Data request to the module environment", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(
    options(async (input, init) => {
      requests.push({ url: String(input), init });
      return response({ items: [], total: 0, limit: 20, offset: 0 });
    })
  );
  const authorization = "Bearer runtime-token";
  const perspectiveCode = "instrument-admin";

  await client.queryData(authorization, perspectiveCode, "instruments", {
    schemaVersion: SCHEMA_VERSIONS.dataQuery,
    limit: 20,
  });
  await client.getData(authorization, perspectiveCode, "instruments", "row-1");
  await client.aggregateData(authorization, perspectiveCode, "instruments", {
    schemaVersion: SCHEMA_VERSIONS.dataAggregateQuery,
    dimensions: [],
    measures: [{ type: "count", as: "total" }],
  });
  await client.dataAudit(
    authorization,
    perspectiveCode,
    "instruments",
    "row-1",
    { limit: 5 }
  );
  await client.initiateDataFileUpload(
    authorization,
    perspectiveCode,
    "instruments",
    { fieldCode: "attachments", fileName: "manual.pdf", fileSize: 12 }
  );
  await client.completeDataFileUpload(
    authorization,
    perspectiveCode,
    "instruments",
    "file-1"
  );
  await client.createData(authorization, perspectiveCode, "instruments", {
    name: "Microscope",
  });
  await client.updateData(
    authorization,
    perspectiveCode,
    "instruments",
    "row-1",
    { expectedRevision: 1, data: { name: "Microscope 2" } }
  );
  await client.deleteData(
    authorization,
    perspectiveCode,
    "instruments",
    "row-1",
    2
  );
  await client.transactData(authorization, perspectiveCode, {
    schemaVersion: SCHEMA_VERSIONS.dataTransaction,
    idempotencyKey: "environment-closure",
    operations: [],
    environmentKey: "production",
  } as never);

  assert.equal(requests.length, 10);
  for (const index of [0, 2, 4, 5, 6, 7, 8, 9]) {
    const body = JSON.parse(String(requests[index]!.init?.body || "{}"));
    assert.equal(body.environmentKey, "preproduction");
  }
  assert.equal(
    new URL(requests[1]!.url).searchParams.get("environmentKey"),
    "preproduction"
  );
  assert.equal(
    new URL(requests[3]!.url).searchParams.get("environmentKey"),
    "preproduction"
  );
});

test("runtime Secret service caches logical names and exposes declared env names", async () => {
  let available = true;
  const platform = {
    resolveRuntimeSecrets: test.mock.fn(async () => ({
      schemaVersion: SCHEMA_VERSIONS.runtimeSecretValues,
      items: available
        ? [
            {
              name: "integration-key",
              env: "INTEGRATION_KEY",
              value: "secret-value",
              version: 2,
              revision: 3,
            },
          ]
        : [],
      target: {
        environmentId: "environment-1",
        appVersionId: "app-version-1",
        deploymentRunId: "deployment-run-1",
        headRevision: 4,
      },
    })),
  };
  const credentials = {
    withAuthorization: async (operation: (authorization: string) => unknown) =>
      await operation("Bearer runtime-token"),
  };
  const secrets = new OpenXiangdaRuntimeSecrets(
    credentials as any,
    platform as any
  );

  assert.equal(await secrets.get("integration-key"), "secret-value");
  assert.equal(await secrets.get("integration-key"), "secret-value");
  assert.equal(platform.resolveRuntimeSecrets.mock.callCount(), 1);
  assert.deepEqual(await secrets.environment(["integration-key"]), {
    INTEGRATION_KEY: "secret-value",
  });
  assert.equal(secrets.activeTarget()?.headRevision, 4);

  available = false;
  await secrets.resolve(["integration-key"]);
  assert.equal(await secrets.get("integration-key"), undefined);
  assert.equal(platform.resolveRuntimeSecrets.mock.callCount(), 4);
});

test("runtime lease service elects one holder and releases it on Nest shutdown", async () => {
  const commands: Array<Record<string, unknown>> = [];
  const platform = {
    commandRuntimeLease: test.mock.fn(
      async (_authorization: string, command: Record<string, unknown>) => {
        commands.push(command);
        const released = command.action === "release";
        return {
          schemaVersion: SCHEMA_VERSIONS.runtimeLeaseResult,
          granted: !released,
          released,
          leaseToken: released ? null : "lease-token",
          expiresAt: released
            ? null
            : new Date(Date.now() + 30_000).toISOString(),
          retryAfterMs: 0,
          target: {
            environmentId: "environment-1",
            appVersionId: "app-version-1",
            deploymentRunId: "deployment-run-1",
            headRevision: 4,
          },
        };
      }
    ),
  };
  const credentials = {
    configured: () => true,
    withAuthorization: async (operation: (authorization: string) => unknown) =>
      await operation("Bearer runtime-token"),
  };
  const lease = new OpenXiangdaRuntimeLeaseService(
    credentials as any,
    platform as any,
    { ...options(globalThis.fetch), runtimeInstanceId: "pod-test" }
  );
  lease.onApplicationBootstrap();
  for (let attempt = 0; attempt < 20 && !lease.isActive(); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(lease.isActive(), true);
  assert.equal(lease.state().holderId, "pod-test");
  await lease.onApplicationShutdown();
  assert.equal(commands[0]!.action, "acquire");
  assert.equal(commands.at(-1)!.action, "release");
  assert.equal(lease.isActive(), false);
});

test("runtime lease waits for pending OAuth identity activation instead of stopping", async () => {
  let authorizationAttempts = 0;
  const credentials = {
    configured: () => true,
    withAuthorization: async (
      operation: (authorization: string) => unknown
    ) => {
      authorizationAttempts += 1;
      if (authorizationAttempts === 1) {
        throw new OpenXiangdaPlatformError(
          401,
          "APPLICATION_OAUTH_INVALID_CLIENT",
          "candidate identity is pending"
        );
      }
      return await operation("Bearer active-runtime-token");
    },
  };
  const platform = {
    commandRuntimeLease: test.mock.fn(
      async (_authorization: string, command: Record<string, unknown>) => ({
        schemaVersion: SCHEMA_VERSIONS.runtimeLeaseResult,
        granted: command.action !== "release",
        released: command.action === "release",
        leaseToken: command.action === "release" ? null : "lease-token",
        expiresAt:
          command.action === "release"
            ? null
            : new Date(Date.now() + 30_000).toISOString(),
        retryAfterMs: 0,
        target: {
          environmentId: "environment-1",
          appVersionId: "app-version-1",
          deploymentRunId: "deployment-run-1",
          headRevision: 4,
        },
      })
    ),
  };
  const lease = new OpenXiangdaRuntimeLeaseService(
    credentials as any,
    platform as any,
    { ...options(globalThis.fetch), runtimeInstanceId: "pod-pending" }
  );
  let delayCalls = 0;
  (lease as any).delay = async () => {
    delayCalls += 1;
    if (delayCalls === 1) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  };
  lease.onApplicationBootstrap();
  for (let attempt = 0; attempt < 20 && !lease.isActive(); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.equal(authorizationAttempts >= 2, true);
  assert.equal(lease.isActive(), true);
  await lease.onApplicationShutdown();
});

const gatewayTarget = {
  tenantId: "tenant-1",
  appCode: "reference-app",
  environmentId: "environment-1",
  environmentKey: "preproduction" as const,
  appVersionId: "app-version-1",
  deploymentRunId: "deployment-run-1",
  headRevision: 4,
  backendRevisionId: "backend-revision-1",
};

const roleUnionGatewayInvocationFixture = {
  schemaVersion: SCHEMA_VERSIONS.gatewayInvocationPrincipal,
  target: gatewayTarget,
  principal: roleUnionPrincipal,
  invocationTokenId: "invocation-role-union-1",
} satisfies GatewayInvocationPrincipal;

function userGatewayContext() {
  return {
    ...roleUnionGatewayInvocationFixture,
    authorization: "Bearer invocation-token",
    perspectiveCode: "instrument-admin",
  };
}

function applicationGatewayContext() {
  return {
    schemaVersion: SCHEMA_VERSIONS.gatewayInvocationPrincipal,
    target: gatewayTarget,
    principal: applicationPrincipal,
    invocationTokenId: "invocation-application-1",
    authorization: "Bearer application-invocation-token",
    perspectiveCode: null,
  };
}

function httpContext(request: any) {
  return {
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

test("authz guard consumes only the verified Gateway role union", async () => {
  const request: any = {
    headers: {},
    openxiangdaInvocation: userGatewayContext(),
  };
  const platform = {
    authorize: test.mock.fn(async () => ({
      schemaVersion: SCHEMA_VERSIONS.authorizationDecision,
      explainId: "explain-1",
      allowed: true,
      principal,
      decisions: [{ layer: "rbac" as const, allowed: true }],
    })),
  };
  const reflector = {
    getAllAndOverride: () => "app:reference-app:data:instruments:update",
  };
  const guard = new OpenXiangdaAuthzGuard(reflector as any);

  await assert.doesNotReject(() => guard.canActivate(httpContext(request)));
  assert.equal(request.openxiangda.principal.subjectId, "user-1");
  assert.equal(platform.authorize.mock.callCount(), 0);
});

test("authz guard rejects requests that did not pass the global Gateway guard", async () => {
  const request: any = { headers: { authorization: "Bearer caller-token" } };
  const guard = new OpenXiangdaAuthzGuard(
    { getAllAndOverride: () => undefined } as any
  );

  await assert.rejects(
    () => guard.canActivate(httpContext(request)),
    /OPENXIANGDA_GATEWAY_CONTEXT_REQUIRED/
  );
});

test("authz guard leaves SDK infrastructure controllers to their transport protocols", async () => {
  const guard = new OpenXiangdaAuthzGuard(
    { getAllAndOverride: () => undefined } as any
  );
  for (const controller of [
    OpenXiangdaPlatformController,
    OpenXiangdaEventController,
    OpenXiangdaAssigneeProviderController,
  ]) {
    const context = {
      getType: () => "http",
      getClass: () => controller,
      getHandler: () => function handler() {},
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    await assert.doesNotReject(() => guard.canActivate(context));
  }
});

test("authz guard maps the verified application invocation and enforces its exact scope", async () => {
  const request: any = {
    headers: {},
    openxiangdaInvocation: applicationGatewayContext(),
  };
  const platform = {
    authorize: test.mock.fn(),
  };
  const reflector = {
    getAllAndOverride: () => "app:reference-app:reservation:create",
  };
  const guard = new OpenXiangdaAuthzGuard(reflector as any);

  await assert.doesNotReject(() => guard.canActivate(httpContext(request)));
  assert.equal(request.openxiangda.principal.principalType, "service");
  assert.equal(request.openxiangda.principal.subjectId, "client-1");
  assert.equal(request.openxiangda.principal.deploymentRunId, "deployment-run-1");
  assert.equal(request.openxiangda.perspectiveCode, null);
  assert.equal(platform.authorize.mock.callCount(), 0);
});

test("authz guard rejects application invocations on routes without a capability contract", async () => {
  const request: any = {
    headers: {},
    openxiangdaInvocation: applicationGatewayContext(),
  };
  const guard = new OpenXiangdaAuthzGuard(
    { getAllAndOverride: () => undefined } as any
  );

  await assert.rejects(
    () => guard.canActivate(httpContext(request)),
    (error: any) => {
      assert.equal(
        error.getResponse().code,
        "OPENXIANGDA_SERVICE_CAPABILITY_REQUIRED"
      );
      return true;
    }
  );
});

const gatewaySigningKeys = generateKeyPairSync("ed25519");
const gatewaySigningKeyId = "gateway-test-key";

function gatewayAssertion(input: {
  method: string;
  path: string;
  query: string;
  body: Buffer;
  token: string;
  perspectiveCode?: string | null;
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({
      alg: "EdDSA",
      typ: "openxiangda-gateway+jws",
      kid: gatewaySigningKeyId,
    })
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      assertion_contract: "native-2",
      iss: "openxiangda-platform-gateway",
      aud: "openxiangda-app-backend",
      tenant_id: gatewayTarget.tenantId,
      app_code: gatewayTarget.appCode,
      environment_id: gatewayTarget.environmentId,
      environment_key: gatewayTarget.environmentKey,
      app_version_id: gatewayTarget.appVersionId,
      deployment_run_id: gatewayTarget.deploymentRunId,
      head_revision: gatewayTarget.headRevision,
      backend_revision_id: gatewayTarget.backendRevisionId,
      method: input.method,
      normalized_path: input.path,
      canonical_query_digest: sha256(input.query),
      body_digest: sha256(input.body),
      invocation_token_digest: sha256(input.token),
      perspective_code: input.perspectiveCode ?? null,
      jti: "assertion-test-1",
      iat: now,
      nbf: now - 2,
      exp: now + 30,
    })
  ).toString("base64url");
  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${sign(
    null,
    Buffer.from(signingInput),
    gatewaySigningKeys.privateKey
  ).toString("base64url")}`;
}

function gatewayPlatform(invocation: any = {
  ...roleUnionGatewayInvocationFixture,
}) {
  const publicJwk = gatewaySigningKeys.publicKey.export({
    format: "jwk",
  }) as JsonWebKey;
  return {
    gatewayAssertionKeys: test.mock.fn(async () => ({
      schemaVersion: SCHEMA_VERSIONS.gatewayAssertionJwks,
      keys: [
        {
          kty: "OKP",
          crv: "Ed25519",
          x: String(publicJwk.x),
          use: "sig",
          alg: "EdDSA",
          kid: gatewaySigningKeyId,
        },
      ],
    })),
    verifyGatewayInvocation: test.mock.fn(async () => invocation),
  };
}

test("global Gateway guard binds a request to the active deployment before business guards", async () => {
  const token = "invocation-token";
  const body = Buffer.from(JSON.stringify({ value: 1 }));
  const assertion = gatewayAssertion({
    method: "POST",
    path: "/api/reservations/draft",
    query: "a=1&z=2",
    body,
    token,
  });
  const request: any = {
    method: "POST",
    url: "/api/reservations/draft?z=2&a=1",
    rawBody: body,
    headers: {
      authorization: `Bearer ${token}`,
      "x-openxiangda-gateway-assertion": assertion,
    },
  };
  const platform = gatewayPlatform();
  const moduleOptions = options(globalThis.fetch);
  const verifier = new OpenXiangdaGatewayAssertionVerifier(
    platform as any,
    moduleOptions
  );
  const guard = new OpenXiangdaGatewayTransportGuard(
    verifier,
    platform as any,
    moduleOptions
  );

  await assert.doesNotReject(() => guard.canActivate(httpContext(request)));
  assert.equal(request.openxiangdaInvocation.target.deploymentRunId, "deployment-run-1");
  assert.equal(platform.verifyGatewayInvocation.mock.callCount(), 1);
  assert.equal(platform.gatewayAssertionKeys.mock.callCount(), 1);
});

test("signed Gateway role union flows through transport, AuthzGuard and CurrentUser", async () => {
  const token = "role-union-invocation-token";
  const body = Buffer.alloc(0);
  const assertion = gatewayAssertion({
    method: "GET",
    path: "/api/instruments/context",
    query: "",
    body,
    token,
  });
  const request: any = {
    method: "GET",
    url: "/api/instruments/context",
    rawBody: body,
    headers: {
      authorization: `Bearer ${token}`,
      "x-openxiangda-gateway-assertion": assertion,
    },
  };
  const platform = gatewayPlatform(roleUnionGatewayInvocationFixture);
  const moduleOptions = options(globalThis.fetch);
  const transport = new OpenXiangdaGatewayTransportGuard(
    new OpenXiangdaGatewayAssertionVerifier(platform as any, moduleOptions),
    platform as any,
    moduleOptions
  );
  await transport.canActivate(httpContext(request));

  const authz = new OpenXiangdaAuthzGuard(
    {
      getAllAndOverride: () =>
        "app:reference-app:data:instruments:update",
    } as any
  );
  await authz.canActivate(httpContext(request));

  assert.equal(request.openxiangda.perspectiveCode, null);
  assert.deepEqual(currentUserFromVerifiedContext(request.openxiangda), {
    userId: "user-1",
    displayName: "王老师",
    appCode: "reference-app",
    environmentKey: "preproduction",
    roleCodes: ["college_admin", "instrument_admin"],
    isAppSuperAdmin: false,
    capabilityCodes: [
      "app:reference-app:data:instruments:read",
      "app:reference-app:data:instruments:update",
    ],
  });

  const opaqueIdentityPlatform = gatewayPlatform({
    ...roleUnionGatewayInvocationFixture,
    principal: { ...roleUnionPrincipal, displayName: "user-1" },
  });
  const opaqueIdentityTransport = new OpenXiangdaGatewayTransportGuard(
    new OpenXiangdaGatewayAssertionVerifier(
      opaqueIdentityPlatform as any,
      moduleOptions
    ),
    opaqueIdentityPlatform as any,
    moduleOptions
  );
  await assert.rejects(
    () =>
      opaqueIdentityTransport.canActivate(
        httpContext({
          ...request,
          openxiangda: undefined,
          openxiangdaInvocation: undefined,
        })
      ),
    (error: any) =>
      error.getResponse().code ===
      "OPENXIANGDA_GATEWAY_USER_DISPLAY_NAME_INVALID"
  );
});

test("connected development resolves a loopback current user with the Dev Session role union", async () => {
  const status = {
    schemaVersion: "openxiangda.connected-dev-session/v2",
    sessionId: "dev-session-1",
    expiresAt: "2026-08-21T01:00:00.000Z",
    expiresIn: 1800,
    mode: "manifest-overlay",
    manifestOverlay: true,
    additiveSchemaSync: true,
    environment: {
      id: "environment-1",
      key: "preproduction",
      activeAppVersionId: "app-version-1",
      headRevision: 4,
    },
    subjectProfile: {
      schemaVersion: SCHEMA_VERSIONS.subjectProfile,
      userId: "user-1",
      displayName: "王老师",
      avatarUrl: null,
      jobNumber: "T001",
      affiliatedDepartment: null,
    },
    principal: {
      type: "developer",
      userId: "user-1",
      roleCodes: ["college_admin", "instrument_admin"],
      isAppSuperAdmin: false,
      capabilityCodes: ["app:instrument:update"],
    },
    manifestDigest: "a".repeat(64),
  };
  const platform = {
    connectedDevelopmentSession: test.mock.fn(async () => status),
  };
  const moduleOptions = { ...options(globalThis.fetch), connectedDevelopment: true };
  const guard = new OpenXiangdaGatewayTransportGuard(
    {} as any,
    platform as any,
    moduleOptions
  );
  const request: any = {
    method: "POST",
    url: "/api/instruments/update",
    raw: { socket: { remoteAddress: "127.0.0.1" } },
    headers: {
      authorization: "Bearer developer-token",
      "x-openxiangda-connected-dev": "1",
      "x-openxiangda-dev-session": "short-lived-dev-session-token",
      // Spoofed browser identity headers are ignored; platform current wins.
      "x-openxiangda-connected-dev-user-id": "attacker",
      "x-openxiangda-connected-dev-role-codes": "school_admin",
    },
  };
  await guard.canActivate(httpContext(request));
  assert.equal(request.openxiangdaInvocation, undefined);
  assert.equal(request.openxiangda.perspectiveCode, null);
  assert.deepEqual(
    currentUserFromVerifiedContext(request.openxiangda).roleCodes,
    ["college_admin", "instrument_admin"]
  );
  assert.equal(
    currentUserFromVerifiedContext(request.openxiangda).userId,
    "user-1"
  );
  assert.equal(
    currentUserFromVerifiedContext(request.openxiangda).displayName,
    "王老师"
  );
  assert.equal(platform.connectedDevelopmentSession.mock.callCount(), 1);
  assert.deepEqual(
    platform.connectedDevelopmentSession.mock.calls[0]!.arguments,
    ["Bearer developer-token", "short-lived-dev-session-token"]
  );
  const authz = new OpenXiangdaAuthzGuard(
    { getAllAndOverride: () => "app:instrument:update" } as any
  );
  await assert.doesNotReject(() => authz.canActivate(httpContext(request)));

  status.subjectProfile.displayName = "__ox_ai_test__:member-1";
  await assert.rejects(
    () =>
      guard.canActivate(
        httpContext({
          ...request,
          openxiangda: undefined,
          raw: { socket: { remoteAddress: "127.0.0.1" } },
        })
      ),
    (error: any) =>
      error.getResponse().code === "OPENXIANGDA_CONNECTED_DEV_IDENTITY_INVALID"
  );
  status.subjectProfile.displayName = "王老师";

  await assert.rejects(
    () => guard.canActivate(httpContext({
      ...request,
      openxiangdaInvocation: undefined,
      raw: { socket: { remoteAddress: "10.0.0.8" } },
    })),
    (error: any) =>
      error.getResponse().code === "OPENXIANGDA_CONNECTED_DEV_LOOPBACK_REQUIRED"
  );
});

test("global Gateway guard rejects direct and body-tampered runtime requests", async () => {
  const moduleOptions = options(globalThis.fetch);
  const platform = gatewayPlatform();
  const verifier = new OpenXiangdaGatewayAssertionVerifier(
    platform as any,
    moduleOptions
  );
  const guard = new OpenXiangdaGatewayTransportGuard(
    verifier,
    platform as any,
    moduleOptions
  );
  await assert.rejects(
    () =>
      guard.canActivate(
        httpContext({
          method: "POST",
          url: "/api/reservations/draft",
          rawBody: Buffer.from("{}"),
          headers: { authorization: "Bearer invocation-token" },
        })
      ),
    (error: any) =>
      error.getResponse().code === "OPENXIANGDA_GATEWAY_ASSERTION_REQUIRED"
  );

  const assertion = gatewayAssertion({
    method: "POST",
    path: "/api/reservations/draft",
    query: "",
    body: Buffer.from(JSON.stringify({ value: 1 })),
    token: "invocation-token",
  });
  await assert.rejects(
    () =>
      guard.canActivate(
        httpContext({
          method: "POST",
          url: "/api/reservations/draft",
          rawBody: Buffer.from(JSON.stringify({ value: 2 })),
          headers: {
            authorization: "Bearer invocation-token",
            "x-openxiangda-gateway-assertion": assertion,
          },
        })
      ),
    (error: any) =>
      error.getResponse().code ===
      "OPENXIANGDA_GATEWAY_ASSERTION_CONTEXT_INVALID"
  );
  assert.equal(platform.verifyGatewayInvocation.mock.callCount(), 0);
});

test("global Gateway guard leaves complete signed callback envelopes to their protocol receivers", async () => {
  const moduleOptions = options(globalThis.fetch);
  const platform = gatewayPlatform();
  const verifier = new OpenXiangdaGatewayAssertionVerifier(
    platform as any,
    moduleOptions
  );
  const guard = new OpenXiangdaGatewayTransportGuard(
    verifier,
    platform as any,
    moduleOptions
  );
  const signedHeaders = {
    "x-openxiangda-signature": "v1=signed-by-callback-protocol",
    "x-openxiangda-timestamp": "1786723200",
  };

  await assert.doesNotReject(() =>
    guard.canActivate(
      httpContext({
        method: "POST",
        url: "/__platform/events/instrument-events",
        headers: {
          ...signedHeaders,
          "x-openxiangda-subscription-code": "instrument-events",
          "x-openxiangda-delivery-id": "delivery-1",
        },
      })
    )
  );
  await assert.doesNotReject(() =>
    guard.canActivate(
      httpContext({
        method: "POST",
        url: "/openxiangda/workflow/assignee-providers/reviewers",
        headers: {
          ...signedHeaders,
          "x-openxiangda-workflow-provider": "reviewers",
          "x-openxiangda-request-id": "request-1",
        },
      })
    )
  );
  await assert.rejects(
    () =>
      guard.canActivate(
        httpContext({
          method: "POST",
          url: "/events/not-a-signed-callback",
          headers: signedHeaders,
        })
      ),
    (error: any) =>
      error.getResponse().code === "OPENXIANGDA_INVOCATION_TOKEN_REQUIRED"
  );
  await assert.rejects(
    () =>
      guard.canActivate(
        httpContext({
          method: "POST",
          url: "/api/reservations/draft",
          headers: {
            ...signedHeaders,
            "x-openxiangda-subscription-code": "instrument-events",
            "x-openxiangda-delivery-id": "delivery-1",
          },
        })
      ),
    (error: any) =>
      error.getResponse().code === "OPENXIANGDA_INVOCATION_TOKEN_REQUIRED"
  );
  assert.equal(platform.verifyGatewayInvocation.mock.callCount(), 0);
});

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("base64url");
}

test("request-scoped Data API forwards verified identity", async () => {
  const platform = {
    queryData: test.mock.fn(async () => ({
      schemaVersion: SCHEMA_VERSIONS.dataPage,
      resourceCode: "instruments",
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })),
  };
  const data = new OpenXiangdaDataApiService(
    {
      headers: {},
      openxiangda: {
        principal,
        authorization: "Bearer user-token",
        perspectiveCode: "instrument-admin",
      },
    },
    platform as any
  );

  await data.query("instruments", {
    schemaVersion: SCHEMA_VERSIONS.dataQuery,
    limit: 20,
  });
  assert.deepEqual(platform.queryData.mock.calls[0]!.arguments, [
    "Bearer user-token",
    "instrument-admin",
    "instruments",
    { schemaVersion: SCHEMA_VERSIONS.dataQuery, limit: 20 },
  ]);
});

test("Data API forwards read-only record guards without inventing a mutation", async () => {
  const platform = {
    transactData: test.mock.fn(async (_authorization, _perspectiveCode, input) => ({
      schemaVersion: SCHEMA_VERSIONS.dataTransactionResult,
      idempotencyKey: input.idempotencyKey,
      replayed: false,
      items: [],
    })),
  };
  const data = new OpenXiangdaDataApiService(
    {
      headers: {},
      openxiangda: {
        principal,
        authorization: "Bearer user-token",
        perspectiveCode: "instrument-admin",
      },
    },
    platform as any
  );
  const transaction = {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey: "reservation-policy-1",
    guards: [
      {
        kind: "record-exists" as const,
        resourceCode: "reservation-policies",
        lockKey: "reservation-policy:policy-1",
        errorCode: "OPENXIANGDA_RESERVATION_POLICY_REQUIRED",
        id: "policy-1",
      },
      {
        kind: "record-match" as const,
        resourceCode: "reservation-policies",
        lockKey: "reservation-policy:policy-1",
        errorCode: "OPENXIANGDA_RESERVATION_POLICY_INACTIVE",
        id: "policy-1",
        assertions: [
          {
            kind: "value" as const,
            field: "status",
            operator: "eq" as const,
            value: "active",
          },
        ],
      },
    ],
    operations: [
      {
        operation: "create" as const,
        resourceCode: "reservations",
        data: { policyId: "policy-1" },
      },
    ],
  };

  await data.transaction(transaction);

  assert.deepEqual(platform.transactData.mock.calls[0]!.arguments, [
    "Bearer user-token",
    "instrument-admin",
    transaction,
  ]);
});

test("business action Data API requires immutable operation metadata and forwards it", async () => {
  const operation = {
    code: "reservation.create",
    method: "POST" as const,
    path: "/api/reservations",
    requiredCapability: "app:reference-app:reservation:create",
    requestSchemaDigest: "a".repeat(64),
    responseSchemaDigest: "b".repeat(64),
  };
  const platform = {
    transactData: test.mock.fn(async () => ({
      schemaVersion: SCHEMA_VERSIONS.dataTransactionResult,
      idempotencyKey: "action-1",
      replayed: false,
      items: [],
    })),
  };
  const request = {
    headers: { 'x-request-id': 'request-action-1' },
    openxiangda: {
      principal: roleUnionPrincipal,
      authorization: "Bearer invocation-token",
      perspectiveCode: "instrument-admin",
      operation,
    },
  };
  const data = new OpenXiangdaBusinessDataApiService(request, platform as any);
  await data.transaction({
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey: "action-1",
    operations: [],
  });
  assert.deepEqual(platform.transactData.mock.calls[0]!.arguments, [
    "Bearer invocation-token",
    "instrument-admin",
    {
      schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
      idempotencyKey: "action-1",
      operations: [],
    },
    {
      code: operation.code,
      requiredCapability: operation.requiredCapability,
      requestId: 'request-action-1',
    },
  ]);

  delete (request.openxiangda as any).operation;
  await assert.rejects(
    () => data.query("instruments", {
      schemaVersion: SCHEMA_VERSIONS.dataQuery,
      limit: 20,
    }),
    /OPENXIANGDA_BUSINESS_ACTION_OPERATION_REQUIRED/u
  );
});

test("business directory resolves only the initiator bound to the verified Named Action", async () => {
  const operation = {
    code: "welfare.save",
    method: "POST" as const,
    path: "/api/welfare/save",
    requiredCapability: "app:reference-app:welfare:save",
    requestSchemaDigest: "a".repeat(64),
    responseSchemaDigest: "b".repeat(64),
    platformAccess: {
      directory: {
        mode: "current-initiator" as const,
        fields: ["displayName" as const, "primaryDepartment" as const],
      },
    },
  };
  const platform = {
    resolveCurrentInitiator: test.mock.fn(async () => ({
      schemaVersion:
        "openxiangda.current-initiator-directory-snapshot/v2" as const,
      userId: "user-1",
      displayName: "王老师",
      primaryDepartment: { value: "department-1", label: "工会办公室" },
      snapshotRevision: "c".repeat(64),
      resolvedAt: "2026-08-29T08:00:00.000Z",
    })),
  };
  const request = {
    headers: {},
    openxiangda: {
      principal: roleUnionPrincipal,
      authorization: "Bearer invocation-token",
      perspectiveCode: null,
      connectedDevelopmentSessionToken: "dev-session-token",
      operation,
    },
  };
  const directory = new OpenXiangdaBusinessDirectoryService(
    request,
    platform as any
  );

  assert.equal((await directory.currentInitiator()).userId, "user-1");
  assert.deepEqual(platform.resolveCurrentInitiator.mock.calls[0]!.arguments, [
    "Bearer invocation-token",
    {
      code: operation.code,
      requiredCapability: operation.requiredCapability,
      connectedDevelopmentSessionToken: "dev-session-token",
    },
  ]);

  delete (request.openxiangda as any).operation;
  await assert.rejects(
    () => directory.currentInitiator(),
    /OPENXIANGDA_BUSINESS_ACTION_OPERATION_REQUIRED/u
  );
});

test("business notification SDK requires a verified Named Action and forwards its proof", async () => {
  const operation = {
    code: "purchase.submit",
    method: "POST" as const,
    path: "/api/purchases/:id/submit",
    requiredCapability: "app:reference-app:purchase:submit",
    requestSchemaDigest: "a".repeat(64),
    responseSchemaDigest: "b".repeat(64),
  };
  const platform = {
    sendBusinessNotification: test.mock.fn(async () => ({
      id: "message-business-1",
      schemaVersion: "openxiangda.notification.message/v2",
      state: "informational",
    })),
  };
  const request = {
    headers: {},
    openxiangda: {
      principal: roleUnionPrincipal,
      authorization: "Bearer invocation-token",
      perspectiveCode: null,
      connectedDevelopmentSessionToken: "dev-session-token",
      operation,
    },
  };
  const notifications = new OpenXiangdaBusinessNotificationService(
    request,
    platform as any,
    {} as any,
    new OpenXiangdaEventContext()
  );
  const input = {
    schemaVersion: OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2,
    eventId: "11111111-1111-4111-8111-111111111111",
    correlationId: "purchase:request-42",
    messageKey: "purchase:request-42:applicant",
    sourceSequence: 1,
    recipients: [{ userId: "user-2" }],
    title: "采购申请已提交",
    navigationTarget: {
      kind: "APP_ROUTE" as const,
      appCode: "reference-app",
      routeCodes: {
        desktop: "purchase.detail",
        mobile: "purchase.detail-mobile",
      },
      pathParams: { id: "request-42" },
      access: "AUTHENTICATED" as const,
    },
    idempotencyKey: "purchase:request-42:revision:1",
  };

  assert.equal((await notifications.send(input)).id, "message-business-1");
  assert.deepEqual(
    platform.sendBusinessNotification.mock.calls[0]!.arguments,
    [
      "Bearer invocation-token",
      input,
      {
        code: operation.code,
        requiredCapability: operation.requiredCapability,
        connectedDevelopmentSessionToken: "dev-session-token",
      },
    ]
  );

  delete (request.openxiangda as any).operation;
  await assert.rejects(
    () => notifications.send(input),
    /OPENXIANGDA_BUSINESS_ACTION_OPERATION_REQUIRED/u
  );

  request.openxiangda.operation = operation;
  (request.openxiangda as any).principal = applicationPrincipal;
  await assert.rejects(
    () => notifications.send(input),
    /OPENXIANGDA_BUSINESS_ACTION_USER_CONTEXT_REQUIRED/u
  );
});

test("business notification SDK resolves signed event context with application credentials", async () => {
  const eventContext = new OpenXiangdaEventContext();
  const platform = {
    sendEventNotification: test.mock.fn(async () => ({
      id: "message-event-1",
      schemaVersion: "openxiangda.notification.message/v2",
      state: "informational",
    })),
  };
  const credentials = {
    withAuthorization: async (operation: (authorization: string) => unknown) =>
      await operation("Bearer application-token"),
  };
  const notifications = new OpenXiangdaBusinessNotificationService(
    { headers: {} },
    platform as any,
    credentials as any,
    eventContext
  );
  const input = {
    schemaVersion: OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2,
    correlationId: "date-trigger:proposal-42",
    messageKey: "proposal:42:reminder",
    sourceSequence: 4,
    recipientPaths: ["assigneeUserIds"],
    titlePath: "notificationTitle",
    summaryPath: "notificationSummary",
    navigationTarget: {
      kind: "APP_ROUTE" as const,
      appCode: "reference-app",
      routeCodes: {
        desktop: "proposal.detail",
        mobile: "proposal.detail-mobile",
      },
      pathParams: { id: "proposal-42" },
      access: "AUTHENTICATED" as const,
    },
    idempotencyKey: "date-trigger:proposal-42:event-1",
  };
  const event = JSON.parse(
    eventBody({
      id: "11111111-1111-4111-8111-111111111111",
      type: "reference-app.proposal.reminder-due.v1",
      recordId: "proposal-42",
    })
  );
  await eventContext.run(
    event,
    "22222222-2222-4222-8222-222222222222",
    "proposal-reminders",
    async () => assert.equal((await notifications.sendFromEvent(input)).id, "message-event-1")
  );
  assert.deepEqual(platform.sendEventNotification.mock.calls[0]!.arguments, [
    "Bearer application-token",
    input,
  ]);
  await assert.rejects(
    () => notifications.sendFromEvent(input),
    /OPENXIANGDA_BUSINESS_NOTIFICATION_EVENT_CONTEXT_REQUIRED/u
  );
});

test("Data API emits one idempotent domain event through the canonical transaction", async () => {
  const platform = {
    transactData: test.mock.fn(async (_authorization, _perspectiveCode, input) => ({
      schemaVersion: SCHEMA_VERSIONS.dataTransactionResult,
      idempotencyKey: input.idempotencyKey,
      replayed: false,
      items: [
        {
          index: 0,
          operation: "emitEvent",
          eventType: input.operations[0].eventType,
          eventId: "11111111-1111-4111-8111-111111111111",
        },
      ],
    })),
  };
  const data = new OpenXiangdaDataApiService(
    {
      headers: {},
      openxiangda: {
        principal,
        authorization: "Bearer user-token",
        perspectiveCode: "instrument-admin",
      },
    },
    platform as any
  );

  const emitted = await data.emitEvent({
    idempotencyKey: "instrument-submitted-20260824",
    eventType: "reference-app.instrument.submitted.v1",
    subject: "/instruments/instrument-1",
    data: { instrumentId: "instrument-1" },
  });

  assert.deepEqual(emitted, {
    eventId: "11111111-1111-4111-8111-111111111111",
    eventType: "reference-app.instrument.submitted.v1",
    replayed: false,
  });
  assert.deepEqual(platform.transactData.mock.calls[0]!.arguments, [
    "Bearer user-token",
    "instrument-admin",
    {
      schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
      idempotencyKey: "instrument-submitted-20260824",
      operations: [
        {
          operation: "emitEvent",
          eventType: "reference-app.instrument.submitted.v1",
          subject: "/instruments/instrument-1",
          data: { instrumentId: "instrument-1" },
        },
      ],
    },
  ]);
});

test("request-scoped Data API forwards application identity", async () => {
  const servicePrincipal = {
    ...principal,
    principalType: "service" as const,
    subjectId: "client-1",
    environmentKey: "preproduction",
    clientRecordId: "client-record-1",
    clientId: "client-1",
    credentialVersion: 2,
    scopes: ["data:read"],
    rateLimitPerMinute: 600,
    tokenId: "token-1",
  };
  const platform = {
    queryData: test.mock.fn(async () => ({ items: [], total: 0 })),
  };
  const data = new OpenXiangdaDataApiService(
    {
      headers: {},
      openxiangda: {
        principal: servicePrincipal,
        authorization: "Bearer application-token",
        perspectiveCode: null,
      },
    },
    platform as any
  );

  await data.query("instruments", {
    schemaVersion: SCHEMA_VERSIONS.dataQuery,
    limit: 20,
  });
  assert.equal(platform.queryData.mock.calls[0]!.arguments[1], null);
});

test("application credentials exchange once, cache the token and never send the secret outside Basic auth", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = test.mock.fn(async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        access_token: "application-token-1",
        token_type: "Bearer",
        expires_in: 300,
        scope: "app:invoke app:reference-app:data:instruments:read",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  });
  const credentials = new OpenXiangdaApplicationCredentials({
    ...options(fetch as any),
    oauthClient: {
      clientId: "client-1",
      clientSecret: "secret-1",
      scopes: [
        "app:invoke",
        "app:reference-app:data:instruments:read",
        "app:invoke",
      ],
    },
  });

  const [first, second] = await Promise.all([
    credentials.getAuthorizationHeader(),
    credentials.getAuthorizationHeader(),
  ]);
  assert.equal(first, "Bearer application-token-1");
  assert.equal(second, first);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(
    requests[0]!.url,
    "https://platform.example/openxiangda-api/v2/oauth2/token"
  );
  const headers = new Headers(requests[0]!.init?.headers);
  assert.equal(headers.get("Content-Type"), "application/x-www-form-urlencoded");
  assert.equal(
    Buffer.from(String(headers.get("Authorization")).slice(6), "base64").toString(
      "utf8"
    ),
    "client-1:secret-1"
  );
  assert.equal(
    String(requests[0]!.init?.body),
    "grant_type=client_credentials&scope=app%3Ainvoke+app%3Areference-app%3Adata%3Ainstruments%3Aread"
  );
});

test("application Data API refreshes an invalid token once and preserves requestless identity", async () => {
  let tokenNumber = 0;
  const credentials = new OpenXiangdaApplicationCredentials({
    ...options(async () => {
      tokenNumber += 1;
      return new Response(
        JSON.stringify({
          access_token: `application-token-${tokenNumber}`,
          token_type: "Bearer",
          expires_in: 300,
          scope: "app:reference-app:data:instruments:read",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }),
    oauthClient: { clientId: "client-1", clientSecret: "secret-1" },
  });
  const platform = {
    queryData: test.mock.fn(async (authorization: string) => {
      if (authorization === "Bearer application-token-1") {
        throw new OpenXiangdaPlatformError(
          401,
          "APPLICATION_OAUTH_TOKEN_INVALID",
          "expired"
        );
      }
      return { items: [], total: 0 };
    }),
  };
  const data = new OpenXiangdaApplicationDataApiService(
    platform as any,
    credentials
  );

  await data.query("instruments", {
    schemaVersion: SCHEMA_VERSIONS.dataQuery,
    limit: 20,
  });
  assert.equal(tokenNumber, 2);
  assert.deepEqual(
    platform.queryData.mock.calls.map(call => call.arguments.slice(0, 3)),
    [
      ["Bearer application-token-1", null, "instruments"],
      ["Bearer application-token-2", null, "instruments"],
    ]
  );
});

test("request-scoped Workflow SDK rejects application identity", async () => {
  const workflow = new OpenXiangdaWorkflowService(
    {
      headers: {},
      openxiangda: {
        principal: applicationPrincipal,
        authorization: "Bearer application-token",
        perspectiveCode: null,
      },
    },
    {} as any
  );

  await assert.rejects(
    () => workflow.workCenter(),
    /OPENXIANGDA_WORKFLOW_USER_CONTEXT_REQUIRED/u
  );
});

test("durable business process SDK sends only verified Named Action proof", async () => {
  const operation = {
    code: "applications.submit",
    method: "POST" as const,
    path: "/api/applications/submit",
    requiredCapability: "app:reference-app:applications:submit",
    requestSchemaDigest: "a".repeat(64),
    responseSchemaDigest: "b".repeat(64),
    platformAccess: {
      workflow: { codes: ["application-approval"] },
    },
  };
  const platform = {
    commitBusinessProcess: test.mock.fn(async (_authorization, input) => ({
      schemaVersion: SCHEMA_VERSIONS.businessProcessCommand,
      workflowCode: input.workflow.workflowCode,
    })),
  };
  const request = {
    headers: {},
    openxiangda: {
      principal: roleUnionPrincipal,
      authorization: "Bearer invocation-token",
      perspectiveCode: null,
      operation,
    },
  };
  const process = new OpenXiangdaBusinessProcessService(
    request,
    platform as any
  );
  await process.commit({
    idempotencyKey: "submit-1",
    data: {
      operations: [
        {
          key: "application",
          kind: "create",
          resourceCode: "applications",
          data: { title: "申请" },
        },
      ],
    },
    workflow: {
      workflowCode: "application-approval",
      subject: { fromOperation: "application" },
    },
  });
  assert.deepEqual(platform.commitBusinessProcess.mock.calls[0]!.arguments, [
    "Bearer invocation-token",
    {
      schemaVersion: SCHEMA_VERSIONS.businessProcessCommit,
      environmentKey: "preproduction",
      idempotencyKey: "submit-1",
      data: {
        operations: [
          {
            key: "application",
            kind: "create",
            resourceCode: "applications",
            data: { title: "申请" },
          },
        ],
      },
      workflow: {
        workflowCode: "application-approval",
        subject: { fromOperation: "application" },
      },
    },
    {
      code: operation.code,
      requiredCapability: operation.requiredCapability,
    },
  ]);

  (request.openxiangda as any).operation = undefined;
  await assert.rejects(
    () => process.status("11111111-1111-4111-8111-111111111111"),
    /OPENXIANGDA_BUSINESS_ACTION_OPERATION_REQUIRED/u
  );
});

test("durable business process SDK reads receipt, poll and declared subject history", async () => {
  const operation = {
    code: "applications.submit",
    method: "POST" as const,
    path: "/api/applications/submit",
    requiredCapability: "app:reference-app:applications:submit",
    requestSchemaDigest: "a".repeat(64),
    responseSchemaDigest: "b".repeat(64),
    platformAccess: { workflow: { codes: ["application-approval"] } },
  };
  const command = {
    schemaVersion: SCHEMA_VERSIONS.businessProcessCommand,
    workflowCode: "application-approval",
  } as any;
  const platform = {
    businessProcessReceipt: test.mock.fn(async (...args: any[]) => ({
      schemaVersion: SCHEMA_VERSIONS.businessProcessReceipt,
      receiptId: "11111111-1111-4111-8111-111111111111",
      commandId: "22222222-2222-4222-8222-222222222222",
      operationCode: operation.code,
      idempotencyKey: "submit-1",
      requestDigest: "c".repeat(64),
      command,
      createdAt: null,
    })),
    businessProcessPoll: test.mock.fn(async (...args: any[]) => ({
      schemaVersion: SCHEMA_VERSIONS.businessProcessPoll,
      command,
      changed: true,
      terminal: false,
      retryable: false,
      cursor: { afterRevision: 0, revision: 1 },
      nextPoll: { afterRevision: 1, retryAfterMs: 500 },
    })),
    listBusinessProcessCommands: test.mock.fn(async (...args: any[]) => ({
      schemaVersion: SCHEMA_VERSIONS.businessProcessCommandList,
      items: [command], nextCursor: null,
    })),
  };
  const process = new OpenXiangdaBusinessProcessService(
    {
      headers: {},
      openxiangda: {
        principal: roleUnionPrincipal,
        authorization: "Bearer invocation-token",
        perspectiveCode: null,
        operation,
      },
    },
    platform as any
  );
  const receipt = await process.receipt(command.id || "22222222-2222-4222-8222-222222222222");
  const poll = await process.poll("22222222-2222-4222-8222-222222222222", 0);
  assert.equal(receipt.schemaVersion, SCHEMA_VERSIONS.businessProcessReceipt);
  assert.equal(poll.schemaVersion, SCHEMA_VERSIONS.businessProcessPoll);
  assert.equal(platform.businessProcessReceipt.mock.calls.length, 1);
  assert.equal(platform.businessProcessPoll.mock.calls.length, 1);
  assert.equal(platform.businessProcessPoll.mock.calls[0]!.arguments[2], 0);
  const input = { resourceCode: 'applications', recordId: 'record-1', workflowCode: 'application-approval' };
  const history = await process.list(input);
  assert.equal(history.items[0], command);
  assert.deepEqual(platform.listBusinessProcessCommands.mock.calls[0]!.arguments, [
    'Bearer invocation-token', { ...input, environmentKey: 'preproduction' },
    { code: operation.code, requiredCapability: operation.requiredCapability },
  ]);
  await assert.rejects(() => process.list({ ...input, workflowCode: 'not-declared' }),
    /OPENXIANGDA_BUSINESS_PROCESS_WORKFLOW_NOT_DECLARED/u);
  await assert.rejects(() => process.list({ ...input, workflowCode: '' }),
    /OPENXIANGDA_BUSINESS_PROCESS_WORKFLOW_NOT_DECLARED/u);
  assert.equal(platform.listBusinessProcessCommands.mock.callCount(), 1);
  command.workflowCode = 'not-declared';
  await assert.rejects(() => process.list(input), /OPENXIANGDA_BUSINESS_PROCESS_COMMAND_WORKFLOW_NOT_DECLARED/u);
});

test("request-scoped Workflow SDK uses the current user union", async () => {
  const platform = {
    executeWorkflowTaskCommand: test.mock.fn(async () => ({
      taskId: "task-1",
      status: "running",
      nextNodeId: "platform-review",
    })),
    createWorkflowDelegation: test.mock.fn(async () => ({
      id: "delegation-1",
      status: "active",
    })),
    workflowInstanceSurface: test.mock.fn(async () => ({
      engineVersion: "2.0",
      instanceId: "instance-1",
    })),
    workflowTaskDetail: test.mock.fn(async () => ({ detailRevision: "detail-1" })),
    workflowInstanceDetail: test.mock.fn(async () => ({ detailRevision: "detail-2" })),
    workflowTimeline: test.mock.fn(async () => ({ flow: [], items: [] })),
    workflowAssignmentExplain: test.mock.fn(async () => ({ candidates: [] })),
  };
  const workflow = new OpenXiangdaWorkflowService(
    {
      headers: { "x-openxiangda-csrf-token": "csrf-1" },
      openxiangda: {
        principal: roleUnionPrincipal,
        authorization: "Bearer user-token",
        perspectiveCode: null,
      },
    },
    platform as any
  );

  await workflow.taskCommand("task-1", "approve", {
    commandToken: "A".repeat(43),
    idempotencyKey: "approve-after-business-save",
    input: { comment: "业务数据已保存" },
  });
  assert.deepEqual(
    platform.executeWorkflowTaskCommand.mock.calls[0]!.arguments,
    [
      "Bearer user-token",
      "task-1",
      "approve",
      {
        commandToken: "A".repeat(43),
        idempotencyKey: "approve-after-business-save",
        input: { comment: "业务数据已保存" },
      },
      "csrf-1",
    ]
  );
  await workflow.createDelegation({
    delegatorRoleSubjectKey:
      "membership:00000000-0000-4000-8000-000000000001",
    delegateUserId: "user-b",
    delegateRoleSubjectKey: "membership:00000000-0000-4000-8000-000000000002",
    validFrom: "2026-08-11T00:00:00.000Z",
    validTo: "2026-08-12T00:00:00.000Z",
    reason: "出差代理",
  });
  assert.deepEqual(platform.createWorkflowDelegation.mock.calls[0]!.arguments, [
    "Bearer user-token",
    {
      delegatorRoleSubjectKey:
        "membership:00000000-0000-4000-8000-000000000001",
      delegateUserId: "user-b",
      delegateRoleSubjectKey: "membership:00000000-0000-4000-8000-000000000002",
      validFrom: "2026-08-11T00:00:00.000Z",
      validTo: "2026-08-12T00:00:00.000Z",
      reason: "出差代理",
    },
  ]);
  await workflow.instanceSurface("instance-1");
  await workflow.taskDetail("task-1");
  await workflow.instanceDetail("instance-1");
  await workflow.timeline("instance-1");
  await workflow.assignmentExplain("task-1");
  assert.deepEqual(platform.workflowInstanceSurface.mock.calls[0]!.arguments, [
    "Bearer user-token",
    "instance-1",
    "csrf-1",
  ]);
  assert.deepEqual(platform.workflowTimeline.mock.calls[0]!.arguments, [
    "Bearer user-token",
    "instance-1",
  ]);
  assert.deepEqual(platform.workflowTaskDetail.mock.calls[0]!.arguments, [
    "Bearer user-token",
    "task-1",
    "csrf-1",
  ]);
  assert.deepEqual(platform.workflowInstanceDetail.mock.calls[0]!.arguments, [
    "Bearer user-token",
    "instance-1",
    "csrf-1",
  ]);
  assert.deepEqual(platform.workflowAssignmentExplain.mock.calls[0]!.arguments, [
    "Bearer user-token",
    "task-1",
  ]);
});

test("request-scoped Notification SDK sends advanced cards through the platform-owned channel", async () => {
  const platform = {
    sendAdvancedDingTalkCard: test.mock.fn(async () => ({
      id: "message-1",
      schemaVersion: "openxiangda.notification.message/v2",
      state: "informational",
    })),
  };
  const notifications = new OpenXiangdaNotificationService(
    {
      headers: {},
      openxiangda: {
        principal: roleUnionPrincipal,
        authorization: "Bearer user-token",
        perspectiveCode: null,
      },
    },
    platform as any
  );
  const input = {
    schemaVersion: OPENXIANGDA_NOTIFICATION_DINGTALK_ADVANCED_CARD_SEND_V2,
    bindingCode: "dingtalk_card_advanced",
    idempotencyKey: "purchase-card:request-42",
    title: "采购申请已创建",
    summary: "点击查看申请详情",
    recipients: [{ userId: "user-2" }],
    cardTemplateId: "purchase-result-v2",
    cardParamMap: { applicant: "张三", amount: "28600" },
    navigationTarget: {
      kind: "APP_ROUTE" as const,
      appCode: "reference-app",
      routeCodes: {
        desktop: "purchase.detail",
        mobile: "purchase.detail-mobile",
      },
      pathParams: { id: "request-42" },
      access: "AUTHENTICATED" as const,
    },
  };

  assert.equal((await notifications.sendDingTalkCard(input)).id, "message-1");
  assert.deepEqual(
    platform.sendAdvancedDingTalkCard.mock.calls[0]!.arguments,
    ["Bearer user-token", input]
  );

  const applicationIdentity = new OpenXiangdaNotificationService(
    {
      headers: {},
      openxiangda: {
        principal: applicationPrincipal,
        authorization: "Bearer application-token",
        perspectiveCode: null,
      },
    },
    platform as any
  );
  await assert.rejects(
    () => applicationIdentity.sendDingTalkCard(input),
    /OPENXIANGDA_NOTIFICATION_USER_CONTEXT_REQUIRED/u
  );
});

test("notification read queries carry only platform identifiers and the current environment", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new OpenXiangdaPlatformClient(options(async (input, init) => {
    requests.push({ url: String(input), init });
    return response({ messageId: 'message/one', deliveryId: 'delivery/two', readState: 'unknown', queryState: 'pending' });
  }));
  await client.getNotificationMessage('Bearer current-user', 'message/one');
  await client.getDingTalkCardReadReceipt('Bearer current-user', 'message/one', 'delivery/two');
  await client.refreshDingTalkCardReadReceipt('Bearer current-user', 'message/one', 'delivery/two');
  const base = '/openxiangda-api/v2/applications/reference-app/notification-hub/management/messages/message%2Fone';
  assert.deepEqual(requests.map(item => new URL(item.url).pathname), [base, `${base}/deliveries/delivery%2Ftwo/read-receipt`, `${base}/deliveries/delivery%2Ftwo/read-receipt/refresh`]);
  assert.equal(new URL(requests[0]!.url).searchParams.get('environmentKey'), 'preproduction');
  assert.equal(new URL(requests[1]!.url).searchParams.get('environmentKey'), 'preproduction');
  assert.equal(requests[2]!.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[2]!.init?.body)), { environmentKey: 'preproduction' });
  for (const item of requests) assert.equal(new Headers(item.init?.headers).get('authorization'), 'Bearer current-user');
});

test("read receipt facade requires a verified user and never starts business polling", async () => {
  const platform = {
    getNotificationMessage: test.mock.fn(async () => ({ id: 'message' })),
    getDingTalkCardReadReceipt: test.mock.fn(async () => ({ readState: 'unread' })),
    refreshDingTalkCardReadReceipt: test.mock.fn(async () => ({ queryState: 'pending' })),
  };
  const notifications = new OpenXiangdaNotificationService({ headers: {}, openxiangda: { principal: roleUnionPrincipal, authorization: 'Bearer current-user', perspectiveCode: null } }, platform as any);
  await notifications.getMessage('message');
  await notifications.getDingTalkCardReadReceipt('message', 'delivery');
  await notifications.refreshDingTalkCardReadReceipt('message', 'delivery');
  assert.deepEqual(platform.getNotificationMessage.mock.calls[0]!.arguments, ['Bearer current-user', 'message']);
  for (const method of [platform.getDingTalkCardReadReceipt, platform.refreshDingTalkCardReadReceipt]) {
    assert.equal(method.mock.calls.length, 1);
    assert.deepEqual(method.mock.calls[0]!.arguments, ['Bearer current-user', 'message', 'delivery']);
  }
  for (const context of [undefined, { principal: applicationPrincipal, authorization: 'Bearer app', perspectiveCode: null }]) {
    const denied = new OpenXiangdaNotificationService({ headers: {}, openxiangda: context }, platform as any);
    await assert.rejects(() => denied.getDingTalkCardReadReceipt('message', 'delivery'), /CONTEXT/);
    await assert.rejects(() => denied.refreshDingTalkCardReadReceipt('message', 'delivery'), /CONTEXT/);
  }
});

test("request-scoped Notification SDK sends and closes channel-neutral messages", async () => {
  const platform = {
    sendNotification: test.mock.fn(async () => ({
      id: "message-standard-1",
      schemaVersion: "openxiangda.notification.message/v2",
      state: "closed",
    })),
  };
  const notifications = new OpenXiangdaNotificationService(
    {
      headers: {},
      openxiangda: {
        principal: roleUnionPrincipal,
        authorization: "Bearer user-token",
        perspectiveCode: null,
      },
    },
    platform as any
  );
  const input = {
    schemaVersion: OPENXIANGDA_NOTIFICATION_APPLICATION_SEND_V2,
    correlationId: "purchase:request-42",
    messageKey: "purchase:request-42:applicant",
    sourceSequence: 3,
    templateCode: "purchase.status.standard",
    state: "closed" as const,
    recipients: [{ userId: "user-2" }],
    variables: { status: "已关闭" },
    navigationTarget: {
      kind: "APP_ROUTE" as const,
      appCode: "reference-app",
      routeCodes: {
        desktop: "purchase.detail",
        mobile: "purchase.detail-mobile",
      },
      pathParams: { id: "request-42" },
      access: "AUTHENTICATED" as const,
    },
    idempotencyKey: "purchase:request-42:revision:3",
  };

  assert.equal((await notifications.send(input)).state, "closed");
  assert.deepEqual(platform.sendNotification.mock.calls[0]!.arguments, [
    "Bearer user-token",
    input,
  ]);
});

test("module rejects incomplete platform runtime descriptors at startup", () => {
  const keys = Object.keys(applicationRuntimeEnvironment);
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.throws(
      () => OpenXiangdaModule.forApplication({}),
      /OPENXIANGDA_RUNTIME_DESCRIPTOR_REQUIRED/
    );
  } finally {
    Object.assign(process.env, previous);
  }

  const oauthKeys = [
    "OPENXIANGDA_OAUTH_CLIENT_ID",
    "OPENXIANGDA_OAUTH_CLIENT_SECRET",
    "OPENXIANGDA_OAUTH_SCOPES",
  ] as const;
  for (const key of oauthKeys) {
    process.env[key] = key.endsWith("SCOPES") ? "data:read" : "present";
    try {
      assert.throws(
        () => OpenXiangdaModule.forApplication({}),
        /OPENXIANGDA_OAUTH_RUNTIME_DESCRIPTOR_INCOMPLETE/
      );
    } finally {
      delete process.env[key];
    }
  }
  assert.equal(OPENXIANGDA_CONTRACT_VERSION, "2.0.0-alpha.5");
});

test("module rejects manual runtime identity, manual OAuth and unknown legacy options", () => {
  assert.equal((OpenXiangdaModule as any).forRoot, undefined);
  assert.throws(
    () =>
      OpenXiangdaModule.forApplication({
        appCode: "forged-app",
      } as any),
    /OPENXIANGDA_APPLICATION_MANUAL_IDENTITY_FORBIDDEN:appCode/
  );
  assert.throws(
    () =>
      OpenXiangdaModule.forApplication({
        oauthClient: {
          clientId: "manual-client",
          clientSecret: "manual-secret",
          scopes: ["data:read"],
        },
      } as any),
    /OPENXIANGDA_APPLICATION_MANUAL_OAUTH_FORBIDDEN/
  );
  assert.throws(
    () =>
      OpenXiangdaModule.forApplication({
        applicationIdentity: { userId: "forged-user" },
      } as any),
    /OPENXIANGDA_APPLICATION_OPTION_UNKNOWN:applicationIdentity/
  );
  assert.throws(
    () => OpenXiangdaModule.forApplication(null as any),
    /OPENXIANGDA_APPLICATION_OPTIONS_OBJECT_REQUIRED/
  );
});

test("OpenXiangdaOperation binds the immutable operation and capability metadata", () => {
  class ExampleController {
    run() {}
  }
  const operation = {
    code: "reservation.create",
    method: "POST" as const,
    path: "/api/reservations",
    requiredCapability: "app:reference-app:reservation:create",
    requestSchemaDigest: "a".repeat(64),
    responseSchemaDigest: "b".repeat(64),
  };
  const descriptor = Object.getOwnPropertyDescriptor(
    ExampleController.prototype,
    "run"
  )!;
  OpenXiangdaOperation(operation)(
    ExampleController.prototype,
    "run",
    descriptor
  );
  assert.deepEqual(
    Reflect.getMetadata(
      OPENXIANGDA_OPERATION_CONTRACT,
      ExampleController.prototype.run
    ),
    operation
  );
  assert.equal(
    Reflect.getMetadata(
      OPENXIANGDA_REQUIRED_CAPABILITY,
      ExampleController.prototype.run
    ),
    operation.requiredCapability
  );
});

test("event receiver verifies HMAC and suppresses duplicate side effects", async () => {
  const secret = "event-secret-for-test";
  const receiver = new OpenXiangdaEventReceiver(
    {
      ...eventReceiverOptions(),
      eventSigningSecrets: { "instrument-events": secret },
    },
    new InMemoryOpenXiangdaEventReceiptStore(),
    new OpenXiangdaEventContext()
  );
  const body = eventBody({
    id: "event-1",
    type: "openxiangda.data.record.created.v2",
    recordId: "record-1",
  });
  const headers = eventHeaders(body, secret, "delivery-1");
  const handler = test.mock.fn(async () => ({ handled: true }));

  const first = await receiver.accept(eventHandler, headers, body, handler);
  const duplicate = await receiver.accept(eventHandler, headers, body, handler);

  assert.deepEqual(first, {
    schemaVersion: SCHEMA_VERSIONS.eventDeliveryAck,
    accepted: true,
    duplicate: false,
    eventId: "event-1",
    deliveryId: "delivery-1",
    receiptStatus: "succeeded",
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(handler.mock.callCount(), 1);
  const invalidBody = eventBody({
    id: "invalid-actor",
    type: "openxiangda.data.record.created.v2",
    recordId: "record-1",
    data: { actor: { principalType: "untrusted", subjectId: "user-1" } },
  });
  await assert.rejects(() => receiver.accept(eventHandler,
    eventHeaders(invalidBody, secret, "invalid-delivery"), invalidBody, handler));
  assert.equal(handler.mock.callCount(), 1);
});

test("event receiver enforces the 64 KiB raw-body limit before dispatch", async () => {
  const secret = "event-size-secret-for-test";
  const receiver = new OpenXiangdaEventReceiver(
    {
      ...eventReceiverOptions(),
      eventSigningSecret: secret,
    },
    new InMemoryOpenXiangdaEventReceiptStore(),
    new OpenXiangdaEventContext()
  );
  const oversized = `${eventBody({
    id: "event-oversized",
    type: "openxiangda.data.record.created.v2",
    recordId: "record-oversized",
  })}${" ".repeat(65_536)}`;
  const handler = test.mock.fn(async () => undefined);

  await assert.rejects(
    () =>
      receiver.accept(
        eventHandler,
        eventHeaders(oversized, secret, "delivery-oversized"),
        oversized,
        handler
      ),
    /超过 handler 上限/
  );
  assert.equal(handler.mock.callCount(), 0);
});

test("event receiver binds event, subscription, manifest and key-version headers to the signature", async () => {
  const secret = "event-binding-secret-for-test";
  const receiver = new OpenXiangdaEventReceiver(
    {
      ...eventReceiverOptions(),
      eventSigningSecret: secret,
    },
    new InMemoryOpenXiangdaEventReceiptStore(),
    new OpenXiangdaEventContext()
  );
  const body = eventBody({
    id: "event-header-binding",
    type: "openxiangda.data.record.created.v2",
    recordId: "record-header-binding",
  });
  const headers = eventHeaders(body, secret, "delivery-header-binding");
  const handler = test.mock.fn(async () => undefined);

  for (const [name, value, message] of [
    ["x-openxiangda-event-id", "event-other", /header 与 body 不一致/],
    [
      "x-openxiangda-subscription-code",
      "other-events",
      /订阅与 handler 不一致/,
    ],
    [
      "x-openxiangda-handler-manifest-digest",
      "b".repeat(64),
      /manifest 与运行版本不一致/,
    ],
    ["x-openxiangda-signing-key-version", "2", /事件签名无效/],
  ] as const) {
    await assert.rejects(
      () =>
        receiver.accept(
          eventHandler,
          { ...headers, [name]: value },
          body,
          handler
        ),
      message
    );
  }
  assert.equal(handler.mock.callCount(), 0);
});

test("event receiver validates platform event data against the catalog schema", async () => {
  const secret = "event-schema-secret-for-test";
  const receiver = new OpenXiangdaEventReceiver(
    {
      ...eventReceiverOptions(),
      eventSigningSecret: secret,
    },
    new InMemoryOpenXiangdaEventReceiptStore(),
    new OpenXiangdaEventContext()
  );
  const body = eventBody({
    id: "event-invalid-schema",
    type: "openxiangda.data.record.updated.v2",
    recordId: "record-invalid-schema",
    data: { undeclared: true },
  });
  const handler = test.mock.fn(async () => undefined);

  await assert.rejects(
    () =>
      receiver.accept(
        eventHandler,
        eventHeaders(body, secret, "delivery-invalid-schema"),
        body,
        handler
      ),
    /不符合声明的 JSON Schema/
  );
  assert.equal(handler.mock.callCount(), 0);
});

test("event receiver validates application-owned event schemas before dispatch", async () => {
  const secret = "application-event-schema-secret";
  const customHandler = {
    code: "daily-summary-events",
    endpointPath: "/__platform/events/daily-summary-events",
    eventTypes: ["reference-app.daily-summary.v1"],
    dataSchemaVersions: ["1.0.0"],
    maxBodyBytes: 65_536,
    receiptProtocolVersion: 2,
  } satisfies AppEventHandlerContract;
  const customManifest = {
    schemaVersion: SCHEMA_VERSIONS.eventHandlerManifest,
    appCode: "reference-app",
    handlers: [customHandler],
  };
  const jsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["summaryId"],
    properties: { summaryId: { type: "string", minLength: 1 } },
  };
  const receiver = new OpenXiangdaEventReceiver(
    {
      ...options(globalThis.fetch),
      eventHandlerManifest: customManifest,
      eventSchemas: [
        {
          schemaVersion: SCHEMA_VERSIONS.eventSchema,
          eventType: "reference-app.daily-summary.v1",
          dataSchemaVersion: "1.0.0",
          jsonSchema,
          schemaDigest: sha256Digest(jsonSchema),
          owner: "application",
        },
      ],
      eventSigningSecrets: { "daily-summary-events": secret },
    },
    new InMemoryOpenXiangdaEventReceiptStore(),
    new OpenXiangdaEventContext()
  );
  const body = JSON.stringify({
    specversion: "1.0",
    id: "event-custom-schema",
    source: "/applications/reference-app/timers/daily-summary",
    type: "reference-app.daily-summary.v1",
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    data: {},
    tenantid: "tenant-1",
    appcode: "reference-app",
    environment: "preproduction",
    schemaversion: "1.0.0",
  });
  const handler = test.mock.fn(async () => undefined);

  await assert.rejects(
    () =>
      receiver.accept(
        customHandler,
        eventHeaders(
          body,
          secret,
          "delivery-custom-schema",
          "daily-summary-events",
          customManifest
        ),
        body,
        handler
      ),
    /不符合声明的 JSON Schema/
  );
  assert.equal(handler.mock.callCount(), 0);
});

test("event receiver accepts the active and staged next secret during deployment rotation", async () => {
  const activeSecret = "event-active-secret-for-test";
  const nextSecret = "event-next-secret-for-test";
  const receiver = new OpenXiangdaEventReceiver(
    {
      ...eventReceiverOptions(),
      eventSigningSecrets: {
        "instrument-events": [nextSecret, activeSecret],
      },
    },
    new InMemoryOpenXiangdaEventReceiptStore(),
    new OpenXiangdaEventContext()
  );
  const body = eventBody({
    id: "event-staged-secret",
    type: "openxiangda.data.record.created.v2",
    recordId: "record-rotation",
  });
  const deliveryId = "f53b80d2-908a-44e3-ad4b-76f06b374609";

  await assert.doesNotReject(
    receiver.accept(
      eventHandler,
      eventHeaders(body, activeSecret, deliveryId),
      body,
      async () => undefined
    )
  );
});

test("platform event receipt store signs claim and completion commands", async () => {
  const secret = "event-secret-for-test";
  const claimToken = "4e422c19-a54f-4f12-8b57-4d359136e6db";
  const receipt = {
    tenantId: "tenant-1",
    appCode: "reference-app",
    environmentKey: "preproduction",
    subscriptionCode: "instrument-events",
    eventId: "event-1",
    deliveryId: "9515d9e1-e9f9-4eaf-92c7-9a14b423f16e",
  };
  const requests: Array<Record<string, unknown>> = [];
  const store = new PlatformOpenXiangdaEventReceiptStore({
    ...options(async (input, init) => {
      assert.equal(
        String(input),
        "https://platform.example/openxiangda-api/v2/event-receipts"
      );
      const command = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(command);
      const headers = new Headers(init?.headers);
      const timestamp = String(headers.get("X-OpenXiangda-Timestamp"));
      const expected = createHmac("sha256", secret)
        .update(
          [
            SCHEMA_VERSIONS.eventReceiptCommand,
            timestamp,
            command.action,
            command.tenantId,
            command.appCode,
            command.environmentKey,
            command.subscriptionCode,
            command.eventId,
            command.deliveryId,
            command.claimToken || "",
          ].join("\n")
        )
        .digest("hex");
      assert.equal(
        headers.get("X-OpenXiangda-Signature"),
        `v1=${expected}`
      );
      const complete = command.action === "complete";
      return response({
        schemaVersion: SCHEMA_VERSIONS.eventReceiptResult,
        outcome: complete ? "completed" : "claimed",
        eventId: receipt.eventId,
        deliveryId: receipt.deliveryId,
        status: complete ? "succeeded" : "processing",
        claimToken: complete ? null : claimToken,
        attempts: 1,
        leaseExpiresAt: new Date().toISOString(),
        completedAt: complete ? new Date().toISOString() : null,
      });
    }),
    eventSigningSecrets: { "instrument-events": secret },
  });

  assert.equal(await store.claim(receipt), "claimed");
  await store.complete(receipt);

  assert.deepEqual(
    requests.map(item => item.action),
    ["claim", "complete"]
  );
  assert.equal(requests[1]!.claimToken, claimToken);
});

test("platform receipt maps an in-flight 409 claim to retryable busy", async () => {
  const store = new PlatformOpenXiangdaEventReceiptStore({
    ...options(async () =>
      new Response(
        JSON.stringify({
          code: 409,
          message: "receipt is already processing",
          errorCode: "EVENT_V2_RECEIPT_IN_PROGRESS",
          data: null,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }
      )
    ),
    eventSigningSecret: "event-secret-for-test",
  });

  assert.equal(
    await store.claim({
      tenantId: "tenant-1",
      appCode: "reference-app",
      environmentKey: "preproduction",
      subscriptionCode: "instrument-events",
      eventId: "event-busy-receipt",
      deliveryId: "delivery-busy-receipt",
    }),
    "busy"
  );
});

test("platform receipt retries idempotent completion after a transport failure", async () => {
  const secret = "event-secret-for-test";
  const claimToken = "4e422c19-a54f-4f12-8b57-4d359136e6db";
  const receipt = {
    tenantId: "tenant-1",
    appCode: "reference-app",
    environmentKey: "preproduction",
    subscriptionCode: "instrument-events",
    eventId: "event-completion-recovery",
    deliveryId: "dbf879a1-fe7b-4220-a53a-6f70bdd79095",
  };
  let requestNumber = 0;
  const store = new PlatformOpenXiangdaEventReceiptStore({
    ...options(async (_input, init) => {
      requestNumber += 1;
      const command = JSON.parse(String(init?.body)) as {
        action: string;
        claimToken?: string;
      };
      if (requestNumber === 2) throw new Error("connection reset");
      assert.equal(command.action, requestNumber === 1 ? "claim" : "complete");
      if (requestNumber === 3) assert.equal(command.claimToken, claimToken);
      return response({
        schemaVersion: SCHEMA_VERSIONS.eventReceiptResult,
        outcome: requestNumber === 1 ? "claimed" : "completed",
        eventId: receipt.eventId,
        deliveryId: receipt.deliveryId,
        status: requestNumber === 1 ? "processing" : "succeeded",
        claimToken: requestNumber === 1 ? claimToken : null,
        attempts: 1,
        leaseExpiresAt: new Date().toISOString(),
        completedAt: requestNumber === 1 ? null : new Date().toISOString(),
      });
    }),
    eventSigningSecret: secret,
    eventReceiptRetryDelayMs: 0,
  });

  assert.equal(await store.claim(receipt), "claimed");
  await store.complete(receipt);
  assert.equal(requestNumber, 3);
});

test("event receiver never releases a receipt after the business handler succeeded", async () => {
  const secret = "event-secret-for-test";
  const store = {
    claim: test.mock.fn(async () => "claimed" as const),
    complete: test.mock.fn(async () => {
      throw new ServiceUnavailableException("completion unavailable");
    }),
    release: test.mock.fn(async () => undefined),
  };
  const receiver = new OpenXiangdaEventReceiver(
    { ...eventReceiverOptions(), eventSigningSecret: secret },
    store,
    new OpenXiangdaEventContext()
  );
  const body = eventBody({
    id: "event-complete-failure",
    type: "openxiangda.data.record.updated.v2",
    recordId: "record-complete-failure",
  });
  const headers = eventHeaders(
    body,
    secret,
    "9515d9e1-e9f9-4eaf-92c7-9a14b423f16e"
  );

  await assert.rejects(
    () =>
      receiver.accept(eventHandler, headers, body, async () => ({
        handled: true,
      })),
    /completion unavailable/
  );
  assert.equal(store.complete.mock.callCount(), 1);
  assert.equal(store.release.mock.callCount(), 0);
});

test("event receiver keeps an in-flight duplicate retryable", async () => {
  const secret = "event-secret-for-test";
  const store = {
    claim: test.mock.fn(async () => "busy" as const),
    complete: test.mock.fn(async () => undefined),
    release: test.mock.fn(async () => undefined),
  };
  const receiver = new OpenXiangdaEventReceiver(
    {
      ...eventReceiverOptions(),
      eventSigningSecret: secret,
    },
    store,
    new OpenXiangdaEventContext()
  );
  const body = eventBody({
    id: "event-busy",
    type: "openxiangda.data.record.created.v2",
    recordId: "record-busy",
  });
  const deliveryId = "3fba1d6e-f6aa-452b-97d7-2aa61d77eab8";
  const handler = test.mock.fn(async () => undefined);

  await assert.rejects(
    () =>
      receiver.accept(
        eventHandler,
        eventHeaders(body, secret, deliveryId),
        body,
        handler
      ),
    /另一个实例处理中/
  );
  assert.equal(handler.mock.callCount(), 0);
  assert.equal(store.complete.mock.callCount(), 0);
});

test("event receiver rejects modified payloads before the handler", async () => {
  const receiver = new OpenXiangdaEventReceiver(
    {
      ...eventReceiverOptions(),
      eventSigningSecret: "event-secret-for-test",
    },
    new InMemoryOpenXiangdaEventReceiptStore(),
    new OpenXiangdaEventContext()
  );
  const original = eventBody({
    id: "event-tampered",
    type: "openxiangda.data.record.created.v2",
    recordId: "record-original",
  });
  const headers = eventHeaders(
    original,
    "event-secret-for-test",
    "delivery-1"
  );
  const tampered = eventBody({
    id: "event-tampered",
    type: "openxiangda.data.record.created.v2",
    recordId: "record-tampered",
  });
  await assert.rejects(
    () =>
      receiver.accept(
        eventHandler,
        headers,
        tampered,
        async () => undefined
      ),
    /事件签名无效/
  );
});

test("assignee provider receiver verifies the platform signature and request scope", () => {
  const secret = "workflow-provider-secret";
  const receiver = new OpenXiangdaAssigneeProviderReceiver({
    ...options(globalThis.fetch),
    workflowAssigneeProviderSecrets: {
      "special-lab-reviewers": secret,
    },
  });
  const body = JSON.stringify({
    schemaVersion: SCHEMA_VERSIONS.workflowAssigneeRequest,
    requestId: "request-1",
    providerCode: "special-lab-reviewers",
    appCode: "reference-app",
    environmentKey: "preproduction",
    workflowCode: "reservation-approval",
    nodeId: "special-review",
    businessKey: "reservation-1",
    dataRef: { resourceCode: "reservations", id: "reservation-1" },
    dataRevision: 7,
    definitionVersion: 4,
    bindingVersion: 3,
    factDigest: "a".repeat(64),
    facts: { labId: "lab-1" },
    organizationContext: {},
    initiator: { userId: "user-1", source: "initiator" },
    authzVersion: 3,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const request = receiver.accept(
    "special-lab-reviewers",
    {
      "x-openxiangda-workflow-provider": "special-lab-reviewers",
      "x-openxiangda-request-id": "request-1",
      "x-openxiangda-timestamp": timestamp,
      "x-openxiangda-signature": `v1=${signature}`,
    },
    body
  );
  assert.equal(request.requestId, "request-1");
  assert.equal(request.appCode, "reference-app");
});

test("assignee provider receiver accepts a staged next secret during zero-downtime rotation", () => {
  const nextSecret = "workflow-provider-secret-next";
  const receiver = new OpenXiangdaAssigneeProviderReceiver({
    ...options(globalThis.fetch),
    workflowAssigneeProviderSecrets: {
      "special-lab-reviewers": ["workflow-provider-secret", nextSecret],
    },
  });
  const body = JSON.stringify({
    schemaVersion: SCHEMA_VERSIONS.workflowAssigneeRequest,
    requestId: "request-rotation",
    providerCode: "special-lab-reviewers",
    appCode: "reference-app",
    environmentKey: "preproduction",
    workflowCode: "reservation-approval",
    nodeId: "special-review",
    businessKey: "reservation-1",
    dataRef: { resourceCode: "reservations", id: "reservation-1" },
    dataRevision: 7,
    definitionVersion: 4,
    bindingVersion: 3,
    factDigest: "a".repeat(64),
    facts: {},
    organizationContext: {},
    initiator: { userId: "user-1", source: "initiator" },
    authzVersion: 3,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", nextSecret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  assert.equal(
    receiver.accept(
      "special-lab-reviewers",
      {
        "x-openxiangda-workflow-provider": "special-lab-reviewers",
        "x-openxiangda-request-id": "request-rotation",
        "x-openxiangda-timestamp": timestamp,
        "x-openxiangda-signature": `v1=${signature}`,
      },
      body
    ).requestId,
    "request-rotation"
  );
});

test("workflow provider candidates are validated, normalized and deduplicated", () => {
  assert.deepEqual(
    normalizeWorkflowCandidates([
      { userId: " user-1 ", source: " application_provider " },
      { userId: "user-1", source: "application_provider" },
      {
        userId: "user-1",
        roleSubjectKey: "membership:00000000-0000-4000-8000-000000000002",
        roleSubjectKind: "membership",
        roleSubjectRevision: 3,
        roleCode: "college_admin",
        source: "application_provider",
      },
    ]),
    [
      { userId: "user-1", source: "application_provider" },
      {
        userId: "user-1",
        roleSubjectKey: "membership:00000000-0000-4000-8000-000000000002",
        roleCode: "college_admin",
        source: "application_provider",
      },
    ]
  );
  assert.throws(
    () => normalizeWorkflowCandidates([{ userId: "", source: "test" }]),
    /候选人不合法/
  );
});
