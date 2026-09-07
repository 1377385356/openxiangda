import type { DataResourceSurface, SubjectProfile, UserReferenceValue } from 'openxiangda-contracts/browser';
import type { SurfaceField } from './SurfaceFields';
import { selectedSurfaceFields } from './resource-field-selection';

export type ResourceRecord = Record<string, unknown> & {
  id: string;
  revision: number;
  created_at?: string;
  updated_at?: string;
};

export interface GeneratedResourceRoutePaths {
  fallback: string;
  list?: string;
  detail?: string;
  create?: string;
  edit?: string;
}

export function resourceRecordPath(path: string | undefined, id: string) {
  if (!path || !path.includes(':id')) {
    throw new Error('OPENXIANGDA_GENERATED_RESOURCE_ROUTE_MISSING');
  }
  return path.replace(':id', encodeURIComponent(id));
}

export function signatureSigner(profile: SubjectProfile | null): UserReferenceValue | undefined {
  if (!profile) return undefined;
  return {
    label: profile.displayName,
    value: profile.userId,
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    ...(profile.jobNumber ? { employeeNo: profile.jobNumber } : {}),
    ...(profile.affiliatedDepartment
      ? {
          departments: [{
            label: profile.affiliatedDepartment.name,
            value: profile.affiliatedDepartment.id,
          }],
        }
      : {}),
  };
}

export function fieldFor(surface: DataResourceSurface, key: string): SurfaceField {
  const field = surface.fields[key];
  return field
    ? { key, ...field }
    : {
        key,
        label: key,
        type: 'text.short',
        widget: 'text',
        readCapabilities: [],
        createCapabilities: [],
        updateCapabilities: [],
      };
}

export function filterValueLabel(value: unknown): string {
  if (Array.isArray(value))
    return value.map(filterValueLabel).filter(Boolean).join('、');
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.label) return String(record.label);
    if ('start' in record || 'end' in record) {
      return [record.start, record.end].filter(Boolean).map(String).join(' 至 ');
    }
    return Object.values(record)
      .map(filterValueLabel)
      .filter(Boolean)
      .join('、');
  }
  return String(value ?? '');
}

export function activeFilterValue(value: unknown) {
  return !(
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function fieldsBySection(
  surface: DataResourceSurface,
  view: 'form' | 'detail' = 'form'
) {
  const groups = new Map<string, SurfaceField[]>();
  for (const { key, ...field } of selectedSurfaceFields(surface, view)) {
    const section = field.section || 'default';
    groups.set(section, [...(groups.get(section) || []), { key, ...field }]);
  }
  return [...groups.entries()].map(([section, fields]) => ({
    section,
    fields,
  }));
}

export function fieldWriteAuthorized(field: SurfaceField, mode: 'create' | 'edit', hasCapability: (code: string) => boolean, isAppSuperAdmin: boolean) {
  if (isAppSuperAdmin) return true;
  const capabilities = mode === 'create' ? field.createCapabilities : field.updateCapabilities;
  return capabilities.length > 0 && capabilities.every(hasCapability);
}

export function fieldWritable(field: SurfaceField, mode: 'create' | 'edit', hasCapability: (code: string) => boolean, isAppSuperAdmin: boolean) {
  return field.widget !== 'readonly' && fieldWriteAuthorized(field, mode, hasCapability, isAppSuperAdmin);
}

export function fieldReadable(field: SurfaceField, hasCapability: (code: string) => boolean, isAppSuperAdmin: boolean) {
  return isAppSuperAdmin || (field.readCapabilities.length > 0 && field.readCapabilities.every(hasCapability));
}
