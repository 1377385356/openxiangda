import type { DataFieldSurface, DataResourceSurface } from 'openxiangda-contracts/browser';
import { normalizeFormValues } from '../platform-fields/field-form-codec';
import type { SubtableDraftRow } from '../platform-fields/subtable-value';
import { selectedSurfaceFields } from '../resource/resource-field-selection';

/** Encode Field Kit values; authority and owned-row planning remain on the server. */
export function standardProcessFormValues(
  values: Record<string, unknown>,
  parent: DataResourceSurface,
  children: Record<string, { surface: DataResourceSurface }>,
  canWrite: (field: DataFieldSurface & { key: string }, mode: 'create' | 'update') => boolean,
) {
  const encoded = normalizeFormValues(values, parent);
  for (const [code, field] of Object.entries(parent.fields)) {
    if (field.type !== 'subtable' || !field.subtable || !Object.hasOwn(values, code)) continue;
    const child = children[field.subtable.resourceCode]?.surface;
    if (!child || !Array.isArray(values[code])) throw new Error('OPENXIANGDA_SUBTABLE_VALUES_INVALID');
    const relation = field.subtable;
    encoded[code] = (values[code] as SubtableDraftRow[]).map(row => {
      const mode = row.state === 'created' ? 'create' : 'update';
      const selected = new Set(selectedSurfaceFields(child, 'form').filter(field =>
        field.key !== relation.foreignKey && field.key !== relation.orderField &&
        field.widget !== 'readonly' && field.type !== 'subtable' && canWrite(field, mode),
      ).map(field => field.key));
      return { key: row.key, state: row.state,
        ...(row.id === undefined ? {} : { id: row.id, revision: row.revision }),
        data: row.state === 'deleted' ? {} : normalizeFormValues(
          Object.fromEntries(Object.entries(row.data).filter(([key]) => selected.has(key))), child,
        ),
      };
    });
  }
  return encoded;
}
