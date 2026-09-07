import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type {
  GatewayApplicationPrincipal,
  NativePrincipal,
} from "openxiangda-contracts";
import type { AppApiOperationContract } from "openxiangda-contracts";
import { SCHEMA_VERSIONS } from "openxiangda-contracts";
import { isOpenXiangdaInfrastructureController } from "./infrastructure-controller.js";
import {
  OPENXIANGDA_OPERATION_CONTRACT,
  OPENXIANGDA_REQUIRED_CAPABILITY,
} from "./tokens.js";
import type {
  OpenXiangdaHttpRequest,
  OpenXiangdaCurrentUser,
  OpenXiangdaServicePrincipal,
  OpenXiangdaVerifiedContext,
} from "./types.js";

export const RequireCapability = (capability: string) =>
  SetMetadata(OPENXIANGDA_REQUIRED_CAPABILITY, capability);

/**
 * Binds one controller route to the immutable App API contract and protects it
 * with the same generated capability constant. The release verifier can inspect
 * this metadata without bootstrapping application business code.
 */
export function OpenXiangdaOperation(operation: AppApiOperationContract) {
  return (
    target: object,
    propertyKey?: string | symbol,
    descriptor?: TypedPropertyDescriptor<any>
  ) => {
    SetMetadata(OPENXIANGDA_OPERATION_CONTRACT, operation)(
      target,
      propertyKey as string | symbol,
      descriptor as TypedPropertyDescriptor<any>
    );
    SetMetadata(
      OPENXIANGDA_REQUIRED_CAPABILITY,
      operation.requiredCapability
    )(
      target,
      propertyKey as string | symbol,
      descriptor as TypedPropertyDescriptor<any>
    );
  };
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): NativePrincipal => {
    const principal = requireContext(context).principal;
    if (principal.principalType !== "user") {
      throw new UnauthorizedException("OPENXIANGDA_USER_PRINCIPAL_REQUIRED");
    }
    return principal;
  }
);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OpenXiangdaCurrentUser =>
    currentUserFromVerifiedContext(requireContext(context))
);

export function currentUserFromVerifiedContext(
  verified: OpenXiangdaVerifiedContext
): OpenXiangdaCurrentUser {
  const principal = verified.principal;
  if (principal.principalType === "developer") {
    return {
      userId: principal.userId,
      displayName: principal.displayName,
      appCode: principal.appCode,
      environmentKey: principal.environmentKey,
      roleCodes: [...principal.roleCodes],
      isAppSuperAdmin: principal.isAppSuperAdmin,
      capabilityCodes: [...principal.capabilityCodes],
    };
  }
  if (principal.principalType !== "user") {
    throw new UnauthorizedException("OPENXIANGDA_USER_PRINCIPAL_REQUIRED");
  }
  return currentUserFromPrincipal(principal, verified.roleCodes);
}

export function currentUserFromPrincipal(
  principal: NativePrincipal,
  roleCodes?: string[]
): OpenXiangdaCurrentUser {
  const verifiedRoleCodes =
    roleCodes ||
    principal.roleCodes || [];
  return {
    userId: principal.userId,
    displayName: principal.displayName,
    appCode: principal.appCode,
    environmentKey: principal.environmentKey,
    roleCodes: [...new Set(verifiedRoleCodes)],
    isAppSuperAdmin: principal.isAppSuperAdmin,
    capabilityCodes: [...principal.capabilities],
  };
}

export const CurrentPerspective = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null =>
    requireContext(context).perspectiveCode
);

export const CurrentApplicationPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OpenXiangdaServicePrincipal => {
    const principal = requireContext(context).principal;
    if (principal.principalType !== "service") {
      throw new UnauthorizedException(
        "OPENXIANGDA_APPLICATION_PRINCIPAL_REQUIRED"
      );
    }
    return principal as OpenXiangdaServicePrincipal;
  }
);

export const CurrentOpenXiangdaContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext): OpenXiangdaVerifiedContext =>
    requireContext(context)
);

