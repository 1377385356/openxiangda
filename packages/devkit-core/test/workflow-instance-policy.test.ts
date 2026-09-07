import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  canonicalJson,
  sha256Digest,
  workflowDefinitionSchema,
  type WorkflowDefinition,
} from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources } from '../src/compiler/bundle.js';
import {
  defineOpenXiangdaApp,
  type OpenXiangdaAppDeclaration,
} from '../src/compiler/config.js';
import { requiredPlatformCapabilitiesFromConfiguration } from '../src/compiler/package-compiler.js';

const capability = 'app:policy-review:reservation:cancel';
function fixture(): OpenXiangdaAppDeclaration {
  const definition: WorkflowDefinition = {
    schemaVersion: 'openxiangda.workflow-definition/v2',
    code: 'reservation-approval',
    title: 'Reservation approval',
    acceptedCommandDeactivationPolicy: 'finish-pinned',
    subject: {
      resourceCode: 'reservations',
      factProjection: { startsAt: 'starts_at' },
    },
    instanceCommands: {
      withdraw: { beforeFact: 'startsAt' },
      terminate: { capability, beforeFact: 'startsAt' },
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['startsAt'],
      properties: { startsAt: { type: 'string', format: 'date-time' } },
    },
    startAt: 'review',
    nodes: {
      review: {
        id: 'review',
        title: 'Review',
        kind: 'approval',
        mode: 'single',
        binding: 'reviewer',
        onApprove: 'approved',
        onReject: 'rejected',
      },
      approved: {
        id: 'approved',
        title: 'Approved',
        kind: 'end',
        outcome: 'approved',
      },
      rejected: {
        id: 'rejected',
        title: 'Rejected',
        kind: 'end',
        outcome: 'rejected',
      },
    },
  };
  return {
    schemaVersion: 3,
    app: { code: 'policy-review', name: 'Policy review' },
    frontend: { root: 'apps/web' },
    data: {
      resources: [
        {
          code: 'reservations',
          name: 'Reservations',
          fields: [
            {
              code: 'starts_at',
              label: 'Starts at',
              type: 'datetime',
              required: true,
            },
          ],
        },
      ],
    },
    authz: {
      capabilities: [
        { code: capability, name: 'Cancel reservation', kind: 'backend' },
      ],
      roles: [
        { code: 'reviewer', name: 'Reviewer', capabilities: [capability] },
      ],
    },
    workflows: {
      definitions: [
        { version: 1, definition, launch: { mode: 'work-center-only' } },
      ],
      bindings: [
        {
          version: 1,
          binding: {
            schemaVersion: 'openxiangda.workflow-binding/v2',
            workflowCode: definition.code,
            bindings: {
              reviewer: { provider: 'app_role', roleCode: 'reviewer' },
            },
          },
        },
      ],
      activations: [
        {
          workflowCode: definition.code,
          definitionVersion: 1,
          bindingVersion: 1,
          acceptedCommandDeactivationPolicy: 'finish-pinned',
        },
      ],
    },
  };
}

test('official application and platform compilers preserve policies and identical capability closure', () => {
  const output = compileApplicationSources(defineOpenXiangdaApp(fixture()));
  const platform = compileNativeApplicationConfiguration({
    appCode: 'policy-review',
    configBytes: output.config.content,
    expectedConfigDigest: output.config.digest,
    contractBytes: output.contracts.content,
    expectedContractDigest: output.contracts.digest,
  });
  assert.deepEqual(
    platform.requiredPlatformCapabilities,
    requiredPlatformCapabilitiesFromConfiguration(output.config.value)
  );
  assert.ok(
    platform.requiredPlatformCapabilities.some(
      (item) => item.code === 'workflow.instance-cancellation-policy'
    )
  );
  const published = output.config.value.workflows.definitions[0]!.definition;
  assert.deepEqual(
    published.instanceCommands,
    fixture().workflows!.definitions[0]!.definition.instanceCommands
  );
  const validate = new Ajv2020({
    strict: false,
    validateFormats: false,
  }).compile(workflowDefinitionSchema);
  assert.equal(validate(published), true, JSON.stringify(validate.errors));
});

test('both compilers reject bypass declarations before sealing or activation', () => {
  for (const mutate of [
    (source: ReturnType<typeof fixture>) => {
      source.authz!.capabilities = [];
    },
    (source: ReturnType<typeof fixture>) => {
      source.workflows!.definitions[0]!.definition.instanceCommands!.terminate!.capability =
        'app:other-app:cancel';
    },
    (source: ReturnType<typeof fixture>) => {
      source.data!.resources[0]!.fields[0]!.required = false;
    },
    (source: ReturnType<typeof fixture>) => {
      source.workflows!.definitions[0]!.definition.inputSchema.required = [];
    },
  ]) {
    const source = fixture();
    mutate(source);
    assert.throws(
      () => compileApplicationSources(defineOpenXiangdaApp(source)),
      /WORKFLOW_INSTANCE|角色权限|未声明/
    );
  }
  const output = compileApplicationSources(defineOpenXiangdaApp(fixture()));
  const config = structuredClone(output.config.value);
  config.workflows.definitions[0]!.definition.instanceCommands!.terminate!.capability =
    'app:other-app:cancel';
  const contract = {
    ...output.contracts.value,
    configDigest: sha256Digest(config),
  };
  assert.throws(
    () =>
      compileNativeApplicationConfiguration({
        appCode: 'policy-review',
        configBytes: canonicalJson(config),
        expectedConfigDigest: sha256Digest(config),
        contractBytes: canonicalJson(contract),
        expectedContractDigest: sha256Digest(contract),
      }),
    /NATIVE_WORKFLOW_INSTANCE_COMMAND_POLICY_INVALID/
  );
});
