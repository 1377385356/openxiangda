import {
  canonicalJson,
  sha256Digest,
  type ConfigurationBundleV3,
  type ContractBundleV3,
  type DataFieldPolicy,
} from 'openxiangda-contracts';

export type PermissionReviewFieldRequirement =
  | { kind: 'inherit-resource-operation' }
  | { kind: 'deny' }
  | { kind: 'all-of'; capabilityCodes: string[] };

function fieldRequirement(
  policy: DataFieldPolicy,
  operation: 'read' | 'create' | 'update',
): PermissionReviewFieldRequirement {
  const capabilities = policy[operation];
  if (capabilities === undefined) return { kind: 'inherit-resource-operation' };
  if (capabilities.length === 0) return { kind: 'deny' };
  return { kind: 'all-of', capabilityCodes: [...capabilities].sort() };
}

function byCode<T extends { code: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((left, right) => left.code.localeCompare(right.code));
}

/**
 * A normalized review of sealed declarations, never an authorization engine.
 * References join roles to capability requirements and pages to resources/views;
 * no role × page × field cross product or new grant state is generated.
 */
export function buildPermissionReview(
  configuration: ConfigurationBundleV3,
  contracts: ContractBundleV3,
) {
  if (
    configuration.appCode !== contracts.appCode ||
    sha256Digest(configuration) !== contracts.configDigest
  ) {
    throw new Error('PERMISSION_REVIEW_CONFIG_MISMATCH: use configuration and contracts from the same compilation');
  }

  const adminRouteCodes = new Set(
    contracts.adminPages.flatMap(page => page.routeCode ? [page.routeCode] : []),
  );
  const standardRouteCodes = new Set(contracts.routeManifest.routes.flatMap(route => [
    route.desktop.routeCode,
    route.mobile.routeCode,
  ]));
  const review = {
    schemaVersion: 'openxiangda.permission-review/v2' as const,
    appCode: configuration.appCode,
    configDigest: contracts.configDigest,
    contractDigest: sha256Digest(contracts),
    authority: 'declaration-projection' as const,
    runtimeAuthorizationRequired: true as const,
    semantics: {
      roleCapabilities: 'sealed-declared-grants; current-user application roles are unioned' as const,
      roleDeniedCapabilities: 'removed from that role during compilation; not a global deny across roles' as const,
      capabilityMatch: 'static prerequisite only; never runtime allow' as const,
      fieldPolicies: 'resource operation is required; field rules can only narrow it; empty is deny' as const,
      hiddenFields: 'presentation only; not an authorization rule' as const,
      rowPolicies: 'raw declarations; evaluated by the platform with current identity, grants and record facts' as const,
      workflowTasks: 'platform Task Surface and fresh command token decide current participant, state, field and operation access' as const,
      navigation: 'page selection and visibility do not grant resource or operation access' as const,
      perspectives: 'read projections only; never replace the actor or mutation/workflow authorization' as const,
    },
    roles: byCode(configuration.authz.roles).map(role => ({
      code: role.code,
      name: role.name,
      ...(role.description ? { description: role.description } : {}),
      capabilityCodes: [...role.capabilities].sort(),
    })),
    capabilities: byCode(contracts.capabilities),
    perspectives: byCode(contracts.perspectives),
    pages: {
      adminAccess: contracts.adminAccess ?? null,
      admin: byCode(contracts.adminPages),
      custom: byCode(contracts.routes.filter(route =>
        !adminRouteCodes.has(route.code) && !standardRouteCodes.has(route.code),
      )),
      standard: byCode(contracts.routeManifest.routes),
    },
    resources: byCode(configuration.data.resources).map(resource => ({
      code: resource.code,
      name: resource.name,
      operationCapabilities: resource.capabilities,
      dataPolicyCode: resource.dataPolicyCode ?? null,
      mutationOwner: resource.surface?.mutationOwner ?? null,
      generated: resource.surface?.generated ?? null,
      views: byCode(resource.surface?.views ?? []).map(view => ({
        code: view.code,
        name: view.name,
        generated: view.generated,
        fieldOrder: {
          list: view.list.fieldOrder,
          form: view.form.fieldOrder,
          detail: view.detail.fieldOrder,
        },
        mobile: view.mobile,
      })),
      defaultFieldOrder: resource.surface ? {
        list: resource.surface.list?.fieldOrder ?? null,
        form: resource.surface.form?.fieldOrder ?? null,
        detail: resource.surface.detail?.fieldOrder ?? null,
      } : null,
      fields: byCode(resource.schema.fields).map(field => {
        const policy = resource.fieldPolicies[field.code] ?? {};
        const surface = resource.surface?.fields[field.code];
        return {
          code: field.code,
          type: field.type,
          label: surface?.label ?? field.code,
          hidden: surface?.hidden ?? false,
          system: surface?.system ?? false,
          read: fieldRequirement(policy, 'read'),
          create: fieldRequirement(policy, 'create'),
          update: fieldRequirement(policy, 'update'),
          mask: policy.mask ?? null,
        };
      }),
    })),
    authorization: {
      authenticatedUserRoleCode: configuration.authz.authenticatedUserRoleCode ?? null,
      dataPolicies: byCode(configuration.authz.dataPolicies),
      scopeDimensions: byCode(configuration.authz.scopeDimensions),
      scopeSources: byCode(configuration.authz.scopeSources),
      roleMembershipSources: byCode(configuration.authz.roleMembershipSources),
      relationshipGrantSources: byCode(configuration.authz.relationshipGrantSources),
      authorizationTransitions: [...configuration.authz.authorizationTransitions].sort((left, right) =>
        left.fromAuthzDigest.localeCompare(right.fromAuthzDigest),
      ),
      publicAccess: configuration.frontend.publicAccess ?? null,
    },
    operations: byCode(contracts.operations),
    workflows: {
      runtimeAuthorizationRequired: true as const,
      contracts: byCode(contracts.workflows),
      definitions: [...configuration.workflows.definitions].sort((left, right) =>
        left.definition.code.localeCompare(right.definition.code) || left.version - right.version,
      ).map(({ version, definition }) => ({
        workflowCode: definition.code,
        version,
        subject: definition.subject,
        organizationContext: definition.organizationContext ?? null,
        startAt: definition.startAt,
        nodes: definition.nodes,
      })),
      bindings: [...configuration.workflows.bindings].sort((left, right) =>
        left.binding.workflowCode.localeCompare(right.binding.workflowCode) || left.version - right.version,
      ),
      activations: [...configuration.workflows.activations].sort((left, right) =>
        left.workflowCode.localeCompare(right.workflowCode),
      ),
      providers: byCode(configuration.workflows.providers),
      editableParameters: byCode(configuration.workflows.editableParameters),
    },
  };
  // Do not share mutable arrays/objects with compiler output or change its digest.
  const value = JSON.parse(canonicalJson(review)) as typeof review;
  return { ...value, digest: sha256Digest(value) };
}

export type PermissionReview = ReturnType<typeof buildPermissionReview>;
