import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, createPublicKey, verify } from "node:crypto";
import type {
  GatewayAssertionJwk,
  GatewayInvocationPrincipal,
  GatewayInvocationTarget,
} from "openxiangda-contracts";
import { SCHEMA_VERSIONS } from "openxiangda-contracts";
import { OpenXiangdaPlatformClient } from "./platform-client.js";
import { OPENXIANGDA_MODULE_OPTIONS } from "./tokens.js";
import type {
  OpenXiangdaHttpRequest,
  OpenXiangdaModuleOptions,
} from "./types.js";

interface GatewayAssertionPayload {
  assertion_contract: "native-2";
  iss: "openxiangda-platform-gateway";
  aud: "openxiangda-app-backend";
  tenant_id: string;
  app_code: string;
  environment_id: string;
  environment_key: string;
  app_version_id: string;
  deployment_run_id: string;
  head_revision: number;
  backend_revision_id: string;
  method: string;
  normalized_path: string;
  canonical_query_digest: string;
  body_digest: string;
  invocation_token_digest: string;
  perspective_code: string | null;
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
}

@Injectable()
export class OpenXiangdaGatewayAssertionVerifier {
  private keys = new Map<string, GatewayAssertionJwk>();
  private keysExpireAt = 0;

  constructor(
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient,
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    private readonly options: OpenXiangdaModuleOptions
  ) {}

  async verify(input: {
    assertion: string;
    invocationToken: string;
    request: OpenXiangdaHttpRequest;
  }): Promise<GatewayAssertionPayload> {
    const parts = input.assertion.split(".");
    if (parts.length !== 3 || parts.some(part => !part)) {
      return this.fail("OPENXIANGDA_GATEWAY_ASSERTION_FORMAT_INVALID");
    }
    let header: Record<string, unknown>;
    let payload: GatewayAssertionPayload;
    try {
      header = JSON.parse(
        Buffer.from(parts[0]!, "base64url").toString("utf8")
      ) as Record<string, unknown>;
      payload = JSON.parse(
        Buffer.from(parts[1]!, "base64url").toString("utf8")
      ) as GatewayAssertionPayload;
    } catch {
      return this.fail("OPENXIANGDA_GATEWAY_ASSERTION_FORMAT_INVALID");
    }
    if (
      header.alg !== "EdDSA" ||
      header.typ !== "openxiangda-gateway+jws" ||
      !String(header.kid || "")
    ) {
      return this.fail("OPENXIANGDA_GATEWAY_ASSERTION_HEADER_INVALID");
    }
    const kid = String(header.kid);
    let key = await this.key(kid, false);
    if (!key) key = await this.key(kid, true);
    if (!key) return this.fail("OPENXIANGDA_GATEWAY_ASSERTION_KEY_UNKNOWN");
    let signatureValid = false;
    try {
      signatureValid = verify(
        null,
        Buffer.from(`${parts[0]}.${parts[1]}`),
        (createPublicKey as any)({ key, format: "jwk" }),
        Buffer.from(parts[2]!, "base64url")
      );
    } catch {
      signatureValid = false;
    }
    if (!signatureValid) {
      return this.fail("OPENXIANGDA_GATEWAY_ASSERTION_SIGNATURE_INVALID");
    }
    this.assertPayload(payload, input);
    return payload;
  }

