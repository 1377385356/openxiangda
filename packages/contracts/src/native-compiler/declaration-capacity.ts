/** Declaration slots share the existing global byte, depth and JSON-node budgets. */
export const NATIVE_CONTRACT_CAPACITY_V2 = Object.freeze({
  perspectives: 100, resources: 512, dataPolicies: 512, roles: 512,
  subjectReadSurfaces: 50, capabilities: 4096, operations: 500,
  eventConsumers: 100, eventProducers: 1000, eventSchemas: 100, eventTypes: 500,
  workflows: 512, routes: 2048, adminPages: 2048,
  adminNavigationGroups: 100, adminNavigationItems: 1024,
} as const);

type CatalogResource = { status?: string; surface?: { mutationOwner?: string; generated?: Partial<Record<'list' | 'detail' | 'create' | 'update' | 'delete', boolean>> } };
/** Shared slot projection; keep catalog generation and capability negotiation aligned. */
export function generatedCrudCapabilityOperations(resource: CatalogResource) {
  const native = (resource.surface?.mutationOwner || 'native') === 'native';
  return (['query', 'get', 'create', 'update', 'delete'] as const).filter(operation => {
    const generated = resource.surface?.generated;
    if (operation === 'query') return generated?.list ?? true;
    if (operation === 'get') return generated?.detail ?? true;
    return generated?.[operation] ?? native;
  });
}
type Declaration = {
  data?: { resources?: readonly CatalogResource[] };
  backend?: { operations?: readonly { ai?: unknown }[] };
  authz?: { roles?: readonly unknown[]; dataPolicies?: readonly unknown[]; capabilities?: readonly unknown[] };
  workflows?: { definitions?: readonly unknown[]; bindings?: readonly unknown[]; activations?: readonly unknown[] };
  frontend?: { routes?: readonly unknown[]; admin?: { navigation?: readonly { items: readonly unknown[] }[] } };
};
/** Role slots beyond the previous server bound require explicit support. */
export function requiresExtendedRoleCapacity(config: Declaration): boolean {
  return (config.authz?.roles?.length || 0) > 256;
}
/** Derived from the sealed declaration; applications cannot assert support. */
export function requiresExtendedDeclarationCapacity(config: Declaration): boolean {
  const catalogSlots = (config.data?.resources || []).filter(resource => resource.status !== 'retired')
    .reduce((count, resource) => count + generatedCrudCapabilityOperations(resource).length, 0) +
    (config.backend?.operations || []).filter(operation => operation.ai).length;
  return (config.data?.resources?.length || 0) > 100 || (config.authz?.dataPolicies?.length || 0) > 100 ||
    (config.authz?.roles?.length || 0) > 100 || (config.authz?.capabilities?.length || 0) > 2000 ||
    [config.workflows?.definitions, config.workflows?.bindings, config.workflows?.activations].some(entries => (entries?.length || 0) > 100) ||
    (config.frontend?.routes?.length || 0) > 500 || catalogSlots > 500 ||
    (config.frontend?.admin?.navigation || []).reduce((count, group) => count + group.items.length, 0) > 500;
}
