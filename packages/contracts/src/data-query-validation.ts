import {
  SCHEMA_VERSIONS,
  type DataExportRequest,
  type DataQuery,
  type Diagnostic,
} from './types.js';
import {
  diagnostic,
  isDataFieldCode,
  isRecord,
} from './validation-common.js';

export const DATA_QUERY_OPERATORS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'startsWith',
  'endsWith',
  'in',
  'between',
  'has',
  'hasAny',
  'hasAll',
  'overlaps',
  'containedBy',
  'jsonContains',
  'isEmpty',
  'isNotEmpty',
]);

export const DATA_QUERY_EMPTY_OPERATORS = new Set(['isEmpty', 'isNotEmpty']);

const DATA_QUERY_ARRAY_OPERATORS = new Set([
  'in',
  'between',
  'hasAny',
  'hasAll',
]);

const DATA_QUERY_PATH_PATTERN =
  /^(value|label|snapshot\.[A-Za-z][A-Za-z0-9_]{0,62}|[A-Za-z][A-Za-z0-9_]{0,62})$/;

export interface DataWhereValidationLimits {
  maxDepth?: number;
  maxPredicates?: number;
  maxArrayValues?: number;
  maxValueBytes?: number;
}

export function appendDataWhereDiagnostics(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
  limits: DataWhereValidationLimits = {}
) {
  const maxDepth = limits.maxDepth ?? 5;
  const maxPredicates = limits.maxPredicates ?? 50;
  const maxArrayValues = limits.maxArrayValues ?? 100;
  const maxValueBytes = limits.maxValueBytes ?? 256 * 1024;
  let predicates = 0;

  const visit = (node: unknown, currentPath: string, depth: number) => {
    if (depth > maxDepth) {
      diagnostics.push(
        diagnostic(
          'DATA_QUERY_DEPTH_EXCEEDED',
          `${currentPath} 查询深度不能超过 ${maxDepth}`,
          currentPath
        )
      );
      return;
    }
    if (!isRecord(node)) {
      diagnostics.push(
        diagnostic('DATA_QUERY_WHERE_INVALID', `${currentPath} 必须是对象`, currentPath)
      );
      return;
    }
    const logicalKeys = ['and', 'or', 'not'].filter(key => key in node);
    const predicate = 'field' in node || 'operator' in node || 'path' in node;
    if (logicalKeys.length + Number(predicate) !== 1) {
      diagnostics.push(
        diagnostic(
          'DATA_QUERY_NODE_AMBIGUOUS',
          `${currentPath} 必须且只能声明一个逻辑节点或字段条件`,
          currentPath
        )
      );
      return;
    }
    if (logicalKeys.length === 1) {
      const key = logicalKeys[0]!;
      const allowed = new Set([key]);
      for (const property of Object.keys(node)) {
        if (!allowed.has(property)) {
          diagnostics.push(
            diagnostic(
              'DATA_QUERY_NODE_PROPERTY_UNKNOWN',
              `${currentPath}.${property} 不受支持`,
              `${currentPath}.${property}`
            )
          );
        }
      }
      if (key === 'not') {
        visit(node.not, `${currentPath}.not`, depth + 1);
        return;
      }
      const items = Array.isArray(node[key]) ? node[key] : [];
      if (!Array.isArray(node[key]) || items.length < 1 || items.length > 50) {
        diagnostics.push(
          diagnostic(
            'DATA_QUERY_LOGICAL_ITEMS_INVALID',
            `${currentPath}.${key} 必须包含 1 到 50 个条件`,
            `${currentPath}.${key}`
          )
        );
        return;
      }
      items.forEach((item, index) =>
        visit(item, `${currentPath}.${key}[${index}]`, depth + 1)
      );
      return;
    }

    predicates += 1;
    if (predicates > maxPredicates) return;
    for (const property of Object.keys(node)) {
      if (!['field', 'operator', 'value', 'path'].includes(property)) {
        diagnostics.push(
          diagnostic(
            'DATA_QUERY_PREDICATE_PROPERTY_UNKNOWN',
            `${currentPath}.${property} 不受支持`,
            `${currentPath}.${property}`
          )
        );
      }
    }
    if (!isDataFieldCode(node.field)) {
      diagnostics.push(
        diagnostic(
          'DATA_QUERY_FIELD_INVALID',
          `${currentPath}.field 不是有效字段代码`,
          `${currentPath}.field`
        )
      );
    }
    const operator = String(node.operator || '');
    if (!DATA_QUERY_OPERATORS.has(operator)) {
      diagnostics.push(
        diagnostic(
          'DATA_QUERY_OPERATOR_INVALID',
          `${currentPath}.operator 不受支持`,
          `${currentPath}.operator`
        )
      );
    }
    if (
      node.path !== undefined &&
      (typeof node.path !== 'string' || !DATA_QUERY_PATH_PATTERN.test(node.path))
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_QUERY_PATH_INVALID',
          `${currentPath}.path 不受支持`,
          `${currentPath}.path`
        )
      );
    }
    const hasValue = Object.prototype.hasOwnProperty.call(node, 'value');
    if (DATA_QUERY_EMPTY_OPERATORS.has(operator) === hasValue) {
      diagnostics.push(
        diagnostic(
          'DATA_QUERY_VALUE_PRESENCE_INVALID',
          DATA_QUERY_EMPTY_OPERATORS.has(operator)
            ? `${currentPath}.value 对空值操作符必须省略`
            : `${currentPath}.value 必填`,
          `${currentPath}.value`
        )
      );
      return;
    }
    if (!hasValue) return;
    if (DATA_QUERY_ARRAY_OPERATORS.has(operator)) {
      const items = Array.isArray(node.value) ? node.value : [];
      const validLength =
        operator === 'between'
          ? items.length === 2
          : items.length >= 1 && items.length <= maxArrayValues;
      if (!Array.isArray(node.value) || !validLength) {
        diagnostics.push(
          diagnostic(
            'DATA_QUERY_ARRAY_VALUE_INVALID',
            operator === 'between'
              ? `${currentPath}.value 对 between 必须恰好包含 2 项`
              : `${currentPath}.value 必须包含 1 到 ${maxArrayValues} 项`,
            `${currentPath}.value`
          )
        );
      }
    }
    try {
      if (
        new TextEncoder().encode(JSON.stringify(node.value) ?? '').byteLength >
        maxValueBytes
      ) {
        diagnostics.push(
          diagnostic(
            'DATA_QUERY_VALUE_TOO_LARGE',
            `${currentPath}.value 超过 ${maxValueBytes} 字节`,
            `${currentPath}.value`
          )
        );
      }
    } catch {
      diagnostics.push(
        diagnostic(
          'DATA_QUERY_VALUE_NOT_JSON',
          `${currentPath}.value 必须可序列化为 JSON`,
          `${currentPath}.value`
        )
      );
    }
  };

  visit(value, path, 1);
  if (predicates > maxPredicates) {
    diagnostics.push(
      diagnostic(
        'DATA_QUERY_PREDICATES_EXCEEDED',
        `${path} 最多包含 ${maxPredicates} 个字段条件`,
        path
      )
    );
  }
}

