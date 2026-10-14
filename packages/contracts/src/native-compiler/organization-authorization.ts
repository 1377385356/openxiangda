/** Neutral organization/directory declarations shared by both compilers. */
export const NATIVE_DIRECTORY_ROLE_SOURCE_LIMITS = {
  sources: 32,
  scopes: 16,
  facts: 512,
} as const;

export class NativeOrganizationAuthorizationError extends Error {
  constructor(readonly code: string, readonly pointer: string) {
    super(code);
  }
}
const object = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
const fail = (code: string, pointer: string): never => {
  throw new NativeOrganizationAuthorizationError(code, pointer);
};
const stable = (value: unknown, pointer: string, maximum = 100) => {
  if (
    typeof value !== "string" ||
    value.length > maximum ||
    !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value)
  )
    fail("NATIVE_DIRECTORY_ROLE_IDENTIFIER_INVALID", pointer);
  return value as string;
};

export const directoryRoleSourceSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "code",
    "name",
    "source",
    "roleFactCode",
    "roleCode",
    "scopes",
    "failureMode",
  ],
  properties: {
    code: { type: "string", minLength: 1, maxLength: 100 },
    name: { type: "string", minLength: 1, maxLength: 255 },
    source: { type: "string", minLength: 1, maxLength: 64 },
    roleFactCode: { type: "string", minLength: 1, maxLength: 64 },
    roleCode: { type: "string", minLength: 1, maxLength: 128 },
    failureMode: { const: "strict" },
    scopes: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimensionCode", "scopeType", "operations"],
        properties: {
          dimensionCode: { type: "string", minLength: 1, maxLength: 100 },
          scopeType: { type: "string", minLength: 1, maxLength: 64 },
          operations: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            uniqueItems: true,
            items: { type: "string", minLength: 1, maxLength: 64 },
          },
        },
      },
    },
  },
} as const;

