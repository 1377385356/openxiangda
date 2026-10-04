import type { DataResourceSurface } from '../surface.js';

/** Resolve a named presentation without changing field access or storage facts. */
export function projectDataResourceView(surface: DataResourceSurface, viewCode?: string): DataResourceSurface {
  if (viewCode === undefined) return surface;
  const view = surface.views?.find(item => item.code === viewCode);
  if (!view) throw new Error(`DATA_RESOURCE_VIEW_NOT_FOUND: ${viewCode}`);
  const sections = new Map(view.sections?.flatMap(section => section.fields.map(code => [code, section.title] as const)));
  const { views: _views, ...base } = surface;
  return {
    ...base, generated: view.generated, list: view.list, form: view.form,
    detail: view.detail, mobile: view.mobile,
    fields: Object.fromEntries(Object.entries(surface.fields).map(([code, field]) => {
      const { section: _section, ...baseField } = field;
      const section = sections.get(code);
      return [code, { ...baseField, ...(section ? { section } : {}), list: view.list.fieldOrder?.includes(code) ?? false }];
    })),
  };
}
