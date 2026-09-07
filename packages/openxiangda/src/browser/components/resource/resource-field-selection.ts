import type { DataResourceSurface } from 'openxiangda-contracts/browser';
import { isGeneratedDetailFieldVisible } from './detail-field-visibility';

/** Selection and order are presentation facts; permissions are applied by consumers. */
export function selectedSurfaceFields(surface: DataResourceSurface, view: 'form' | 'detail' | 'list') {
  const keys = surface[view]?.fieldOrder ?? Object.keys(surface.fields);
  return keys.flatMap(key => {
    const field = surface.fields[key];
    if (!field || !isGeneratedDetailFieldVisible({ key, ...field })) return [];
    if (view === 'form' && field.system) return [];
    if (view === 'list' && !field.list) return [];
    return [{ key, ...field }];
  });
}
