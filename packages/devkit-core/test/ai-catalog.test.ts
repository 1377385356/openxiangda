import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_VERSIONS, sha256Digest } from "openxiangda-contracts";
import {
  compileAiCapabilityCatalog,
  compileApplicationSources,
  validateAppConfig,
} from "../src/index.js";

const config = {
  schemaVersion: 3,
  app: { code: "visitor-app", name: "访客预约" },
  frontend: { root: "apps/web" },
  backend: { root: "apps/server", runtime: "node", framework: "nestjs" },
  platform: { root: "platform" },
  authz: {
    capabilities: [],
    roles: [],
  },
  data: {
    resources: [
      {
        schemaVersion: SCHEMA_VERSIONS.dataResource,
        appCode: "visitor-app",
        code: "reservations",
        name: "访客预约",
        schema: {
          fields: [
            { code: "visitorName", type: "text.short", nullable: false },
            { code: "visitDate", type: "date", nullable: false },
            { code: "approved", type: "boolean", nullable: true },
            {
              code: "guestCount",
              type: "number.integer",
              nullable: false,
              min: 1,
              max: 20,
            },
          ],
        },
        capabilities: {
          read: "app:visitor-app:data:reservations:read",
          create: "app:visitor-app:data:reservations:create",
          update: "app:visitor-app:data:reservations:update",
          delete: "app:visitor-app:data:reservations:delete",
        },
        fieldPolicies: {},
      },
    ],
  },
} as const;

test("generates one bounded CRUD capability set per active resource", () => {
  const catalog = compileAiCapabilityCatalog(config);
  assert.equal(catalog.schemaVersion, SCHEMA_VERSIONS.aiCapabilityCatalog);
  assert.deepEqual(
    catalog.capabilities.map(item => item.code),
    [
      "visitor-app.reservations.create",
      "visitor-app.reservations.delete",
      "visitor-app.reservations.get",
      "visitor-app.reservations.query",
      "visitor-app.reservations.update",
    ]
  );
  const query = catalog.capabilities.find(item => item.operation === "query");
  assert.equal(query?.confirmation, "none");
  assert.equal(query?.limits.maxRows, 100);
  assert.deepEqual(query?.authorization.capabilities, [
    "app:visitor-app:data:reservations:read",
  ]);
  assert.deepEqual(query?.inputSchema.required, ["schemaVersion"]);
  assert.deepEqual(query?.inputSchema.properties, {
    schemaVersion: { const: SCHEMA_VERSIONS.dataQuery },
    where: query?.inputSchema.properties?.where,
    select: query?.inputSchema.properties?.select,
    order: query?.inputSchema.properties?.order,
    limit: { type: "integer", minimum: 1, maximum: 100 },
    offset: { type: "integer", minimum: 0, maximum: 100000 },
  });
  assert.equal(
    query?.outputSchema.properties?.schemaVersion?.const,
    SCHEMA_VERSIONS.dataPage
  );
  const update = catalog.capabilities.find(item => item.operation === "update");
  assert.equal(update?.confirmation, "required");
  assert.equal(update?.idempotency, "required");
  assert.equal(update?.concurrency, "revision");
  const create = catalog.capabilities.find(item => item.operation === "create");
  assert.equal(create?.inputSchema.properties?.guestCount?.minimum, 1);
  assert.equal(create?.inputSchema.properties?.guestCount?.maximum, 20);
  const remove = catalog.capabilities.find(item => item.operation === "delete");
  assert.equal(remove?.risk, "destructive");
  assert.equal(remove?.confirmation, "required");
});

test("does not generate Native AI operations outside the declared resource surface", () => {
  const catalog = compileAiCapabilityCatalog({
    ...config,
    data: {
      resources: [
        {
          ...config.data.resources[0],
          surface: {
            mutationOwner: "action",
            generated: {
              list: true,
              detail: false,
              create: false,
              update: false,
              delete: false,
            },
            fields: {},
            list: { defaultPageSize: 20 },
            form: { layout: "flat", fieldOrder: [] },
            detail: { layout: "flat", fieldOrder: [] },
            mobile: { enabled: true },
          },
        },
      ],
    },
  });
  assert.deepEqual(
    catalog.capabilities.map(item => item.code),
    ["visitor-app.reservations.query"]
  );
});

