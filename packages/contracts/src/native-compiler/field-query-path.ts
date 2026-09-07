import { NativeDataFieldTypeV2, NativeDataFieldV2 } from './data-field.js';

export interface NativeDataQueryPathPlanV2 {
  parts: string[];
  type: NativeDataFieldTypeV2;
}

interface NativeDataQueryPathResourceV2 {
  code: string;
  schema: { fields: NativeDataFieldV2[] };
}

const SINGLE_SNAPSHOT_TYPES = new Set<NativeDataFieldTypeV2>([
  'option.single',
  'user.single',
  'department.single',
  'resource-ref.single',
]);

const SCALAR_SNAPSHOT_PATH_TYPES = new Set<NativeDataFieldTypeV2>([
  'text.short',
  'text.long',
  'text.rich',
  'number.integer',
  'number.decimal',
  'boolean',
  'date',
  'time',
  'datetime',
  'uuid',
  'serial-number',
]);

const SIMPLE_SNAPSHOT_PATHS = new Set([
  'value',
  'label',
  'description',
  'color',
]);

const USER_PATHS = new Set([
  'avatarUrl',
  'employeeNo',
  'title',
  'mobile',
  'email',
]);

const DEPARTMENT_PATHS = new Set(['fullPath', 'parent.value', 'parent.label']);

const ADDRESS_PATHS = new Set([
  'country.value',
  'country.label',
  'province.value',
  'province.label',
  'city.value',
  'city.label',
  'district.value',
  'district.label',
  'street.value',
  'street.label',
  'detail',
  'fullAddress',
]);

const LOCATION_DECIMAL_PATHS = new Set(['longitude', 'latitude', 'accuracy']);

const LOCATION_TEXT_PATHS = new Set([
  'address',
  'name',
  'province',
  'city',
  'district',
  'source',
]);

/**
 * Attaches derived resource-snapshot leaf types without changing the public
 * resource JSON. The complete active resource graph is already loaded by the
 * caller, so this pass performs no I/O and introduces no second type owner.
 */
export function materializeNativeDataQueryPathTypesV2<
  T extends NativeDataQueryPathResourceV2
>(resources: T[]): T[] {
  const fieldsByResource = new Map(
    resources.map(resource => [
      resource.code,
      new Map(resource.schema.fields.map(field => [field.code, field])),
    ])
  );

  return resources.map(resource => ({
    ...resource,
    schema: {
      ...resource.schema,
      fields: resource.schema.fields.map(field => {
        const queryPathTypes = resourceSnapshotPathTypes(
          field,
          fieldsByResource
        );
        if (!Object.keys(queryPathTypes).length) return field;
        const resolved = { ...field };
        Object.defineProperty(resolved, 'queryPathTypes', {
          configurable: false,
          enumerable: false,
          writable: false,
          value: Object.freeze(queryPathTypes),
        });
        return resolved;
      }),
    },
  }));
}

export function nativeDataQueryPathPlanV2(
  field: NativeDataFieldV2,
  path: string
): NativeDataQueryPathPlanV2 | null {
  if (
    SINGLE_SNAPSHOT_TYPES.has(field.type) &&
    SIMPLE_SNAPSHOT_PATHS.has(path)
  ) {
    return textPath(path);
  }
  if (field.type === 'user.single' && USER_PATHS.has(path)) {
    return textPath(path);
  }
  if (field.type === 'department.single' && DEPARTMENT_PATHS.has(path)) {
    return textPath(path);
  }
  if (field.type === 'resource-ref.single') {
    const type = field.queryPathTypes?.[path];
    return type ? { parts: path.split('.'), type } : null;
  }
  if (field.type === 'address' && ADDRESS_PATHS.has(path)) {
    return textPath(path);
  }
  if (field.type === 'location') {
    if (LOCATION_DECIMAL_PATHS.has(path)) {
      return { parts: [path], type: 'number.decimal' };
    }
    if (LOCATION_TEXT_PATHS.has(path)) return textPath(path);
    if (path === 'capturedAt') {
      return { parts: [path], type: 'datetime' };
    }
  }
  return null;
}

function resourceSnapshotPathTypes(
  field: NativeDataFieldV2,
  fieldsByResource: Map<string, Map<string, NativeDataFieldV2>>
) {
  if (field.type !== 'resource-ref.single' || !field.source) return {};
  const targetFields = fieldsByResource.get(field.source.resourceCode);
  if (!targetFields) return {};
  return Object.fromEntries(
    (field.source.snapshotFields || []).flatMap(fieldCode => {
      const target = targetFields.get(fieldCode);
      if (!target) return [];
      return [
        [
          `snapshot.${fieldCode}`,
          SCALAR_SNAPSHOT_PATH_TYPES.has(target.type) ? target.type : 'json',
        ],
      ];
    })
  ) as Record<string, NativeDataFieldTypeV2>;
}

function textPath(path: string): NativeDataQueryPathPlanV2 {
  return { parts: path.split('.'), type: 'text.short' };
}