  private assertPayload(
    payload: GatewayAssertionPayload,
    input: {
      invocationToken: string;
      request: OpenXiangdaHttpRequest;
    }
  ) {
    const now = Math.floor(Date.now() / 1000);
    const request = requestFacts(input.request);
    if (
      payload.assertion_contract !== "native-2" ||
      payload.iss !== "openxiangda-platform-gateway" ||
      payload.aud !== "openxiangda-app-backend" ||
      !payload.jti ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.nbf) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.nbf > now + 5 ||
      payload.iat > now + 5 ||
      payload.exp < now - 5 ||
      payload.exp <= payload.iat ||
      payload.exp - payload.iat > 30 ||
      payload.app_code !== this.options.appCode ||
      payload.environment_key !== this.options.environmentKey ||
      payload.environment_id !== this.options.environmentId ||
      payload.app_version_id !== this.options.appVersionId ||
      payload.deployment_run_id !== this.options.deploymentRunId ||
      payload.head_revision !== this.options.environmentHeadRevision ||
      payload.backend_revision_id !== this.options.backendRevisionId ||
      payload.method !== request.method ||
      payload.normalized_path !== request.path ||
      payload.canonical_query_digest !== digest(request.canonicalQuery) ||
      payload.body_digest !== digest(request.body) ||
      payload.invocation_token_digest !== digest(input.invocationToken) ||
      payload.perspective_code !== perspectiveCode(input.request)
    ) {
      this.fail("OPENXIANGDA_GATEWAY_ASSERTION_CONTEXT_INVALID");
    }
  }

  private async key(kid: string, force: boolean) {
    if (force || Date.now() >= this.keysExpireAt || this.keys.size === 0) {
      const jwks = await this.platform.gatewayAssertionKeys();
      if (jwks.schemaVersion !== SCHEMA_VERSIONS.gatewayAssertionJwks) {
        this.fail("OPENXIANGDA_GATEWAY_ASSERTION_JWKS_INVALID");
      }
      const next = new Map<string, GatewayAssertionJwk>();
      for (const key of jwks.keys || []) {
        if (
          key.kty !== "OKP" ||
          key.crv !== "Ed25519" ||
          key.alg !== "EdDSA" ||
          key.use !== "sig" ||
          !/^[A-Za-z0-9._-]{1,128}$/.test(key.kid) ||
          !key.x
        ) {
          this.fail("OPENXIANGDA_GATEWAY_ASSERTION_JWKS_INVALID");
        }
        next.set(key.kid, key);
      }
      if (next.size < 1 || next.size > 3) {
        this.fail("OPENXIANGDA_GATEWAY_ASSERTION_JWKS_INVALID");
      }
      this.keys = next;
      this.keysExpireAt = Date.now() + 30_000;
    }
    return this.keys.get(kid);
  }

  private fail(code: string): never {
    throw new UnauthorizedException({ code });
  }
}

@Injectable()
export class OpenXiangdaGatewayTransportGuard implements CanActivate {
  constructor(
    @Inject(OpenXiangdaGatewayAssertionVerifier)
    private readonly verifier: OpenXiangdaGatewayAssertionVerifier,
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient,
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    private readonly options: OpenXiangdaModuleOptions
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const request = context.switchToHttp().getRequest<OpenXiangdaHttpRequest>();
    const path = requestFacts(request).path;
    if (gatewayExemptRequest(request, path)) return true;
    if (
      this.options.connectedDevelopment &&
      header(request, "x-openxiangda-connected-dev") === "1"
    ) {
      return await this.acceptConnectedDevelopment(request);
    }
    const authorization = header(request, "authorization");
    const token = authorization.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
    if (!token) this.fail("OPENXIANGDA_INVOCATION_TOKEN_REQUIRED");
    const assertion = header(
      request,
      "x-openxiangda-gateway-assertion"
    ).trim();
    if (!assertion) this.fail("OPENXIANGDA_GATEWAY_ASSERTION_REQUIRED");
    const payload = await this.verifier.verify({
      assertion,
      invocationToken: token,
      request,
    });
    const invocation = await this.platform.verifyGatewayInvocation(
      authorization,
      assertion
    );
    this.assertInvocation(invocation, payload);
    request.openxiangdaInvocation = {
      ...invocation,
      authorization,
      perspectiveCode: payload.perspective_code,
    };
    return true;
  }

