import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalJson, sha256Digest } from '../src/canonical.js';
import { validateDataFieldDefinition } from '../src/data-field-validation.js';
import { dataResourceSchema, workflowBindingSchema, userCandidatesQuerySchema, userCandidatesPageSchema } from '../src/schemas.js';
import * as esm from '../dist/native-compiler/index.js';

const require = createRequire(import.meta.url);
const cjs = require('../dist/native-compiler/index.cjs') as typeof esm;
// Reuse the same JSON-schema engine as the application compiler.
const Ajv = createRequire(
  new URL('../../devkit-core/package.json', import.meta.url)
)('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false, validateFormats: false });
const validateResourceSchema = ajv.compile(dataResourceSchema);
const validateBindingSchema = ajv.compile(workflowBindingSchema);
const corpus = JSON.parse(
  readFileSync(
    new URL(
      './fixtures/configuration-compatibility-corpus.json',
      import.meta.url
    ),
    'utf8'
  )
);
const roleSource = {
  kind: 'app-role' as const,
  roleCode: 'reviewer',
  pageSize: 20,
};

test('candidate query schemas require one complete owner context and bound untrusted search input', () => {
  const validate = ajv.compile(userCandidatesQuerySchema);
  const search = { schemaVersion: 'openxiangda.user-candidates-query/v2', selectedIds: ['same-name-a', 'same-name-b'] };
  for (const context of [
    { operation: 'create' },
    { operation: 'update', recordId: 'record-1', expectedRevision: 7 },
    { expectedRevision: 7, expectedTaskVersion: 2 },
  ]) assert.equal(validate({ ...search, ...context }), true, JSON.stringify(validate.errors));
  for (const input of [
    { ...search },
    { ...search, operation: 'update', recordId: 'record-1' },
    { ...search, operation: 'create', expectedRevision: 7 },
    { ...search, expectedRevision: 7 },
    { ...search, expectedRevision: 7, expectedTaskVersion: 0 },
    { ...search, operation: 'create', roleCode: 'other-role' },
    { ...search, operation: 'create', bindings: { college: 'other' } },
    { ...search, operation: 'create', selectedIds: ['duplicate', 'duplicate'] },
    { ...search, operation: 'create', selectedIds: [' padded '] },
    { ...search, operation: 'create', selectedIds: Array.from({ length: 201 }, (_, i) => `u-${i}`) },
    { ...search, operation: 'create', keyword: 'a'.repeat(65) },
    { ...search, operation: 'create', cursor: 'a'.repeat(2049) },
  ]) assert.equal(validate(input), false, JSON.stringify(input));
});

test('candidate pages expose names only for valid selections and keep bounded pages', () => {
  const validate = ajv.compile(userCandidatesPageSchema);
  const page = { schemaVersion: 'openxiangda.user-candidates-page/v2', resourceCode: 'requests', fieldCode: 'leaders',
    environmentHeadRevision: 3, recordRevision: 7, evaluatedAt: '2026-10-03T00:00:00.000Z',
    items: [{ value: 'same-name-a', label: '陈老师' }],
    selected: [{ value: 'departed', status: 'invalid' }], nextCursor: null };
  assert.equal(validate(page), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...page, selected: [{ value: 'same-name-a', status: 'valid', label: '陈老师' }] }), true);
  assert.equal(validate({ ...page, selected: [{ value: 'departed', status: 'invalid', label: 'Hidden name' }] }), false);
  assert.equal(validate({ ...page, items: Array.from({ length: 51 }, () => page.items[0]) }), false);
});

