import type { DataFieldOption } from './field-values.js';
import type { DataFieldResourceSource } from './references.js';
import type { DataFieldType, DataRangeBoundary } from './types.js';

/**
 * The renderer is a UI choice only. It never changes the DataResource
 * storage type or the stable value codec.
 */
export type DataFieldSurfaceWidget =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'percent'
  | 'rating'
  | 'date'
  | 'time'
  | 'datetime'
  | 'date-range'
  | 'datetime-range'
  | 'switch'
  | 'select'
  | 'multi-select'
  | 'radio'
  | 'checkbox'
  | 'cascade'
  | 'email'
  | 'phone'
  | 'attachment'
  | 'image'
  | 'rich-text'
  | 'address'
  | 'location'
  | 'signature'
  | 'subtable'
  | 'scope'
  | 'directory-user'
  | 'directory-department'
  | 'resource'
  | 'json'
  | 'readonly';

export interface DataFieldSurface {
  label: string;
  /** Exact semantic type projected from the authoritative field declaration. */
  type: DataFieldType;
  /** Fully resolved by the compiler; renderers never infer a control. */
  widget: DataFieldSurfaceWidget;
  section?: string;
  requiredHint?: boolean;
  system?: boolean;
  /** Excluded from generated business UI; never an authorization decision. */
  hidden?: boolean;
  /** All-of field grants. An explicit empty array denies the operation. */
  readCapabilities: string[];
  createCapabilities: string[];
  updateCapabilities: string[];
  maxLength?: number;
  precision?: number;
  scale?: number;
  min?: number;
  max?: number;
  /** Exact interval semantics projected from the authoritative range field. */
  rangeBoundary?: DataRangeBoundary;
  maxCount?: number;
  maxSizeMb?: number;
  accept?: string | string[];
  options?: DataFieldOption[];
  list?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  source?: DataFieldResourceSource;
  timePrecision?: 'minute' | 'second';
  serial?: {
    prefix?: string;
    digits?: number;
    start?: number;
  };
  subtable?: {
    resourceCode: string;
    foreignKey: string;
    orderField: string;
    maxRows?: number;
  };
}

export interface DataResourceSurface {
  /** Named presentations share this resource's field/value/authorization facts. */
  views?: DataResourceViewSurface[];
  /** Capability owner for mutations; only native may expose standard mutations. */
  mutationOwner?: 'native' | 'action' | 'readonly' | 'workflow';
  /** Compiler-owned route/page closure. Omitted values are resolved before emission. */
  generated?: {
    list?: boolean;
    detail?: boolean;
    create?: boolean;
    update?: boolean;
    delete?: boolean;
  };
  fields: Record<string, DataFieldSurface>;
  list?: {
    /** Explicit selected columns in display order. */
    fieldOrder?: string[];
    defaultPageSize?: number;
    searchableFields?: string[];
    filterFields?: string[];
    defaultSort?: {
      field: string;
      order?: 'asc' | 'desc';
    };
  };
  form?: {
    layout?: 'flat' | 'sections';
    /** Explicit selected fields in display order; omitted fields stay off this view. */
    fieldOrder?: string[];
  };
  detail?: {
    layout?: 'flat' | 'sections';
    /** Explicit selected fields in display order; omitted fields stay off this view. */
    fieldOrder?: string[];
  };
  mobile?: {
    enabled?: boolean;
  };
}

export interface DataResourceViewSurface {
  code: string;
  name: string;
  generated: Required<NonNullable<DataResourceSurface['generated']>>;
  list: NonNullable<DataResourceSurface['list']> & { fieldOrder: string[] };
  form: NonNullable<DataResourceSurface['form']> & { fieldOrder: string[] };
  detail: NonNullable<DataResourceSurface['detail']> & { fieldOrder: string[] };
  mobile: { enabled: boolean };
  sections?: { title: string; fields: string[] }[];
}

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