  private async acceptConnectedDevelopment(request: OpenXiangdaHttpRequest) {
    const remoteAddress = String(request.raw?.socket?.remoteAddress || "");
    if (!isLoopback(remoteAddress)) {
      this.fail("OPENXIANGDA_CONNECTED_DEV_LOOPBACK_REQUIRED");
    }
    const authorization = header(request, "authorization");
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      this.fail("OPENXIANGDA_INVOCATION_TOKEN_REQUIRED");
    }
    const sessionToken = header(
      request,
      "x-openxiangda-dev-session"
    ).trim();
    if (!sessionToken) {
      this.fail("OPENXIANGDA_CONNECTED_DEV_SESSION_REQUIRED");
    }
    const session = await this.platform.connectedDevelopmentSession(
      authorization,
      sessionToken
    );
    const sessionModeValid =
      (session.mode === "published-resources" &&
        session.manifestOverlay === false &&
        session.additiveSchemaSync === false) ||
      (session.mode === "manifest-overlay" &&
        session.manifestOverlay === true &&
        session.additiveSchemaSync === true);
    if (
      session.schemaVersion !== "openxiangda.connected-dev-session/v2" ||
      !sessionModeValid ||
      session.environment.key !== this.options.environmentKey ||
      session.environment.id !== this.options.environmentId ||
      !session.environment.activeAppVersionId ||
      !Number.isSafeInteger(session.environment.headRevision) ||
      session.environment.headRevision < 1 ||
      session.principal.type !== "developer" ||
      !session.principal.userId ||
      session.subjectProfile?.userId !== session.principal.userId ||
      !isHumanDisplayName(
        session.subjectProfile?.displayName,
        session.principal.userId
      ) ||
      typeof session.principal.isAppSuperAdmin !== "boolean" ||
      session.principal.roleCodes.length < 1 ||
      !Array.isArray(session.principal.capabilityCodes) ||
      !session.principal.roleCodes.every(code =>
        /^[A-Za-z0-9._:-]{1,128}$/.test(code)
      ) ||
      !session.principal.capabilityCodes.every(code =>
        /^[A-Za-z0-9*._:-]{1,256}$/.test(code)
      )
    ) {
      this.fail("OPENXIANGDA_CONNECTED_DEV_IDENTITY_INVALID");
    }
    const roleCodes = [...new Set(session.principal.roleCodes)];
    request.openxiangda = {
      principal: {
        principalType: "developer",
        userId: session.principal.userId,
        displayName: session.subjectProfile.displayName.trim(),
        appCode: this.options.appCode,
        environmentId: session.environment.id,
        environmentKey: session.environment.key,
        activeAppVersionId: session.environment.activeAppVersionId,
        environmentHeadRevision: session.environment.headRevision,
        roleCodes,
        isAppSuperAdmin: session.principal.isAppSuperAdmin,
        capabilityCodes: [...new Set(session.principal.capabilityCodes)],
      },
      authorization,
      perspectiveCode: perspectiveCode(request),
      roleCodes,
      connectedDevelopmentSessionToken: sessionToken,
    };
    return true;
  }

  private assertInvocation(
    invocation: GatewayInvocationPrincipal,
    payload: GatewayAssertionPayload
  ) {
    const target = invocation?.target;
    if (
      invocation?.schemaVersion !==
        SCHEMA_VERSIONS.gatewayInvocationPrincipal ||
      !target ||
      !sameTarget(target, payload) ||
      target.appCode !== this.options.appCode ||
      target.environmentKey !== this.options.environmentKey ||
      target.environmentId !== this.options.environmentId ||
      target.appVersionId !== this.options.appVersionId ||
      target.deploymentRunId !== this.options.deploymentRunId ||
      target.headRevision !== this.options.environmentHeadRevision ||
      target.backendRevisionId !== this.options.backendRevisionId
    ) {
      this.fail("OPENXIANGDA_GATEWAY_INVOCATION_CONTEXT_INVALID");
    }
    if (
      invocation.principal.principalType === "user" &&
      !isHumanDisplayName(
        invocation.principal.displayName,
        invocation.principal.userId
      )
    ) {
      this.fail("OPENXIANGDA_GATEWAY_USER_DISPLAY_NAME_INVALID");
    }
  }

  private fail(code: string): never {
    throw new UnauthorizedException({ code });
  }
}

