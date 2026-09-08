import type {
  DataResourceSurface,
  DataWhere,
  ResourceReferenceValue,
  StableAddressValue,
} from 'openxiangda-contracts/browser';
import {
  cascadeTerminalValues,
  type CascadeStoredValue,
} from './cascade-value';
import { deepestAddressPredicate } from './address-value';

export interface GenericResourceQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  filters?: Record<string, unknown>;
  sort?: ResourceSort;
  sorts?: ResourceSort[];
  where?: DataWhere;
}

export interface ResourceSort { field: string; order: 'asc' | 'desc' }

function isSelectionSnapshot(value: unknown): value is ResourceReferenceValue {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'value' in value);
}

function stableValue(value: unknown) {
  return isSelectionSnapshot(value) ? String(value.value) : value;
}

function stableValues(value: unknown) {
  return (Array.isArray(value) ? value : [value]).map(stableValue);
}

export function buildResourceWhere(
  resourceCode: string,
  surface: DataResourceSurface,
  query: GenericResourceQuery
): DataWhere | undefined {
  const declaredFields = new Set(Object.keys(surface.fields));
  const assertField = (field: string) => {
    if (!declaredFields.has(field)) {
      throw new Error(
        `OPENXIANGDA_RESOURCE_QUERY_FIELD_NOT_DECLARED:${resourceCode}:${field}`
      );
    }
    return field;
  };
  const predicates: DataWhere[] = query.where ? [compileAdvancedWhere(resourceCode, surface, query.where)] : [];
  if (query.keyword?.trim()) {
    const searchable = (surface.list?.searchableFields || []).filter(field =>
      declaredFields.has(field)
    );
    if (searchable.length) {
      predicates.push({
        or: searchable.map(field => ({
          field: assertField(field),
          operator: 'contains',
          value: query.keyword!.trim(),
        })),
      });
    }
  }
  for (const [fieldCode, value] of Object.entries(query.filters || {})) {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    ) continue;
    // A list state can outlive a resource route during client-side navigation.
    if (!declaredFields.has(fieldCode)) continue;
    const field = surface.fields[fieldCode];
    if (!field) continue;
    if (field.type === 'json') {
      predicates.push({
        field: fieldCode,
        operator: 'jsonContains',
        value,
      });
    } else if (field.type === 'address') {
      const address = deepestAddressPredicate(value as StableAddressValue);
      if (address) {
        predicates.push({
          field: fieldCode,
          operator: 'jsonContains',
          path: address.path,
          value: address.value,
        });
      }
    } else if (field.type === 'cascade.single' || field.type === 'cascade.multiple') {
      const terminals = cascadeTerminalValues(
        value as CascadeStoredValue,
        field.type === 'cascade.multiple'
      );
      if (terminals.length) {
        predicates.push({
          field: fieldCode,
          operator: field.type === 'cascade.multiple' ? 'hasAny' : 'has',
          value: field.type === 'cascade.multiple' ? terminals : terminals[0],
        });
      }
    } else if (
      (field.type === 'date-range' || field.type === 'datetime-range') &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      const range = value as { start?: unknown; end?: unknown };
      if (range.start !== undefined && range.end !== undefined) {
        predicates.push({
          field: fieldCode,
          operator: 'overlaps',
          value: { start: range.start, end: range.end },
        });
      }
    } else if (
      Array.isArray(value) &&
      value.length === 2 &&
      ['date', 'datetime', 'number', 'money', 'percent'].includes(field.widget)
    ) {
      if (value[0] !== undefined && value[0] !== null && value[0] !== '') {
        predicates.push({ field: fieldCode, operator: 'gte', value: value[0] });
      }
      if (value[1] !== undefined && value[1] !== null && value[1] !== '') {
        predicates.push({ field: fieldCode, operator: 'lte', value: value[1] });
      }
    } else if (
      field.type === 'option.multiple' ||
      field.type === 'user.multiple' ||
      field.type === 'department.multiple' ||
      field.type === 'resource-ref.multiple'
    ) {
      predicates.push({
        field: fieldCode,
        operator: 'hasAny',
        value: stableValues(value),
      });
    } else {
      const [stable] = stableValues(value);
      predicates.push({ field: fieldCode, operator: 'eq', value: stable });
    }
  }
  return predicates.length ? { and: predicates } : undefined;
}

/** Preserve the canonical logical tree while reducing field-kit selections to stable query values. */
export function compileAdvancedWhere(code: string, surface: DataResourceSurface, node: DataWhere): DataWhere {
  if ('and' in node) return { and: node.and.map(item => compileAdvancedWhere(code, surface, item)) };
  if ('or' in node) return { or: node.or.map(item => compileAdvancedWhere(code, surface, item)) };
  if ('not' in node) return { not: compileAdvancedWhere(code, surface, node.not) };
  // A path already selects the canonical subvalue; top-level field control
  // normalization must not replace its value or silently drop the path.
  if (node.path !== undefined) return node;
  if (node.operator === 'isEmpty' || node.operator === 'isNotEmpty') return { field: node.field, operator: node.operator };
  const field = surface.fields[node.field];
  if (node.operator === 'has') {
    const cascadePath = field?.type === 'cascade.single' && Array.isArray(node.value) &&
      node.value.length > 0 && node.value.every(isSelectionSnapshot);
    return { ...node, value: cascadePath
      ? cascadeTerminalValues(node.value as CascadeStoredValue, false)[0]
      : stableValue(node.value) };
  }
  if (['in', 'between', 'hasAny', 'hasAll'].includes(node.operator)) {
    // Explicit operators own operand cardinality. Do not apply shortcut
    // filters, which infer hasAny or reduce a range to its first comparison.
    if (!Array.isArray(node.value)) return node;
    const cascadePaths = field?.type === 'cascade.multiple' &&
      ['hasAny', 'hasAll'].includes(node.operator) && node.value.length > 0 &&
      node.value.every(path => Array.isArray(path) && path.length > 0 && path.every(isSelectionSnapshot));
    return { ...node, value: cascadePaths
      ? cascadeTerminalValues(node.value as CascadeStoredValue, true)
      : node.value.map(stableValue) };
  }
  const normalized = buildResourceWhere(code, surface, { page: 1, pageSize: 20, filters: { [node.field]: node.value } });
  const predicate = normalized && 'and' in normalized ? normalized.and[0] : undefined;
  return predicate && 'field' in predicate ? { ...predicate, operator: node.operator } : node;
}