function fixture(scope?: {
  dimensionCode: string;
  operation: string;
  field?: string;
  value?: string;
  creation?: 'prospective';
}) {
  const config = JSON.parse(corpus.configuration.canonical);
  const resource = config.data.resources[0];
  const source = { ...roleSource, ...(scope ? { scope } : {}) };
  resource.schema.fields.push({
    code: 'approvers',
    type: 'user.multiple',
    userCandidates: source,
    nullable: false,
  });
  resource.surface.fields.approvers = {
    ...resource.surface.fields.status,
    type: 'user.multiple',
    widget: 'directory-user',
    label: '审批人',
    userCandidates: source,
    min: undefined,
    max: undefined,
    requiredHint: false,
  };
  resource.fieldPolicies.approvers = resource.fieldPolicies.status;
  config.authz.scopeDimensions.push({
    code: 'college',
    name: '学院',
    valueType: 'string',
    hierarchyMode: 'flat',
  });
  const definition = config.workflows.definitions[0].definition;
  definition.subject.factProjection.selected = 'approvers';
  definition.taskPages = {
    fill: {
      title: '补充审批人',
      fields: [{ code: 'approvers' }, { code: 'name', readonly: true }],
    },
  };
  definition.nodes.review.taskPageCode = 'fill';
  const binding = config.workflows.bindings[0].binding;
  binding.bindings.reviewer = {
    provider: 'form_field_users',
    inputPath: 'selected',
    candidateField: 'approvers',
  };
  return { config, resource, definition, binding };
}

function compile(implementation: typeof esm, config: any) {
  const contract = {
    ...JSON.parse(corpus.contract.canonical),
    configDigest: sha256Digest(config),
  };
  for (const resource of config.data.resources) {
    const target = contract.resources.find(
      (item: any) => item.code === resource.code
    );
    target.schemaDigest = sha256Digest(resource.schema);
    target.fields = resource.schema.fields
      .map((field: any) => ({ code: field.code, type: field.type }))
      .sort((a: any, b: any) => a.code.localeCompare(b.code));
  }
  contract.workflows[0].subject =
    config.workflows.definitions[0].definition.subject;
  return implementation.compileNativeApplicationConfiguration({
    appCode: corpus.appCode,
    configBytes: canonicalJson(config),
    contractBytes: canonicalJson(contract),
    expectedConfigDigest: sha256Digest(config),
    expectedContractDigest: sha256Digest(contract),
  });
}

