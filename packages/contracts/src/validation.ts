import { validateDataResourceViews } from './data-view-validation.js';
import {
  CURRENT_APPLICATION_CONTRACT,
  OPENXIANGDA_CONTRACT_VERSION,
  PLATFORM_CAPABILITY_CONTRACT_VERSIONS,
  SCHEMA_VERSIONS,
  type AppArtifact,
  type AppPackage,
  type DataExportRequest,
  type DataQuery,
  type DataResource,
  type DataTransactionRequest,
  type Diagnostic,
} from './types.js';
import {
  isCanonicalResourceCode,
  validateDataFieldDefinition,
} from './data-field-validation.js';
import {
  appendDataWhereDiagnostics,
  validateDataExportRequest as validateDataExportRequestContract,
  validateDataQuery as validateDataQueryContract,
} from './data-query-validation.js';
import {
  diagnostic,
  isRecord,
  requireString,
} from './validation-common.js';

export {
  RESOURCE_CODE_PATTERN,
  isCanonicalResourceCode,
} from './data-field-validation.js';
export { isDataExportRequest, isDataQuery } from './data-query-validation.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATA_TRANSACTION_ERROR_CODE_PATTERN = /^OPENXIANGDA_[A-Z0-9_]{1,96}$/;
const APPLICATION_EVENT_TYPE_PATTERN =
  /^(?!openxiangda\.)[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9_-]*)+\.v[1-9][0-9]*$/;
const DATA_TRANSACTION_FIELD_OPERATORS = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
]);
const DATA_RESOURCE_INVARIANT_CODE_PATTERN =
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const DATA_RESOURCE_ORDERED_FIELD_TYPES = new Set([
  'number.integer',
  'number.decimal',
  'date',
  'time',
  'datetime',
  'text.short',
  'text.long',
  'text.rich',
  'serial-number',
  'uuid',
]);

function hasTransactionReferenceShape(value: unknown) {
  return (
    isRecord(value) &&
    Object.prototype.hasOwnProperty.call(value, 'operationIndex') &&
    Object.prototype.hasOwnProperty.call(value, 'field')
  );
}

function containsNestedTransactionReference(value: unknown): boolean {
  if (hasTransactionReferenceShape(value)) return true;
  if (Array.isArray(value)) return value.some(containsNestedTransactionReference);
  return isRecord(value) && Object.values(value).some(containsNestedTransactionReference);
}

function validateTransactionOperationDataReferences(
  data: Record<string, unknown>,
  operationIndex: number,
  operations: unknown[],
  diagnostics: Diagnostic[]
) {
  for (const [fieldCode, fieldValue] of Object.entries(data)) {
    const path = `operations[${operationIndex}].data.${fieldCode}`;
    if (hasTransactionReferenceShape(fieldValue)) {
      const reference = fieldValue as Record<string, unknown>;
      const keys = Object.keys(reference).sort();
      const targetIndex = Number(reference.operationIndex);
      const target = operations[targetIndex];
      if (
        keys.length !== 2 ||
        keys[0] !== 'field' ||
        keys[1] !== 'operationIndex' ||
        !Number.isSafeInteger(reference.operationIndex) ||
        targetIndex < 0 ||
        targetIndex >= operationIndex ||
        reference.field !== 'id' ||
        !isRecord(target) ||
        target.operation !== 'create'
      ) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_OPERATION_REFERENCE_INVALID',
            `${path} 只能引用之前 create 操作生成的 id`,
            path
          )
        );
      }
      continue;
    }
    if (containsNestedTransactionReference(fieldValue)) {
      diagnostics.push(
        diagnostic(
          'DATA_TRANSACTION_OPERATION_REFERENCE_NESTED',
          `${path} 不能嵌套事务操作引用`,
          path
        )
      );
    }
  }
}
const ARTIFACT_KINDS = new Set([
  'frontend',
  'backend',
  'config',
  'contracts',
]);
const DATA_SYSTEM_FIELDS = new Set([
  'id',
  'tenant_id',
  'app_code',
  'revision',
  'created_by',
  'updated_by',
  'created_at',
  'updated_at',
]);

