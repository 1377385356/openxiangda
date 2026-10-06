import type { SurfaceField } from '../resource/SurfaceFields';

type Values = Readonly<Record<string, unknown>>;
// Source queries use reference identities, not convenience display labels.
function bindingIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(bindingIdentity).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object' && Object.hasOwn(value, 'value')) return (value as { value: unknown }).value;
  return value ?? null;
}

/** User-event-only patch. Callers supply the already visible and writable fields. */
export function resourceReferenceBindingPatch(fields: readonly SurfaceField[], changed: Values, values: Values, previous: Values) {
  const changedCodes = new Set(Object.keys(changed).filter(code =>
    JSON.stringify(bindingIdentity(values[code])) !== JSON.stringify(bindingIdentity(previous[code]))));
  const patch: Record<string, unknown> = {};
  // Each field is cleared at most once, including any downstream dependency.
  for (let pass = 0; pass < fields.length; pass++) {
    let added = false;
    for (const field of fields) {
      if (Object.hasOwn(patch, field.key) || field.source?.clearOnBindingChange !== true ||
        !field.source.filters?.some(filter => 'binding' in filter && changedCodes.has(filter.binding.field))) continue;
      const cleared = field.type.endsWith('.multiple') ? [] : undefined;
      patch[field.key] = cleared;
      if (JSON.stringify(bindingIdentity(values[field.key])) !== JSON.stringify(bindingIdentity(cleared))) {
        changedCodes.add(field.key); added = true;
      }
    }
    if (!added) break;
  }
  return patch;
}
