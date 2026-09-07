import {
  SCHEMA_VERSIONS,
  type DataFieldDefinition,
  type Diagnostic,
} from 'openxiangda-contracts';

const FIELD_CODE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const SNAPSHOT_VALUE_TYPES = new Set<DataFieldDefinition['type']>([
  'option.single',
  'option.multiple',
  'user.single',
  'user.multiple',
  'department.single',
  'department.multiple',
  'resource-ref.single',
  'resource-ref.multiple',
]);

interface ResourceModel {
  code: string;
  dataPolicyCode?: string;
  fields: Map<string, DataFieldDefinition>;
}

interface DimensionModel {
  code: string;
  valueType: 'string' | 'uuid';
  valueSourceResourceCode?: string;
}

interface ResolvedFieldPath {
  field: DataFieldDefinition;
  valuePath?: string;
}

function policyRuleEntries(policy: Record<string, unknown>, policyPath: string) {
  const entries: Array<{ rule: Record<string, unknown>; path: string }> =
    Array.isArray(policy.rules)
      ? policy.rules.map((rule, index) => ({
          rule: record(rule),
          path: `${policyPath}.rules[${index}]`,
        }))
      : [];
  if (policy.readExpression === undefined) return entries;
  const visit = (value: unknown, path: string) => {
    const node = record(value);
    for (const key of ['allOf', 'anyOf'] as const) {
      if (!Array.isArray(node[key])) continue;
      node[key].forEach((child, index) =>
        visit(child, `${path}.${key}[${index}]`)
      );
      return;
    }
    entries.push({ rule: node, path });
  };
  visit(policy.readExpression, `${policyPath}.readExpression`);
  return entries;
}

export const SEMANTIC_FIELD_PATH_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]{0,127}(?:\.(?:value|snapshot\.[A-Za-z_][A-Za-z0-9_]{0,127}))?$/;

export function semanticFieldPathRoot(path: string) {
  return path.split('.', 1)[0] || '';
}