function validateArtifact(
  value: unknown,
  index: number,
  diagnostics: Diagnostic[]
): value is AppArtifact {
  const path = `artifacts[${index}]`;
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('APP_PACKAGE_ARTIFACT_INVALID', `${path} 必须是对象`, path)
    );
    return false;
  }
  const validKind =
    requireString(value.kind, `${path}.kind`, diagnostics) &&
    ARTIFACT_KINDS.has(value.kind);
  if (!validKind && typeof value.kind === 'string') {
    diagnostics.push(
      diagnostic(
        'APP_PACKAGE_ARTIFACT_KIND_UNSUPPORTED',
        `${path}.kind 不受支持: ${value.kind}`,
        `${path}.kind`
      )
    );
  }
  const digestValue = value.digest;
  const validDigest = requireString(
    digestValue,
    `${path}.digest`,
    diagnostics
  );
  if (validDigest && !SHA256_PATTERN.test(digestValue)) {
    diagnostics.push(
      diagnostic(
        'APP_PACKAGE_DIGEST_INVALID',
        `${path}.digest 必须是小写 64 位 SHA-256`,
        `${path}.digest`
      )
    );
  }
  requireString(value.mediaType, `${path}.mediaType`, diagnostics);
  if (
    value.size !== undefined &&
    (!Number.isSafeInteger(value.size) || Number(value.size) < 0)
  ) {
    diagnostics.push(
      diagnostic(
        'APP_PACKAGE_ARTIFACT_SIZE_INVALID',
        `${path}.size 必须是非负整数`,
        `${path}.size`
      )
    );
  }
  return validKind && validDigest && SHA256_PATTERN.test(digestValue);
}