for (const [distribution, implementation] of [
  ['esm', esm],
  ['cjs', cjs],
] as const) {
  test(`${distribution}: constrained fields preserve their one source and require the runtime capability`, () => {
    const plain = JSON.parse(corpus.configuration.canonical);
    assert.equal(
      compile(implementation, plain).requiredPlatformCapabilities.some(
        (x) => x.code === 'data.user-candidates'
      ),
      false
    );
    for (const scope of [
      undefined,
      { dimensionCode: 'college', operation: 'approve', value: 'arts' },
      { dimensionCode: 'college', operation: 'approve', field: 'name' },
      { dimensionCode: 'college', operation: 'approve', field: 'name', creation: 'prospective' as const },
    ]) {
      const { config, resource, binding } = fixture(scope);
      assert.equal(
        validateResourceSchema(resource),
        true,
        JSON.stringify(validateResourceSchema.errors)
      );
      assert.equal(
        validateBindingSchema(binding),
        true,
        JSON.stringify(validateBindingSchema.errors)
      );
      assert.equal(
        compile(implementation, config).requiredPlatformCapabilities.find(
          (x) => x.code === 'data.user-candidates'
        )?.contractVersion,
        '1.0.0'
      );
      assert.equal(compile(implementation, config).requiredPlatformCapabilities.some(
        item => item.code === 'data.user-candidate-launch-scope'), scope?.creation === 'prospective');
      const parsed = implementation.parseNativeDataFieldsV2(
        resource.schema.fields,
        '/fields'
      );
      assert.deepEqual(
        parsed.find((x) => x.code === 'approvers')?.userCandidates,
        { ...roleSource, ...(scope ? { scope } : {}) }
      );
    }
  });

  test(`${distribution}: bad role, scope and schema/surface drift fail before activation`, () => {
    for (const [mutate, error] of [
      [
        (f: ReturnType<typeof fixture>) => {
          f.resource.schema.fields[2].userCandidates.roleCode = 'unknown';
        },
        /ROLE_UNDECLARED/,
      ],
      [
        (f: ReturnType<typeof fixture>) => {
          f.resource.schema.fields[2].userCandidates.scope.dimensionCode =
            'unknown';
        },
        /DIMENSION_UNDECLARED/,
      ],
      [
        (f: ReturnType<typeof fixture>) => {
          f.resource.schema.fields[2].userCandidates.scope.field = 'status';
        },
        /SCOPE_FIELD_INVALID/,
      ],
      [
        (f: ReturnType<typeof fixture>) => {
          f.resource.surface.fields.approvers.userCandidates = {
            ...roleSource,
            pageSize: 5,
          };
        },
        /SURFACE/,
      ],
    ] as const) {
      const f = fixture({
        dimensionCode: 'college',
        operation: 'approve',
        field: 'name',
      });
      mutate(f);
      assert.throws(() => compile(implementation, f.config), error);
    }
  });

  test(`${distribution}: flow bindings cannot detach the original field or rewrite its scope`, () => {
    for (const [mutate, error] of [
      [
        (f: ReturnType<typeof fixture>) => {
          delete f.binding.bindings.reviewer.candidateField;
        },
        /FIELD_BINDING_REQUIRED/,
      ],
      [
        (f: ReturnType<typeof fixture>) => {
          f.binding.bindings.reviewer.provider = 'input_users';
        },
        /FIELD_BINDING_REQUIRED/,
      ],
      [
        (f: ReturnType<typeof fixture>) => {
          f.binding.bindings.reviewer.candidateField = 'name';
        },
        /FIELD_BINDING_REQUIRED/,
      ],
      [
        (f: ReturnType<typeof fixture>) => {
          f.binding.bindings.reviewer.roleCode = 'reviewer';
        },
        /SOURCE_OVERRIDE_FORBIDDEN/,
      ],
      [
        (f: ReturnType<typeof fixture>) => {
          f.binding.bindings.reviewer.scope = {
            dimension: 'college',
            value: 'other',
          };
        },
        /SOURCE_OVERRIDE_FORBIDDEN/,
      ],
      [
        (f: ReturnType<typeof fixture>) => {
          delete f.definition.subject.factProjection.name;
        },
        /SCOPE_PROJECTION_REQUIRED/,
      ],
      [
        (f: ReturnType<typeof fixture>) => {
          f.definition.subject.factProjection.otherName = 'name';
        },
        /SCOPE_PROJECTION_REQUIRED/,
      ],
      [
        (f: ReturnType<typeof fixture>) => {
          f.definition.taskPages.fill.fields[1].readonly = false;
        },
        /SCOPE_WRITE_FORBIDDEN/,
      ],
    ] as const) {
      const f = fixture({
        dimensionCode: 'college',
        operation: 'approve',
        field: 'name',
      });
      mutate(f);
      assert.throws(() => compile(implementation, f.config), error);
    }
    const f = fixture();
    const fields = new Map(
      f.resource.schema.fields.map((field: any) => [field.code, field])
    ) as Parameters<typeof implementation.resolveWorkflowUserCandidates>[2];
    for (const path of [
      'selected.value',
      'selected.0',
      'nested.selected.value',
    ]) {
      f.definition.subject.factProjection['nested.selected'] = 'approvers';
      assert.throws(
        () =>
          implementation.resolveWorkflowUserCandidates(
            f.definition,
            { provider: 'input_users', inputPath: path },
            fields,
            '/binding'
          ),
        /FIELD_BINDING_REQUIRED/
      );
    }
    assert.equal(
      implementation.resolveWorkflowUserCandidates(
        f.definition,
        { provider: 'input_users', inputPath: 'ordinary' },
        fields,
        '/binding'
      ),
      undefined
    );
  });

  test(`${distribution}: stable scope values use option identity and reject absent or malformed values`, () => {
    const source = {
      ...roleSource,
      scope: {
        dimensionCode: 'college',
        operation: 'approve',
        field: 'college',
      },
    };
    assert.equal(
      implementation.userCandidateScopeValue(source, {
        college: { value: 'arts', label: '艺术学院' },
      }),
      'arts'
    );
    for (const value of [undefined, null, '', ' arts ', 42, { label: 'arts' }])
      assert.throws(
        () =>
          implementation.userCandidateScopeValue(source, { college: value }),
        /SCOPE_VALUE_REQUIRED/
      );
  });
}