/** Missing policies preserve traditional tenants; opting in requires one explicit authority. */
export function validateNativeOrganizationAuthorization(
  value: unknown,
  pointer = "/config"
) {
  const config = object(value),
    authz = object(config.authz),
    data = object(config.data);
  const roles = Array.isArray(authz.roles) ? authz.roles.map(object) : [];
  const dimensions = new Map<string, Record<string, any>>(
    (Array.isArray(authz.scopeDimensions) ? authz.scopeDimensions : []).map(
      (value: unknown) => {
        const d = object(value);
        return [d.code, d];
      }
    )
  );
  for (const [index, role] of roles.entries()) {
    if (
      role.organizationReach !== undefined &&
      !["self", "subtree"].includes(role.organizationReach)
    )
      fail(
        "NATIVE_ORGANIZATION_REACH_INVALID",
        `${pointer}/authz/roles/${index}/organizationReach`
      );
    if (
      role.organizationReach !== undefined &&
      role.code === authz.authenticatedUserRoleCode
    )
      fail(
        "NATIVE_ORGANIZATION_BASELINE_ROLE_FORBIDDEN",
        `${pointer}/authz/authenticatedUserRoleCode`
      );
  }
  const sources = authz.directoryRoleSources;
  if (
    sources !== undefined &&
    (!Array.isArray(sources) ||
      sources.length > NATIVE_DIRECTORY_ROLE_SOURCE_LIMITS.sources)
  )
    fail(
      "NATIVE_DIRECTORY_ROLE_SOURCE_CAPACITY",
      `${pointer}/authz/directoryRoleSources`
    );
  const codes = new Set<string>();
  for (const [index, raw] of (sources || []).entries()) {
    const source = object(raw),
      path = `${pointer}/authz/directoryRoleSources/${index}`;
    if (
      Object.keys(source).some(
        (key) =>
          ![
            "code",
            "name",
            "source",
            "roleFactCode",
            "roleCode",
            "scopes",
            "failureMode",
          ].includes(key)
      )
    )
      fail("NATIVE_DIRECTORY_ROLE_SOURCE_INVALID", path);
    const code = stable(source.code, `${path}/code`);
    if (codes.has(code))
      fail("NATIVE_DIRECTORY_ROLE_SOURCE_DUPLICATE", `${path}/code`);
    codes.add(code);
    if (
      typeof source.name !== "string" ||
      !source.name.trim() ||
      source.name.length > 255 ||
      source.failureMode !== "strict"
    )
      fail("NATIVE_DIRECTORY_ROLE_SOURCE_INVALID", path);
    stable(source.source, `${path}/source`, 64);
    stable(source.roleFactCode, `${path}/roleFactCode`, 64);
    const role = roles.find((role) => role.code === source.roleCode);
    if (!role || role.organizationReach !== "self")
      fail("NATIVE_DIRECTORY_ROLE_REQUIRES_SELF", `${path}/roleCode`);
    if (
      (Array.isArray(authz.roleMembershipSources)
        ? authz.roleMembershipSources
        : []
      ).some((raw: unknown) => object(raw).roleCode === source.roleCode)
    )
      fail("NATIVE_DIRECTORY_ROLE_OWNER_CONFLICT", `${path}/roleCode`);
    if (
      !Array.isArray(source.scopes) ||
      source.scopes.length > NATIVE_DIRECTORY_ROLE_SOURCE_LIMITS.scopes
    )
      fail("NATIVE_DIRECTORY_ROLE_SCOPES_INVALID", `${path}/scopes`);
    const scopeCodes = new Set<string>();
    for (const [scopeIndex, rawScope] of source.scopes.entries()) {
      const scope = object(rawScope),
        scopePath = `${path}/scopes/${scopeIndex}`;
      if (
        Object.keys(scope).some(
          (key) => !["dimensionCode", "scopeType", "operations"].includes(key)
        )
      )
        fail("NATIVE_DIRECTORY_ROLE_SCOPES_INVALID", scopePath);
      const dimensionCode = stable(
          scope.dimensionCode,
          `${scopePath}/dimensionCode`
        ),
        dimension = dimensions.get(dimensionCode);
      if (
        !dimension ||
        (dimension.valueType || "string") !== "string" ||
        dimension.valueSource ||
        dimension.resourceCode ||
        (dimension.hierarchyMode && dimension.hierarchyMode !== "flat")
      )
        fail(
          "NATIVE_DIRECTORY_ROLE_STRING_DIMENSION_REQUIRED",
          `${scopePath}/dimensionCode`
        );
      if (scopeCodes.has(dimensionCode))
        fail("NATIVE_DIRECTORY_ROLE_SCOPE_DUPLICATE", scopePath);
      scopeCodes.add(dimensionCode);
      stable(scope.scopeType, `${scopePath}/scopeType`, 64);
      if (
        !Array.isArray(scope.operations) ||
        !scope.operations.length ||
        scope.operations.length > 16 ||
        new Set(scope.operations).size !== scope.operations.length
      )
        fail(
          "NATIVE_DIRECTORY_ROLE_OPERATIONS_INVALID",
          `${scopePath}/operations`
        );
      for (const [opIndex, operation] of scope.operations.entries())
        stable(operation, `${scopePath}/operations/${opIndex}`, 64);
    }
  }
  for (const [index, raw] of (Array.isArray(data.resources)
    ? data.resources
    : []
  ).entries()) {
    const resource = object(raw),
      policy = resource.organization;
    if (policy === undefined) continue;
    const path = `${pointer}/data/resources/${index}/organization`;
    if (
      !policy ||
      typeof policy !== "object" ||
      Array.isArray(policy) ||
      Object.keys(policy).some((key) => key !== "mode") ||
      !["none", "owned", "inherited-down"].includes(policy.mode)
    )
      fail("NATIVE_ORGANIZATION_POLICY_INVALID", path);
    if (policy.mode === "none") continue;
    const fields = resource.schema?.fields || resource.fields || [];
    if (fields.some((field: any) => field.code === "organization_id"))
      fail("NATIVE_ORGANIZATION_COLUMN_RESERVED", path);
    for (const field of fields) {
      if (field.type !== "subtable" || !field.subtable?.resourceCode) continue;
      const child = data.resources.find(
        (item: any) => item.code === field.subtable.resourceCode
      );
      if (
        !child ||
        !["owned", "inherited-down"].includes(child.organization?.mode)
      )
        fail("NATIVE_SUBTABLE_ORGANIZATION_POLICY_REQUIRED", path);
    }
    for (const role of roles) {
      if (role.organizationReach) continue;
      const capabilities = Array.isArray(role.capabilities)
        ? role.capabilities
        : [];
      if (
        Object.values(object(resource.capabilities)).some((capability) =>
          capabilities.includes(capability)
        )
      )
        fail(
          "NATIVE_ORGANIZATION_ROLE_REACH_REQUIRED",
          `${pointer}/authz/roles/${roles.indexOf(role)}/organizationReach`
        );
    }
    if (resource.surface?.public || resource.surface?.publicRead)
      fail("NATIVE_ORGANIZATION_PUBLIC_CONTEXT_UNSUPPORTED", path);
  }
}