export function validateAppPackage(value: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) {
    return [
      diagnostic(
        'APP_PACKAGE_INVALID',
        'AppPackage 必须是对象',
        '$',
        '重新运行 openxiangda check 生成包清单'
      ),
    ];
  }
  if (value.schemaVersion !== SCHEMA_VERSIONS.appPackage) {
    diagnostics.push(
      diagnostic(
        'APP_PACKAGE_SCHEMA_UNSUPPORTED',
        `schemaVersion 必须是 ${SCHEMA_VERSIONS.appPackage}`,
        'schemaVersion'
      )
    );
  }
  requireString(value.appCode, 'appCode', diagnostics);
  requireString(value.version, 'version', diagnostics);
  if (
    !requireString(value.createdAt, 'createdAt', diagnostics) ||
    Number.isNaN(Date.parse(String(value.createdAt)))
  ) {
    diagnostics.push(
      diagnostic(
        'APP_PACKAGE_CREATED_AT_INVALID',
        'createdAt 必须是 ISO 8601 时间',
        'createdAt'
      )
    );
  }
  if (!isRecord(value.source)) {
    diagnostics.push(
      diagnostic('APP_PACKAGE_SOURCE_REQUIRED', 'source 必须是对象', 'source')
    );
  } else {
    requireString(value.source.repository, 'source.repository', diagnostics);
    requireString(value.source.commit, 'source.commit', diagnostics);
    if (typeof value.source.dirty !== 'boolean') {
      diagnostics.push(
        diagnostic(
          'APP_PACKAGE_SOURCE_DIRTY_REQUIRED',
          'source.dirty 必须是布尔值',
          'source.dirty'
        )
      );
    }
  }
  if (!isRecord(value.toolchain)) {
    diagnostics.push(
      diagnostic(
        'APP_PACKAGE_TOOLCHAIN_REQUIRED',
        'toolchain 必须是对象',
        'toolchain'
      )
    );
  } else {
    requireString(value.toolchain.version, 'toolchain.version', diagnostics);
    if (value.toolchain.contractVersion !== OPENXIANGDA_CONTRACT_VERSION) {
      diagnostics.push(
        diagnostic(
          'APP_PACKAGE_CONTRACT_VERSION_MISMATCH',
          `toolchain.contractVersion 必须是 ${OPENXIANGDA_CONTRACT_VERSION}`,
          'toolchain.contractVersion'
        )
      );
    }
  }
  if (!Array.isArray(value.artifacts)) {
    diagnostics.push(
      diagnostic(
        'APP_PACKAGE_ARTIFACTS_REQUIRED',
        'artifacts 必须是数组',
        'artifacts'
      )
    );
  } else {
    value.artifacts.forEach((item, index) =>
      validateArtifact(item, index, diagnostics)
    );
    const digests = value.artifacts
      .filter(isRecord)
      .map(item => item.digest)
      .filter(item => typeof item === 'string');
    if (new Set(digests).size !== digests.length) {
      diagnostics.push(
        diagnostic(
          'APP_PACKAGE_ARTIFACT_DIGEST_DUPLICATED',
          'artifacts 不能包含重复 digest',
          'artifacts'
        )
      );
    }
  }
  if (!isRecord(value.manifests)) {
    diagnostics.push(
      diagnostic(
        'APP_PACKAGE_MANIFESTS_REQUIRED',
        'manifests 必须是对象',
        'manifests'
      )
    );
  }
  if (!isRecord(value.compatibility)) {
    diagnostics.push(
      diagnostic(
        'APP_PACKAGE_COMPATIBILITY_REQUIRED',
        'compatibility 必须是对象',
        'compatibility'
      )
    );
  } else {
    requireString(
      value.compatibility.minimumPlatformVersion,
      'compatibility.minimumPlatformVersion',
      diagnostics
    );
    if ('requiredCapabilities' in value.compatibility) {
      diagnostics.push(
        diagnostic(
          'APP_PACKAGE_CAPABILITIES_LEGACY_SHAPE_UNSUPPORTED',
          'compatibility.requiredCapabilities 已废弃；必须由 compiler 生成 requiredPlatformCapabilities',
          'compatibility.requiredCapabilities'
        )
      );
    }
    const required = value.compatibility.requiredPlatformCapabilities;
    if (!Array.isArray(required) || required.length === 0) {
      diagnostics.push(
        diagnostic(
          'APP_PACKAGE_PLATFORM_CAPABILITIES_REQUIRED',
          'compatibility.requiredPlatformCapabilities 必须是非空数组',
          'compatibility.requiredPlatformCapabilities'
        )
      );
    } else {
      if (required.length > 64) {
        diagnostics.push(
          diagnostic(
            'APP_PACKAGE_PLATFORM_CAPABILITIES_LIMIT_EXCEEDED',
            'requiredPlatformCapabilities 最多包含 64 项',
            'compatibility.requiredPlatformCapabilities'
          )
        );
      }
      const codes: string[] = [];
      required.forEach((item, index) => {
        const path = `compatibility.requiredPlatformCapabilities.${index}`;
        if (!isRecord(item)) {
          diagnostics.push(
            diagnostic(
              'APP_PACKAGE_PLATFORM_CAPABILITY_INVALID',
              '平台能力要求必须是结构化对象',
              path
            )
          );
          return;
        }
        const keys = Object.keys(item).sort();
        if (
          keys.length !== 3 ||
          keys[0] !== 'code' ||
          keys[1] !== 'contractVersion' ||
          keys[2] !== 'usageDigest'
        ) {
          diagnostics.push(
            diagnostic(
              'APP_PACKAGE_PLATFORM_CAPABILITY_SHAPE_INVALID',
              '平台能力要求只允许 code、contractVersion 和 usageDigest',
              path
            )
          );
        }
        const code = String(item.code || '');
        const expectedVersion = (
          PLATFORM_CAPABILITY_CONTRACT_VERSIONS as Record<string, string>
        )[code];
        if (!expectedVersion) {
          diagnostics.push(
            diagnostic(
              'APP_PACKAGE_PLATFORM_CAPABILITY_CODE_UNSUPPORTED',
              `未知的平台能力代码: ${code || '<empty>'}`,
              `${path}.code`
            )
          );
        } else {
          codes.push(code);
          if (item.contractVersion !== expectedVersion) {
            diagnostics.push(
              diagnostic(
                'APP_PACKAGE_PLATFORM_CAPABILITY_CONTRACT_UNSUPPORTED',
                `${code} contractVersion 必须是 ${expectedVersion}`,
                `${path}.contractVersion`
              )
            );
          }
        }
        if (
          typeof item.usageDigest !== 'string' ||
          !/^sha256:[0-9a-f]{64}$/.test(item.usageDigest)
        ) {
          diagnostics.push(
            diagnostic(
              'APP_PACKAGE_PLATFORM_CAPABILITY_USAGE_DIGEST_INVALID',
              'usageDigest 必须是带 sha256: 前缀的 64 位小写十六进制摘要',
              `${path}.usageDigest`
            )
          );
        }
      });
      if (new Set(codes).size !== codes.length) {
        diagnostics.push(
          diagnostic(
            'APP_PACKAGE_PLATFORM_CAPABILITY_DUPLICATED',
            'requiredPlatformCapabilities 不能包含重复能力代码',
            'compatibility.requiredPlatformCapabilities'
          )
        );
      }
      const sorted = [...codes].sort();
      if (codes.some((code, index) => code !== sorted[index])) {
        diagnostics.push(
          diagnostic(
            'APP_PACKAGE_PLATFORM_CAPABILITIES_NOT_SORTED',
            'requiredPlatformCapabilities 必须按 code 升序排列',
            'compatibility.requiredPlatformCapabilities'
          )
        );
      }
    }
    if (!isRecord(value.compatibility.applicationContract)) {
      diagnostics.push(
        diagnostic(
          'APP_PACKAGE_APPLICATION_CONTRACT_REQUIRED',
          'compatibility.applicationContract 必须是对象',
          'compatibility.applicationContract'
        )
      );
    } else {
      for (const [field, expected] of Object.entries(
        CURRENT_APPLICATION_CONTRACT
      )) {
        if (value.compatibility.applicationContract[field] !== expected) {
          diagnostics.push(
            diagnostic(
              'APP_PACKAGE_APPLICATION_CONTRACT_UNSUPPORTED',
              `${field} 必须是 ${expected}`,
              `compatibility.applicationContract.${field}`
            )
          );
        }
      }
    }
  }
  return diagnostics;
}

export class ContractValidationError extends Error {
  readonly code = 'OPENXIANGDA_CONTRACT_INVALID';

  constructor(readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map(item => `${item.path}: ${item.message}`).join('; '));
    this.name = 'ContractValidationError';
  }
}