for (const [distribution, implementation] of [['esm', esm], ['cjs', cjs]] as const) {
  test(`${distribution}: prospective scope is opt-in, field-only and uses resource identities`, () => {
    const scope = { dimensionCode: 'college', operation: 'approve', field: 'college', creation: 'prospective' as const };
    const source = { ...roleSource, scope };
    assert.deepEqual(implementation.parseDataFieldUserCandidates(source, 'user.single', '/field'), source);
    for (const bad of [{ ...scope, creation: 'saved' }, { ...scope, field: undefined, value: 'a' }, { dimensionCode: 'college', operation: 'approve', value: 'a', creation: 'prospective' }])
      assert.throws(() => implementation.parseDataFieldUserCandidates({ ...source, scope: bad }, 'user.single', '/field'), /SCOPE/);
    const fields = [{ code: 'college', type: 'resource-ref.single' }, { code: 'reviewer', type: 'user.single', userCandidates: source }];
    implementation.validateUserCandidateReferences(fields, new Set(['reviewer']), new Set(['college']), '/fields');
    assert.equal(implementation.userCandidateScopeValue(source, { college: { resourceCode: 'colleges', value: 'a', label: 'Wrong label' } }), 'a');
    assert.equal(implementation.requiresUserCandidateLaunchScope([{ schema: { fields } }]), true);
    assert.equal(implementation.requiresUserCandidateLaunchScope([{ schema: { fields: [] } }]), false);
  });
}

test('public field and JSON schema validation reject non-user constraints and malformed declarations', () => {
  for (const source of [
    null,
    { ...roleSource, pageSize: 0 },
    { ...roleSource, pageSize: 51 },
    { ...roleSource, roleCode: ' invalid ' },
    { ...roleSource, extra: true },
    {
      ...roleSource,
      scope: { dimensionCode: 'college', operation: 'approve' },
    },
    {
      ...roleSource,
      scope: {
        dimensionCode: 'college',
        operation: 'approve',
        field: 'name',
        value: 'arts',
      },
    },
  ]) {
    const diagnostics: Parameters<typeof validateDataFieldDefinition>[2] = [];
    validateDataFieldDefinition(
      { code: 'approvers', type: 'user.multiple', userCandidates: source },
      '/field',
      diagnostics
    );
    assert.ok(diagnostics.length);
    const f = fixture();
    f.resource.schema.fields[2].userCandidates = source;
    assert.equal(validateResourceSchema(f.resource), false);
  }
  for (const location of ['schema', 'surface']) {
    const f = fixture();
    const field =
      location === 'schema'
        ? f.resource.schema.fields[0]
        : f.resource.surface.fields.name;
    field.userCandidates = roleSource;
    assert.equal(validateResourceSchema(f.resource), false);
  }
  for (const override of [
    { provider: 'input_users' },
    { roleCode: 'reviewer' },
    { scope: {} },
    { routing: {} },
  ]) {
    const f = fixture();
    Object.assign(f.binding.bindings.reviewer, override);
    assert.equal(validateBindingSchema(f.binding), false);
  }
});

test('editable task child candidate fields are explicit unsupported declarations; historical readonly values remain readable', () => {
  const definition = {
    subject: { resourceCode: 'records', factProjection: {} },
    taskPages: {
      fill: {
        fields: [
          {
            code: 'items',
            subtable: { fields: [{ code: 'approvers', readonly: false }] },
          },
        ],
      },
    },
  };
  const fields = new Map([
    [
      'items',
      { code: 'items', type: 'subtable', subtable: { resourceCode: 'items' } },
    ],
  ]);
  const resources = new Map([
    [
      'items',
      new Map([
        [
          'approvers',
          {
            code: 'approvers',
            type: 'user.multiple',
            userCandidates: roleSource,
          },
        ],
      ]),
    ],
  ]);
  assert.throws(
    () =>
      esm.validateWorkflowUserCandidateBindings(
        definition,
        { bindings: {} },
        fields,
        '/binding',
        resources
      ),
    /OWNED_FIELD_UNSUPPORTED/
  );
  definition.taskPages.fill.fields[0]!.subtable.fields[0]!.readonly = true;
  assert.doesNotThrow(() =>
    esm.validateWorkflowUserCandidateBindings(
      definition,
      { bindings: {} },
      fields,
      '/binding',
      resources
    )
  );
});