export function validateDataQuery(value: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) {
    return [diagnostic('DATA_QUERY_INVALID', 'DataQuery 必须是对象', '$')];
  }
  if (value.schemaVersion !== SCHEMA_VERSIONS.dataQuery) {
    diagnostics.push(
      diagnostic(
        'DATA_QUERY_SCHEMA_UNSUPPORTED',
        `schemaVersion 必须是 ${SCHEMA_VERSIONS.dataQuery}`,
        'schemaVersion'
      )
    );
  }
  for (const key of Object.keys(value)) {
    if (!['schemaVersion', 'select', 'where', 'order', 'limit', 'offset'].includes(key)) {
      diagnostics.push(
        diagnostic(
          'DATA_QUERY_PROPERTY_UNKNOWN',
          `${key} 不是 DataQuery 属性`,
          key
        )
      );
    }
  }
  if (value.select !== undefined) {
    const select = Array.isArray(value.select) ? value.select : [];
    if (
      !Array.isArray(value.select) ||
      select.length > 100 ||
      select.some(item => !isDataFieldCode(item)) ||
      new Set(select).size !== select.length
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_QUERY_SELECT_INVALID',
          'select 必须为最多 100 个不重复字段代码',
          'select'
        )
      );
    }
  }
  if (value.where !== undefined) {
    appendDataWhereDiagnostics(value.where, 'where', diagnostics);
  }
  if (value.order !== undefined) {
    const order = Array.isArray(value.order) ? value.order : [];
    if (!Array.isArray(value.order) || order.length > 10) {
      diagnostics.push(
        diagnostic('DATA_QUERY_ORDER_INVALID', 'order 最多包含 10 项', 'order')
      );
    }
    order.forEach((item, index) => {
      const path = `order[${index}]`;
      if (!isRecord(item) || !isDataFieldCode(item.field)) {
        diagnostics.push(
          diagnostic('DATA_QUERY_ORDER_ITEM_INVALID', `${path} 字段无效`, path)
        );
        return;
      }
      for (const key of Object.keys(item)) {
        if (!['field', 'direction', 'nulls'].includes(key)) {
          diagnostics.push(
            diagnostic(
              'DATA_QUERY_ORDER_PROPERTY_UNKNOWN',
              `${path}.${key} 不受支持`,
              `${path}.${key}`
            )
          );
        }
      }
      if (
        item.direction !== undefined &&
        !['asc', 'desc'].includes(String(item.direction))
      ) {
        diagnostics.push(
          diagnostic(
            'DATA_QUERY_ORDER_DIRECTION_INVALID',
            `${path}.direction 只支持 asc/desc`,
            `${path}.direction`
          )
        );
      }
      if (
        item.nulls !== undefined &&
        !['first', 'last'].includes(String(item.nulls))
      ) {
        diagnostics.push(
          diagnostic(
            'DATA_QUERY_ORDER_NULLS_INVALID',
            `${path}.nulls 只支持 first/last`,
            `${path}.nulls`
          )
        );
      }
    });
  }
  if (
    value.limit !== undefined &&
    (!Number.isSafeInteger(value.limit) ||
      Number(value.limit) < 1 ||
      Number(value.limit) > 200)
  ) {
    diagnostics.push(
      diagnostic('DATA_QUERY_LIMIT_INVALID', 'limit 必须为 1 到 200', 'limit')
    );
  }
  if (
    value.offset !== undefined &&
    (!Number.isSafeInteger(value.offset) ||
      Number(value.offset) < 0 ||
      Number(value.offset) > 1_000_000)
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_QUERY_OFFSET_INVALID',
        'offset 必须为 0 到 1000000',
        'offset'
      )
    );
  }
  return diagnostics;
}