export function assertAppPackage(value: unknown): asserts value is AppPackage {
  const diagnostics = validateAppPackage(value);
  if (diagnostics.length > 0) throw new ContractValidationError(diagnostics);
}

export function validateDataResource(value: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) {
    return [
      diagnostic(
        'DATA_RESOURCE_INVALID',
        'DataResource 必须是对象',
        '$'
      ),
    ];
  }
  if (value.schemaVersion !== SCHEMA_VERSIONS.dataResource) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_SCHEMA_UNSUPPORTED',
        `schemaVersion 必须是 ${SCHEMA_VERSIONS.dataResource}`,
        'schemaVersion'
      )
    );
  }
  requireString(value.appCode, 'appCode', diagnostics);
  const codeValid =
    requireString(value.code, 'code', diagnostics) &&
    isCanonicalResourceCode(value.code);
  if (!codeValid && typeof value.code === 'string') {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_CODE_INVALID',
        'code 必须使用 lower kebab-case',
        'code'
      )
    );
  }
  requireString(value.name, 'name', diagnostics);
  diagnostics.push(...validateDataResourceViews(value));
  const schema = isRecord(value.schema) ? value.schema : {};
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  if (fields.length === 0 || fields.length > 100) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_FIELDS_INVALID',
        'schema.fields 必须包含 1 到 100 个字段',
        'schema.fields'
      )
    );
  }
  const fieldCodes = new Set<string>();
  const fieldTypes = new Map<string, string>();
  fields.forEach((field, index) => {
    const path = `schema.fields[${index}]`;
    if (!isRecord(field)) {
      diagnostics.push(
        diagnostic('DATA_RESOURCE_FIELD_INVALID', `${path} 必须是对象`, path)
      );
      return;
    }
    const fieldCode = typeof field.code === 'string' ? field.code.trim() : '';
    if (
      !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(fieldCode) ||
      DATA_SYSTEM_FIELDS.has(fieldCode)
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_CODE_INVALID',
          `${path}.code 不安全、过长或属于系统字段`,
          `${path}.code`
        )
      );
    } else if (fieldCodes.has(fieldCode)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_DUPLICATED',
          `字段 ${fieldCode} 重复`,
          `${path}.code`
        )
      );
    } else {
      fieldCodes.add(fieldCode);
      fieldTypes.set(fieldCode, String(field.type || ''));
    }
    validateDataFieldDefinition(field, path, diagnostics);
  });
  const invariants = value.invariants === undefined
    ? []
    : Array.isArray(value.invariants)
      ? value.invariants
      : [];
  if (value.invariants !== undefined && !Array.isArray(value.invariants)) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_INVARIANTS_INVALID',
        'invariants 必须是数组',
        'invariants'
      )
    );
  }
  if (invariants.length > 20) {
    diagnostics.push(
      diagnostic(
        'DATA_RESOURCE_INVARIANTS_INVALID',
        'invariants 最多包含 20 个约束',
        'invariants'
      )
    );
  }
  const invariantCodes = new Set<string>();
  invariants.forEach((rawInvariant, index) => {
    const path = `invariants[${index}]`;
    if (!isRecord(rawInvariant)) {
      diagnostics.push(
        diagnostic('DATA_RESOURCE_INVARIANT_INVALID', `${path} 必须是对象`, path)
      );
      return;
    }
    const invariantCode = String(rawInvariant.code || '');
    if (
      !DATA_RESOURCE_INVARIANT_CODE_PATTERN.test(invariantCode) ||
      invariantCode.length > 128 ||
      invariantCodes.has(invariantCode)
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_INVARIANT_CODE_INVALID',
          `${path}.code 必须是唯一稳定标识`,
          `${path}.code`
        )
      );
    } else {
      invariantCodes.add(invariantCode);
    }
    if (
      rawInvariant.message !== undefined &&
      (typeof rawInvariant.message !== 'string' ||
        rawInvariant.message.length < 1 ||
        rawInvariant.message.length > 500)
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_INVARIANT_MESSAGE_INVALID',
          `${path}.message 必须是 1 到 500 个字符`,
          `${path}.message`
        )
      );
    }
    const expression = isRecord(rawInvariant.expression)
      ? rawInvariant.expression
      : {};
    if (!isRecord(rawInvariant.expression)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_INVARIANT_EXPRESSION_INVALID',
          `${path}.expression 必须是对象`,
          `${path}.expression`
        )
      );
    }
    const leftField = String(expression.leftField || '');
    const rightField = String(expression.rightField || '');
    const operator = String(expression.operator || '');
    if (!fieldCodes.has(leftField)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_INVARIANT_FIELD_UNKNOWN',
          `${path}.expression.leftField 未声明`,
          `${path}.expression.leftField`
        )
      );
    }
    if (!fieldCodes.has(rightField)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_INVARIANT_FIELD_UNKNOWN',
          `${path}.expression.rightField 未声明`,
          `${path}.expression.rightField`
        )
      );
    }
    if (!DATA_TRANSACTION_FIELD_OPERATORS.has(operator)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_INVARIANT_OPERATOR_INVALID',
          `${path}.expression.operator 无效`,
          `${path}.expression.operator`
        )
      );
    }
    const leftType = fieldTypes.get(leftField);
    const rightType = fieldTypes.get(rightField);
    const comparable =
      leftType !== undefined &&
      rightType !== undefined &&
      (leftType === rightType ||
        (['number.integer', 'number.decimal'].includes(leftType) &&
          ['number.integer', 'number.decimal'].includes(rightType)));
    if (
      comparable &&
      !['eq', 'neq'].includes(operator) &&
      !DATA_RESOURCE_ORDERED_FIELD_TYPES.has(leftType!)
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_INVARIANT_FIELD_TYPES_INVALID',
          `${path}.expression 字段类型不支持有序比较`,
          `${path}.expression`
        )
      );
    } else if (leftType && rightType && !comparable) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_INVARIANT_FIELD_TYPES_INVALID',
          `${path}.expression 字段类型不可比较`,
          `${path}.expression`
        )
      );
    }
    if (
      Object.keys(rawInvariant).some(key => !['code', 'message', 'expression'].includes(key)) ||
      Object.keys(expression).some(
        key => !['leftField', 'operator', 'rightField'].includes(key)
      )
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_INVARIANT_EXPRESSION_UNBOUNDED',
          `${path} 只允许有界字段比较`,
          path
        )
      );
    }
  });
  const capabilities = isRecord(value.capabilities)
    ? value.capabilities
    : {};
  for (const operation of ['read', 'create', 'update', 'delete']) {
    requireString(
      capabilities[operation],
      `capabilities.${operation}`,
      diagnostics
    );
  }
  const fieldPolicies = isRecord(value.fieldPolicies)
    ? value.fieldPolicies
    : {};
  for (const field of Object.keys(fieldPolicies)) {
    if (!fieldCodes.has(field)) {
      diagnostics.push(
        diagnostic(
          'DATA_RESOURCE_FIELD_POLICY_UNKNOWN_FIELD',
          `fieldPolicies.${field} 引用了未声明字段`,
          `fieldPolicies.${field}`
        )
      );
    }
    const policy = isRecord(fieldPolicies[field]) ? fieldPolicies[field] : {};
    for (const key of Object.keys(policy)) {
      if (!['read', 'create', 'update', 'mask'].includes(key)) {
        diagnostics.push(
          diagnostic(
            'DATA_RESOURCE_FIELD_POLICY_KEY_INVALID',
            `fieldPolicies.${field}.${key} 不受支持`,
            `fieldPolicies.${field}.${key}`
          )
        );
      }
    }
  }
  return diagnostics;
}