export function validateAuthzSemanticBindings(input: {
  resources: unknown[];
  dimensions: unknown[];
  scopeSources: unknown[];
  policies: unknown[];
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const resources = resourceModels(input.resources);
  const dimensions = dimensionModels(input.dimensions);
  const policiesByCode = new Map<string, Record<string, unknown>>();

  input.policies.forEach(rawPolicy => {
    const policy = record(rawPolicy);
    const code = text(policy.code);
    if (code) policiesByCode.set(code, policy);
  });

  for (const resource of resources.values()) {
    if (!resource.dataPolicyCode) continue;
    const policy = policiesByCode.get(resource.dataPolicyCode);
    if (!policy || text(policy.resourceCode) !== resource.code) {
      diagnostics.push(
        issue(
          'APP_CONFIG_AUTHZ_POLICY_RESOURCE_BINDING_INVALID',
          `资源 ${resource.code} 的 dataPolicyCode 必须指向同一资源的策略`,
          `data.resources.${resource.code}.dataPolicyCode`
        )
      );
    }
  }

  input.policies.forEach((rawPolicy, policyIndex) => {
    const policy = record(rawPolicy);
    const policyPath = `authz.dataPolicies[${policyIndex}]`;
    const policyCode = text(policy.code);
    const resourceCode = text(policy.resourceCode);
    const resource = resources.get(resourceCode);
    if (!resource) {
      diagnostics.push(
        issue(
          'APP_CONFIG_AUTHZ_POLICY_RESOURCE_INVALID',
          '数据策略必须引用同一应用内已声明的 Data Resource',
          `${policyPath}.resourceCode`
        )
      );
      return;
    }
    if (resource.dataPolicyCode !== policyCode) {
      diagnostics.push(
        issue(
          'APP_CONFIG_AUTHZ_POLICY_RESOURCE_BINDING_INVALID',
          `策略 ${policyCode} 必须由资源 ${resourceCode} 的 dataPolicyCode 唯一绑定`,
          policyPath
        )
      );
    }

    policyRuleEntries(policy, policyPath).forEach(({ rule, path: rulePath }) => {
      const fieldCode = text(rule.field);
      const field = resource.fields.get(fieldCode);
      if (!field) {
        diagnostics.push(
          issue(
            'APP_CONFIG_AUTHZ_POLICY_FIELD_INVALID',
            `数据策略字段 ${fieldCode} 未在资源 ${resourceCode} 中声明`,
            `${rulePath}.field`
          )
        );
        return;
      }

      if (text(rule.subject) === 'current_user') {
        if (!['user.single', 'user.multiple'].includes(field.type)) {
          diagnostics.push(
            issue(
              'APP_CONFIG_AUTHZ_POLICY_CURRENT_USER_FIELD_INVALID',
              'current_user 规则只能绑定 user.single 或 user.multiple 字段',
              `${rulePath}.field`
            )
          );
        }
        return;
      }

      const dimensionCode = text(rule.dimensionCode);
      if (dimensionCode) {
        const dimension = dimensions.get(dimensionCode);
        if (
          dimension &&
          !comparisonPathSupported(
            field,
            optionalText(rule.valuePath),
            dimension,
            resources
          )
        ) {
          diagnostics.push(
            issue(
              'APP_CONFIG_AUTHZ_POLICY_FIELD_PATH_INVALID',
              '维度策略字段和值路径与字段语义或维度类型不兼容',
              rule.valuePath === undefined
                ? `${rulePath}.field`
                : `${rulePath}.valuePath`
            )
          );
        }
      }

      const relationResourceCode = text(rule.resourceCode);
      if (text(rule.relationCode) && !resources.has(relationResourceCode)) {
        diagnostics.push(
          issue(
            'APP_CONFIG_AUTHZ_POLICY_RELATION_RESOURCE_INVALID',
            'relationship 规则必须引用同一应用内已声明的 Data Resource',
            `${rulePath}.resourceCode`
          )
        );
      }
      if (
        text(rule.relationCode) &&
        !genericPathSupported(field, optionalText(rule.valuePath))
      ) {
        diagnostics.push(
          issue(
            'APP_CONFIG_AUTHZ_POLICY_FIELD_PATH_INVALID',
            'relationship 规则的值路径与字段语义不兼容',
            rule.valuePath === undefined
              ? `${rulePath}.field`
              : `${rulePath}.valuePath`
          )
        );
      }
    });
  });

  input.scopeSources.forEach((rawSource, sourceIndex) => {
    const source = record(rawSource);
    const sourcePath = `authz.scopeSources[${sourceIndex}]`;
    const resource = resources.get(text(source.resourceCode));
    if (!resource) return;

    const subjectPath = text(record(source.subject).userIdField);
    const subject = resolveCombinedPath(resource, subjectPath);
    if (
      !subject ||
      subject.field.type !== 'user.single' ||
      subject.valuePath !== 'value'
    ) {
      diagnostics.push(
        issue(
          'APP_CONFIG_AUTHZ_SCOPE_SOURCE_SUBJECT_PATH_INVALID',
          'scope source 主体必须引用 user.single 字段的 .value',
          `${sourcePath}.subject.userIdField`
        )
      );
    }

    const grants = Array.isArray(source.grants) ? source.grants : [];
    grants.forEach((rawGrant, grantIndex) => {
      const grant = record(rawGrant);
      const dimension = dimensions.get(text(grant.dimensionCode));
      for (const key of ['valueField', 'parentValueField'] as const) {
        if (grant[key] === undefined) continue;
        const resolved = resolveCombinedPath(resource, text(grant[key]));
        if (
          !dimension ||
          !resolved ||
          !comparisonPathSupported(
            resolved.field,
            resolved.valuePath,
            dimension,
            resources
          )
        ) {
          diagnostics.push(
            issue(
              'APP_CONFIG_AUTHZ_SCOPE_SOURCE_GRANT_PATH_INVALID',
              'scope source grant 字段路径与声明维度不兼容',
              `${sourcePath}.grants[${grantIndex}].${key}`
            )
          );
        }
      }
    });

    const typedOptionalFields = [
      ['enabledField', new Set(['boolean'])],
      ['effectiveFromField', new Set(['date', 'datetime'])],
      ['effectiveToField', new Set(['date', 'datetime'])],
    ] as const;
    for (const [key, allowedTypes] of typedOptionalFields) {
      if (source[key] === undefined) continue;
      const field = resource.fields.get(text(source[key]));
      if (!field || !allowedTypes.has(field.type as never)) {
        diagnostics.push(
          issue(
            'APP_CONFIG_AUTHZ_SCOPE_SOURCE_FIELD_TYPE_INVALID',
            `scope source 的 ${key} 字段类型不兼容`,
            `${sourcePath}.${key}`
          )
        );
      }
    }
  });

  return diagnostics;
}

function comparisonPathSupported(
  field: DataFieldDefinition,
  valuePath: string | undefined,
  dimension: DimensionModel,
  resources: Map<string, ResourceModel>
) {
  if (!genericPathSupported(field, valuePath)) return false;
  if (!valuePath) {
    return dimension.valueType === 'uuid'
      ? field.type === 'uuid'
      : ['text.short', 'text.long', 'serial-number'].includes(field.type);
  }
  if (valuePath === 'value') {
    if (
      dimension.valueSourceResourceCode &&
      field.type.startsWith('resource-ref.') &&
      field.source?.resourceCode !== dimension.valueSourceResourceCode
    ) {
      return false;
    }
    return true;
  }
  const snapshotField = valuePath.slice('snapshot.'.length);
  const targetResource = resources.get(field.source?.resourceCode || '');
  const targetType = targetResource?.fields.get(snapshotField)?.type;
  return dimension.valueType === 'uuid'
    ? targetType === 'uuid'
    : ['text.short', 'text.long', 'serial-number'].includes(targetType || '');
}

function genericPathSupported(
  field: DataFieldDefinition,
  valuePath: string | undefined
) {
  if (!valuePath) return !isJsonField(field);
  if (valuePath === 'value') return SNAPSHOT_VALUE_TYPES.has(field.type);
  if (!valuePath.startsWith('snapshot.')) return false;
  const snapshotField = valuePath.slice('snapshot.'.length);
  return (
    FIELD_CODE_PATTERN.test(snapshotField) &&
    field.type.startsWith('resource-ref.') &&
    Boolean(field.source?.snapshotFields?.includes(snapshotField))
  );
}

function isJsonField(field: DataFieldDefinition) {
  return [
    'option.single',
    'option.multiple',
    'cascade.single',
    'cascade.multiple',
    'user.single',
    'user.multiple',
    'department.single',
    'department.multiple',
    'resource-ref.single',
    'resource-ref.multiple',
    'file',
    'image',
    'signature',
    'address',
    'location',
    'json',
  ].includes(field.type);
}

function resolveCombinedPath(
  resource: ResourceModel,
  path: string
): ResolvedFieldPath | undefined {
  if (!SEMANTIC_FIELD_PATH_PATTERN.test(path)) return undefined;
  const fieldCode = semanticFieldPathRoot(path);
  const field = resource.fields.get(fieldCode);
  if (!field) return undefined;
  const valuePath = path.slice(fieldCode.length + 1) || undefined;
  return { field, ...(valuePath ? { valuePath } : {}) };
}

function resourceModels(values: unknown[]) {
  const resources = new Map<string, ResourceModel>();
  values.forEach(rawResource => {
    const resource = record(rawResource);
    const code = text(resource.code);
    if (!code) return;
    const schema = record(resource.schema);
    const fields = new Map<string, DataFieldDefinition>();
    (Array.isArray(schema.fields) ? schema.fields : []).forEach(rawField => {
      const field = record(rawField);
      const fieldCode = text(field.code);
      if (fieldCode) fields.set(fieldCode, field as unknown as DataFieldDefinition);
    });
    resources.set(code, {
      code,
      ...(text(resource.dataPolicyCode)
        ? { dataPolicyCode: text(resource.dataPolicyCode) }
        : {}),
      fields,
    });
  });
  return resources;
}

function dimensionModels(values: unknown[]) {
  const dimensions = new Map<string, DimensionModel>();
  values.forEach(rawDimension => {
    const dimension = record(rawDimension);
    const code = text(dimension.code);
    const valueType = text(dimension.valueType);
    if (!code || !['string', 'uuid'].includes(valueType)) return;
    dimensions.set(code, {
      code,
      valueType: valueType as DimensionModel['valueType'],
      ...(text(record(dimension.valueSource).resourceCode)
        ? {
            valueSourceResourceCode: text(
              record(dimension.valueSource).resourceCode
            ),
          }
        : {}),
    });
  });
  return dimensions;
}

function issue(code: string, message: string, path: string): Diagnostic {
  return {
    schemaVersion: SCHEMA_VERSIONS.diagnostic,
    code,
    severity: 'error',
    message,
    path,
    source: 'openxiangda-app.config.ts',
    retryable: false,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(value: unknown) {
  const valueText = text(value);
  return valueText || undefined;
}