export function isDataQuery(value: unknown): value is DataQuery {
  return validateDataQuery(value).length === 0;
}

export function validateDataExportRequest(value: unknown): Diagnostic[] {
  if (!isRecord(value)) {
    return [
      diagnostic(
        'DATA_EXPORT_INVALID',
        'DataExportRequest 必须是对象',
        '$'
      ),
    ];
  }
  const diagnostics: Diagnostic[] = [];
  if (value.schemaVersion !== SCHEMA_VERSIONS.dataExportRequest) {
    diagnostics.push(
      diagnostic(
        'DATA_EXPORT_SCHEMA_UNSUPPORTED',
        `schemaVersion 必须是 ${SCHEMA_VERSIONS.dataExportRequest}`,
        'schemaVersion'
      )
    );
  }
  for (const key of Object.keys(value)) {
    if (!['schemaVersion', 'select', 'where', 'order'].includes(key)) {
      diagnostics.push(
        diagnostic(
          'DATA_EXPORT_PROPERTY_UNKNOWN',
          `${key} 不是 DataExportRequest 属性`,
          key
        )
      );
    }
  }
  const queryDiagnostics = validateDataQuery({
    ...value,
    schemaVersion: SCHEMA_VERSIONS.dataQuery,
  }).filter(item => item.code !== 'DATA_QUERY_PROPERTY_UNKNOWN');
  return [...diagnostics, ...queryDiagnostics];
}

export function isDataExportRequest(
  value: unknown
): value is DataExportRequest {
  return validateDataExportRequest(value).length === 0;
}