function isHumanDisplayName(value: unknown, userId: string) {
  const candidate = String(value || "").trim();
  if (!candidate || candidate === String(userId || "").trim()) return false;
  if (candidate.startsWith("__")) return false;
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    candidate
  );
}

function requestFacts(request: OpenXiangdaHttpRequest) {
  const method = String(request.method || "GET").toUpperCase();
  const rawUrl = String(
    request.raw?.url || request.originalUrl || request.url || "/"
  );
  let url: URL;
  try {
    url = new URL(rawUrl, "http://openxiangda-runtime.local");
  } catch {
    throw new UnauthorizedException({
      code: "OPENXIANGDA_GATEWAY_REQUEST_URL_INVALID",
    });
  }
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    throw new UnauthorizedException({
      code: "OPENXIANGDA_GATEWAY_REQUEST_URL_INVALID",
    });
  }
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\0") ||
    path.split("/").some(part => part === "." || part === "..")
  ) {
    throw new UnauthorizedException({
      code: "OPENXIANGDA_GATEWAY_REQUEST_URL_INVALID",
    });
  }
  const entries = [...url.searchParams.entries()].sort(
    ([leftName, leftValue], [rightName, rightValue]) =>
      leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue)
  );
  const query = new URLSearchParams();
  for (const [name, value] of entries) query.append(name, value);
  let body: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  if (!["GET", "HEAD"].includes(method)) {
    if (Buffer.isBuffer(request.rawBody)) {
      body = request.rawBody;
    } else if (Buffer.isBuffer(request.body)) {
      body = request.body;
    } else if (request.body !== undefined) {
      throw new UnauthorizedException({
        code: "OPENXIANGDA_GATEWAY_RAW_BODY_REQUIRED",
      });
    }
  }
  return { method, path, canonicalQuery: query.toString(), body };
}

function gatewayExemptRequest(request: OpenXiangdaHttpRequest, path: string) {
  if (
    ["/__platform/health", "/__platform/ready", "/__platform/version"].includes(
      path
    )
  ) {
    return true;
  }
  const hasSignedCallbackEnvelope =
    Boolean(header(request, "x-openxiangda-signature")) &&
    Boolean(header(request, "x-openxiangda-timestamp"));
  if (!hasSignedCallbackEnvelope) return false;
  const isEventDelivery =
    path.startsWith("/__platform/events/") &&
    Boolean(header(request, "x-openxiangda-subscription-code")) &&
    Boolean(header(request, "x-openxiangda-delivery-id"));
  const isAssigneeProviderCall =
    path.startsWith("/openxiangda/workflow/assignee-providers/") &&
    Boolean(header(request, "x-openxiangda-workflow-provider")) &&
    Boolean(header(request, "x-openxiangda-request-id"));
  return isEventDelivery || isAssigneeProviderCall;
}

function sameTarget(
  target: GatewayInvocationTarget,
  payload: GatewayAssertionPayload
) {
  return (
    target.tenantId === payload.tenant_id &&
    target.appCode === payload.app_code &&
    target.environmentId === payload.environment_id &&
    target.environmentKey === payload.environment_key &&
    target.appVersionId === payload.app_version_id &&
    target.deploymentRunId === payload.deployment_run_id &&
    target.headRevision === payload.head_revision &&
    target.backendRevisionId === payload.backend_revision_id
  );
}

function header(request: OpenXiangdaHttpRequest, name: string) {
  const value = request.headers[name] || request.headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function perspectiveCode(request: OpenXiangdaHttpRequest) {
  const value = header(request, "x-openxiangda-perspective").trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9._-]{0,127}$/.test(value)) {
    throw new UnauthorizedException({ code: "OPENXIANGDA_PERSPECTIVE_INVALID" });
  }
  return value;
}

function isLoopback(value: string) {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function digest(value: Buffer<ArrayBufferLike> | string) {
  return createHash("sha256").update(value).digest("base64url");
}