@Injectable()
export class OpenXiangdaAuthzGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    if (isOpenXiangdaInfrastructureController(context.getClass())) return true;
    const request = context.switchToHttp().getRequest<OpenXiangdaHttpRequest>();
    const operation = this.reflector.getAllAndOverride<AppApiOperationContract>(
      OPENXIANGDA_OPERATION_CONTRACT,
      [context.getHandler(), context.getClass()]
    );
    if (request.openxiangda?.principal.principalType === "developer") {
      // The platform current endpoint has validated the short-lived Dev Session
      // and returned the complete role/capability union. Data operations remain
      // platform-authorized through the same session.
      const capability = this.reflector.getAllAndOverride<string>(
        OPENXIANGDA_REQUIRED_CAPABILITY,
        [context.getHandler(), context.getClass()]
      );
      if (
        capability &&
        !request.openxiangda.principal.isAppSuperAdmin &&
        !request.openxiangda.principal.capabilityCodes.includes(capability)
      ) {
        throw new ForbiddenException({
          code: "OPENXIANGDA_CAPABILITY_DENIED",
          capability,
        });
      }
      if (operation) request.openxiangda.operation = operation;
      return true;
    }
    const invocation = request.openxiangdaInvocation;
    if (!invocation) {
      throw new UnauthorizedException("OPENXIANGDA_GATEWAY_CONTEXT_REQUIRED");
    }
    const { authorization, perspectiveCode } = invocation;
    const capability = this.reflector.getAllAndOverride<string>(
      OPENXIANGDA_REQUIRED_CAPABILITY,
      [context.getHandler(), context.getClass()]
    );
    if (invocation.principal.principalType === "application") {
      const application = invocation.principal;
      if (!application.scopes.includes("app:invoke")) {
        throw new ForbiddenException({
          code: "OPENXIANGDA_APPLICATION_INVOKE_DENIED",
        });
      }
      if (!capability) {
        throw new ForbiddenException({
          code: "OPENXIANGDA_SERVICE_CAPABILITY_REQUIRED",
        });
      }
      if (!application.scopes.includes(capability)) {
        throw new ForbiddenException({
          code: "OPENXIANGDA_CAPABILITY_DENIED",
          capability,
        });
      }
      request.openxiangda = {
        principal: this.servicePrincipal(application, invocation.target),
        authorization,
        perspectiveCode: null,
        ...(operation ? { operation } : {}),
      };
      return true;
    }
    if (this.isVerifiedRoleUnion(invocation.principal)) {
      const roleCodes = [...new Set(invocation.principal.roleCodes)];
      request.openxiangda = {
        principal: invocation.principal,
        authorization,
        perspectiveCode,
        roleCodes,
        ...(operation ? { operation } : {}),
      };
      if (
        capability &&
        !invocation.principal.isAppSuperAdmin &&
        !invocation.principal.capabilities.includes(capability)
      ) {
        throw new ForbiddenException({
          code: "OPENXIANGDA_CAPABILITY_DENIED",
          capability,
        });
      }
      return true;
    }
    throw new UnauthorizedException("OPENXIANGDA_USER_UNION_REQUIRED");
  }

  private isVerifiedRoleUnion(
    principal: NativePrincipal
  ): principal is NativePrincipal & { roleCodes: string[] } {
    return (
      (principal.subjectKind === "role_union" ||
        principal.subjectKind === "super_admin") &&
      Array.isArray(principal.roleCodes) &&
      principal.roleCodes.length <= 32 &&
      principal.roleCodes.every(code =>
        /^[A-Za-z0-9._:-]{1,128}$/.test(code)
      ) &&
      Array.isArray(principal.capabilities) &&
      principal.capabilities.length <= 2000 &&
      principal.capabilities.every(code =>
        /^[A-Za-z0-9*._:-]{1,256}$/.test(code)
      )
    );
  }

  private servicePrincipal(
    input: GatewayApplicationPrincipal,
    target: {
      environmentId: string;
      appVersionId: string;
      deploymentRunId: string;
      headRevision: number;
      backendRevisionId: string;
    }
  ): OpenXiangdaServicePrincipal {
    return {
      schemaVersion: SCHEMA_VERSIONS.principal,
      tenantId: input.tenantId,
      appCode: input.appCode,
      environmentKey: input.environmentKey,
      environmentId: target.environmentId,
      appVersionId: target.appVersionId,
      deploymentRunId: target.deploymentRunId,
      environmentHeadRevision: target.headRevision,
      backendRevisionId: target.backendRevisionId,
      principalType: "service",
      subjectId: input.clientId,
      clientRecordId: input.clientRecordId,
      clientId: input.clientId,
      credentialVersion: input.credentialVersion,
      scopes: input.scopes,
      rateLimitPerMinute: input.rateLimitPerMinute,
      tokenId: input.tokenId,
      authzVersion: input.credentialVersion,
      isAppSuperAdmin: false,
    };
  }
}

function requireContext(context: ExecutionContext) {
  const request = context.switchToHttp().getRequest<OpenXiangdaHttpRequest>();
  if (!request.openxiangda) {
    throw new UnauthorizedException("OPENXIANGDA_CONTEXT_NOT_VERIFIED");
  }
  return request.openxiangda;
}