test("rejects inferred or unbounded AI operation declarations", () => {
  const diagnostics = validateAppConfig({
    ...config,
    backend: {
      root: "apps/server",
      runtime: "node",
      framework: "nestjs",
      operations: [
        {
          code: "reservation_enroll",
          method: "GET",
          path: "/api/reservations/enroll",
          capability: "app:visitor-app:reservation:enroll",
          resources: ["reservations"],
          requestSchema: { type: "object" },
          responseSchema: { type: "object" },
          ai: {
            name: "预约",
            description: "错误地把 GET 声明成写操作",
            risk: "write",
            resources: ["missing-resource"],
            sideEffects: [],
            timeoutMs: 60000,
          },
        },
      ],
    },
  });
  const codes = new Set(diagnostics.map(item => item.code));
  assert.equal(codes.has("APP_CONFIG_BACKEND_OPERATION_RESOURCES_REMOVED"), true);
  assert.equal(codes.has("APP_CONFIG_BACKEND_OPERATION_AI_INVALID"), true);
});

test("keeps the AI catalog deterministic and tied to normalized config", () => {
  const first = compileApplicationSources(config);
  const second = compileApplicationSources(config);
  assert.equal(first.aiCatalog.digest, second.aiCatalog.digest);
  assert.equal(first.aiCatalog.digest, sha256Digest(first.aiCatalog.value));
  assert.equal(first.aiCatalog.value.sourceConfigDigest, first.config.digest);
  assert.equal(
    first.aiCatalog.content.endsWith("\n"),
    false,
    "catalog bytes must use the same canonical JSON boundary as other contracts"
  );
});

test("publishes only explicitly declared backend AI actions", () => {
  const catalog = compileAiCapabilityCatalog({
    ...config,
    backend: {
      root: "apps/server",
      runtime: "node",
      framework: "nestjs",
      operations: [
        {
          code: "reservation.enroll",
          method: "POST",
          path: "/api/reservations/enroll",
          capability: "app:visitor-app:reservation:enroll",
          requestSchema: {
            type: "object",
            required: ["reservationId"],
            properties: { reservationId: { type: "string" } },
          },
          responseSchema: { type: "object" },
          description: "提交预约并执行业务校验",
          ai: {
            name: "提交访客预约",
            description: "提交预约并执行重复预约校验",
            risk: "write",
            resources: ["reservations"],
            sideEffects: ["创建访客预约"],
            concurrency: "none",
            timeoutMs: 8000,
          },
        },
        {
          code: "reservation.internal-health",
          method: "GET",
          path: "/api/reservations/internal-health",
          capability: "app:visitor-app:reservation:internal-health",
          requestSchema: { type: "object" },
          responseSchema: { type: "object" },
        },
      ],
    },
  });
  const custom = catalog.capabilities.find(
    item => item.operation === "custom"
  );
  assert.deepEqual(custom, {
    code: "visitor-app.custom.reservation.enroll",
    appCode: "visitor-app",
    name: "提交访客预约",
    description: "提交预约并执行重复预约校验",
    kind: "customAction",
    operation: "custom",
    resources: ["reservations"],
    inputSchema: {
      type: "object",
      required: ["reservationId"],
      properties: { reservationId: { type: "string" } },
    },
    outputSchema: { type: "object" },
    authorization: {
      capabilities: ["app:visitor-app:reservation:enroll"],
    },
    risk: "write",
    confirmation: "required",
    idempotency: "required",
    concurrency: "none",
    limits: { timeoutMs: 8000 },
    sideEffects: ["创建访客预约"],
    binding: {
      kind: "app-api",
      operationCode: "reservation.enroll",
      method: "POST",
      path: "/api/reservations/enroll",
    },
  });
  assert.equal(
    catalog.capabilities.some(item =>
      item.code.includes("internal-health")
    ),
    false
  );
});