export function assertDataResource(
  value: unknown
): asserts value is DataResource {
  const diagnostics = validateDataResource(value);
  if (diagnostics.length > 0) throw new ContractValidationError(diagnostics);
}

export function validateDataQuery(value: unknown): Diagnostic[] {
  return validateDataQueryContract(value);
}

export function assertDataQuery(value: unknown): asserts value is DataQuery {
  const diagnostics = validateDataQueryContract(value);
  if (diagnostics.length > 0) throw new ContractValidationError(diagnostics);
}

export function validateDataExportRequest(value: unknown): Diagnostic[] {
  return validateDataExportRequestContract(value);
}

export function assertDataExportRequest(
  value: unknown
): asserts value is DataExportRequest {
  const diagnostics = validateDataExportRequestContract(value);
  if (diagnostics.length > 0) throw new ContractValidationError(diagnostics);
}

export function validateDataTransactionRequest(
  value: unknown
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(value)) {
    return [
      diagnostic(
        'DATA_TRANSACTION_INVALID',
        'DataTransactionRequest 必须是对象',
        '$'
      ),
    ];
  }
  if (value.schemaVersion !== SCHEMA_VERSIONS.dataTransactionRequest) {
    diagnostics.push(
      diagnostic(
        'DATA_TRANSACTION_SCHEMA_UNSUPPORTED',
        `schemaVersion 必须是 ${SCHEMA_VERSIONS.dataTransactionRequest}`,
        'schemaVersion'
      )
    );
  }
  requireString(value.idempotencyKey, 'idempotencyKey', diagnostics);
  const guards = value.guards === undefined
    ? []
    : Array.isArray(value.guards)
      ? value.guards
      : [];
  if (value.guards !== undefined && !Array.isArray(value.guards)) {
    diagnostics.push(
      diagnostic(
        'DATA_TRANSACTION_GUARDS_INVALID',
        'guards 必须是数组',
        'guards'
      )
    );
  }
  if (guards.length > 20) {
    diagnostics.push(
      diagnostic(
        'DATA_TRANSACTION_GUARDS_INVALID',
        'guards 最多包含 20 个约束',
        'guards'
      )
    );
  }
  guards.forEach((guard, index) => {
    const path = `guards[${index}]`;
    if (!isRecord(guard)) {
      diagnostics.push(
        diagnostic('DATA_TRANSACTION_GUARD_INVALID', `${path} 必须是对象`, path)
      );
      return;
    }
    if (guard.kind === 'operation-time') {
      const allowed = ['kind', 'operationIndex', 'field', 'operator', 'offsetMilliseconds', 'errorCode'];
      if (Object.keys(guard).length !== allowed.length ||
        Object.keys(guard).some(key => !allowed.includes(key)) ||
        !Number.isSafeInteger(guard.operationIndex) || Number(guard.operationIndex) < 0 ||
        Number(guard.operationIndex) > 99 || !Number.isSafeInteger(guard.offsetMilliseconds) ||
        Math.abs(Number(guard.offsetMilliseconds)) > 31622400000 ||
        typeof guard.field !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(guard.field) ||
        !DATA_TRANSACTION_FIELD_OPERATORS.has(String(guard.operator)) ||
        !DATA_TRANSACTION_ERROR_CODE_PATTERN.test(String(guard.errorCode))) {
        diagnostics.push(diagnostic('DATA_TRANSACTION_OPERATION_TIME_INVALID',
          `${path} requires a bounded operation index, field, comparison, millisecond offset and OPENXIANGDA_* error code`, path));
      }
      const operation = Array.isArray(value.operations) ? value.operations[Number(guard.operationIndex)] : undefined;
      const literal = isRecord(operation) && isRecord(operation.data) ? operation.data[String(guard.field)] : undefined;
      if (!isRecord(operation) || !['create', 'update'].includes(String(operation.operation)) ||
        typeof literal !== 'string' || literal.length > 64 ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i.test(literal) ||
        !Number.isFinite(Date.parse(literal))) {
        diagnostics.push(diagnostic('DATA_TRANSACTION_OPERATION_TIME_INPUT_INVALID',
          `${path} must bind a literal datetime in an existing create/update operation`, path));
      }
      return;
    }
    if (guard.kind === 'role-member') {
      const allowed = ['kind', 'userId', 'roleCode', 'errorCode'];
      if (Object.keys(guard).some(key => !allowed.includes(key)) ||
        !allowed.every(key => typeof guard[key] === 'string' && String(guard[key]).trim().length > 0) ||
        String(guard.userId).length > 255 || String(guard.roleCode).length > 100 ||
        !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(String(guard.roleCode)) ||
        !DATA_TRANSACTION_ERROR_CODE_PATTERN.test(String(guard.errorCode))) {
        diagnostics.push(diagnostic('DATA_TRANSACTION_ROLE_MEMBER_INVALID',
          `${path} 只能包含 kind、目标 userId、已声明 roleCode 和 OPENXIANGDA_* 失败码`, path));
      }
      return;
    }
    if (
      ![
        'query-empty',
        'record-assert',
        'record-exists',
        'record-match',
      ].includes(String(guard.kind))
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_TRANSACTION_GUARD_KIND_UNSUPPORTED',
          `${path}.kind 只支持 query-empty/record-assert/record-exists/record-match`,
          `${path}.kind`
        )
      );
    }
    if (
      requireString(guard.resourceCode, `${path}.resourceCode`, diagnostics) &&
      !isCanonicalResourceCode(String(guard.resourceCode))
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_TRANSACTION_GUARD_RESOURCE_INVALID',
          `${path}.resourceCode 不是有效资源代码`,
          `${path}.resourceCode`
        )
      );
    }
    if (requireString(guard.lockKey, `${path}.lockKey`, diagnostics)) {
      if (String(guard.lockKey).length > 128) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_GUARD_LOCK_KEY_INVALID',
            `${path}.lockKey 最长 128 个字符`,
            `${path}.lockKey`
          )
        );
      }
    }
    if (
      !requireString(guard.errorCode, `${path}.errorCode`, diagnostics) ||
      !DATA_TRANSACTION_ERROR_CODE_PATTERN.test(String(guard.errorCode))
    ) {
      diagnostics.push(
        diagnostic(
          'DATA_TRANSACTION_GUARD_ERROR_CODE_INVALID',
          `${path}.errorCode 必须使用 OPENXIANGDA_* 命名空间`,
          `${path}.errorCode`
        )
      );
    }
    if (guard.kind === 'query-empty') {
      if (!('where' in guard)) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_GUARD_WHERE_REQUIRED',
            `${path}.where 必填`,
            `${path}.where`
          )
        );
      } else {
        appendDataWhereDiagnostics(guard.where, `${path}.where`, diagnostics, {
          maxPredicates: 20,
        });
      }
    }
    if (
      guard.kind === 'record-assert' ||
      guard.kind === 'record-match'
    ) {
      requireString(guard.id, `${path}.id`, diagnostics);
      const assertions = Array.isArray(guard.assertions)
        ? guard.assertions
        : [];
      if (assertions.length === 0 || assertions.length > 20) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_GUARD_ASSERTIONS_INVALID',
            `${path}.assertions 必须包含 1 到 20 个断言`,
            `${path}.assertions`
          )
        );
      }
      assertions.forEach((assertion, assertionIndex) => {
        const assertionPath = `${path}.assertions[${assertionIndex}]`;
        if (!isRecord(assertion)) {
          diagnostics.push(
            diagnostic(
              'DATA_TRANSACTION_GUARD_ASSERTION_INVALID',
              `${assertionPath} 必须是对象`,
              assertionPath
            )
          );
          return;
        }
        if (assertion.kind === 'value') {
          const { kind: _kind, ...predicate } = assertion;
          appendDataWhereDiagnostics(
            predicate,
            assertionPath,
            diagnostics,
            { maxDepth: 1, maxPredicates: 1 }
          );
          return;
        }
        if (assertion.kind === 'field') {
          requireString(
            assertion.leftField,
            `${assertionPath}.leftField`,
            diagnostics
          );
          requireString(
            assertion.rightField,
            `${assertionPath}.rightField`,
            diagnostics
          );
          if (!DATA_TRANSACTION_FIELD_OPERATORS.has(String(assertion.operator))) {
            diagnostics.push(
              diagnostic(
                'DATA_TRANSACTION_GUARD_ASSERTION_OPERATOR_INVALID',
                `${assertionPath}.operator 无效`,
                `${assertionPath}.operator`
              )
            );
          }
          return;
        }
        if (assertion.kind === 'database-now') {
          requireString(
            assertion.field,
            `${assertionPath}.field`,
            diagnostics
          );
          if (!DATA_TRANSACTION_FIELD_OPERATORS.has(String(assertion.operator))) {
            diagnostics.push(
              diagnostic(
                'DATA_TRANSACTION_GUARD_ASSERTION_OPERATOR_INVALID',
                `${assertionPath}.operator 无效`,
                `${assertionPath}.operator`
              )
            );
          }
          if (
            Object.keys(assertion).some(
              key => !['kind', 'field', 'operator'].includes(key)
            )
          ) {
            diagnostics.push(
              diagnostic(
                'DATA_TRANSACTION_GUARD_DATABASE_NOW_UNBOUNDED',
                `${assertionPath} 不能提交时间值、offset 或数据库表达式`,
                assertionPath
              )
            );
          }
          return;
        }
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_GUARD_ASSERTION_KIND_INVALID',
            `${assertionPath}.kind 只支持 value/field/database-now`,
            `${assertionPath}.kind`
          )
        );
      });
    }
    if (guard.kind === 'record-exists') {
      requireString(guard.id, `${path}.id`, diagnostics);
      if ('assertions' in guard) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_GUARD_ASSERTIONS_UNSUPPORTED',
            `${path}.assertions 不适用于 record-exists`,
            `${path}.assertions`
          )
        );
      }
    }
    if ('sql' in guard || 'relation' in guard || 'table' in guard) {
      diagnostics.push(
        diagnostic(
          'DATA_TRANSACTION_ARBITRARY_SQL_FORBIDDEN',
          `${path} 不能声明 SQL、表名或任意关系`,
          path
        )
      );
    }
  });
  const operations = Array.isArray(value.operations) ? value.operations : [];
  if (operations.length === 0 || operations.length > 100) {
    diagnostics.push(
      diagnostic(
        'DATA_TRANSACTION_OPERATIONS_INVALID',
        'operations 必须包含 1 到 100 个操作',
        'operations'
      )
    );
  }
  if (
    operations.filter(
      operation => isRecord(operation) && operation.operation === 'emitEvent'
    ).length > 20
  ) {
    diagnostics.push(
      diagnostic(
        'DATA_TRANSACTION_EMIT_EVENTS_EXCEEDED',
        '单个事务最多产生 20 个应用领域事件',
        'operations'
      )
    );
  }
  operations.forEach((operation, index) => {
    const path = `operations[${index}]`;
    if (!isRecord(operation)) {
      diagnostics.push(
        diagnostic('DATA_TRANSACTION_OPERATION_INVALID', `${path} 必须是对象`, path)
      );
      return;
    }
    if (!['create', 'update', 'delete', 'increment', 'emitEvent'].includes(String(operation.operation))) {
      diagnostics.push(
        diagnostic(
          'DATA_TRANSACTION_OPERATION_UNSUPPORTED',
          `${path}.operation 只支持 create/update/delete/increment/emitEvent`,
          `${path}.operation`
        )
      );
    }
    if (operation.operation !== 'emitEvent') {
      requireString(operation.resourceCode, `${path}.resourceCode`, diagnostics);
    }
    if (operation.operation === 'create' || operation.operation === 'update') {
      if (!isRecord(operation.data)) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_DATA_REQUIRED',
            `${path}.data 必须是对象`,
            `${path}.data`
          )
        );
      } else {
        validateTransactionOperationDataReferences(
          operation.data,
          index,
          operations,
          diagnostics
        );
      }
    }
    if (operation.operation === 'update' || operation.operation === 'delete') {
      requireString(operation.id, `${path}.id`, diagnostics);
      if (
        !Number.isSafeInteger(operation.expectedRevision) ||
        Number(operation.expectedRevision) < 1
      ) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_REVISION_INVALID',
            `${path}.expectedRevision 必须是正整数`,
            `${path}.expectedRevision`
          )
        );
      }
    }
    if (operation.operation === 'increment') {
      requireString(operation.id, `${path}.id`, diagnostics);
      requireString(operation.field, `${path}.field`, diagnostics);
      if (
        !Number.isSafeInteger(operation.amount) ||
        Number(operation.amount) === 0 ||
        Math.abs(Number(operation.amount)) > 1_000_000
      ) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_INCREMENT_AMOUNT_INVALID',
            `${path}.amount 必须是绝对值不超过 1000000 的非零安全整数`,
            `${path}.amount`
          )
        );
      }
      const hasRecordGuard = guards.some(
        guard =>
          isRecord(guard) &&
          guard.kind === 'record-assert' &&
          guard.resourceCode === operation.resourceCode &&
          guard.id === operation.id
      );
      if (!hasRecordGuard) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_INCREMENT_GUARD_REQUIRED',
            `${path} 必须有同资源同记录的 record-assert 锁定约束`,
            path
          )
        );
      }
    }
    if (operation.operation === 'emitEvent') {
      const eventTypeValid = requireString(
        operation.eventType,
        `${path}.eventType`,
        diagnostics
      );
      if (
        eventTypeValid &&
        (!APPLICATION_EVENT_TYPE_PATTERN.test(String(operation.eventType)) ||
          String(operation.eventType).length > 255)
      ) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_EVENT_TYPE_INVALID',
            `${path}.eventType 必须是非 openxiangda 命名空间的版本化应用事件类型`,
            `${path}.eventType`
          )
        );
      }
      if (
        operation.subject !== undefined &&
        (typeof operation.subject !== 'string' ||
          operation.subject.length < 1 ||
          operation.subject.length > 512)
      ) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_EVENT_SUBJECT_INVALID',
            `${path}.subject 必须是 1 到 512 个字符`,
            `${path}.subject`
          )
        );
      }
      if (!isRecord(operation.data)) {
        diagnostics.push(
          diagnostic(
            'DATA_TRANSACTION_EVENT_DATA_INVALID',
            `${path}.data 必须是对象`,
            `${path}.data`
          )
        );
      } else {
        let dataBytes = Number.POSITIVE_INFINITY;
        try {
          dataBytes = Buffer.byteLength(JSON.stringify(operation.data), 'utf8');
        } catch {
          // Reported by the combined validation below.
        }
        if (Object.keys(operation.data).length > 100 || dataBytes > 65_536) {
          diagnostics.push(
            diagnostic(
              'DATA_TRANSACTION_EVENT_DATA_TOO_LARGE',
              `${path}.data 最多 100 个属性且序列化后不能超过 64 KiB`,
              `${path}.data`
            )
          );
        }
        validateTransactionOperationDataReferences(
          operation.data,
          index,
          operations,
          diagnostics
        );
      }
    }
    if ('sql' in operation || 'relation' in operation || 'table' in operation) {
      diagnostics.push(
        diagnostic(
          'DATA_TRANSACTION_ARBITRARY_SQL_FORBIDDEN',
          `${path} 不能声明 SQL、表名或任意关系`,
          path
        )
      );
    }
  });
  guards.forEach((guard, index) => {
    if (!isRecord(guard) || guard.kind !== 'record-assert') return;
    const matchingMutations = operations.filter(
      operation =>
        isRecord(operation) &&
        ['update', 'delete', 'increment'].includes(String(operation.operation)) &&
        operation.resourceCode === guard.resourceCode &&
        operation.id === guard.id
    );
    if (matchingMutations.length !== 1) {
      diagnostics.push(
        diagnostic(
          'DATA_TRANSACTION_RECORD_ASSERT_MUTATION_REQUIRED',
          `guards[${index}] 必须且只能绑定一个同资源同记录的 update/delete/increment 操作`,
          `guards[${index}]`
        )
      );
    }
  });
  return diagnostics;
}

export function assertDataTransactionRequest(
  value: unknown
): asserts value is DataTransactionRequest {
  const diagnostics = validateDataTransactionRequest(value);
  if (diagnostics.length > 0) throw new ContractValidationError(diagnostics);
}
