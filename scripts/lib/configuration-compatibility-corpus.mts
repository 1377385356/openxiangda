import {
  SCHEMA_VERSIONS,
  type WorkflowBinding,
  type WorkflowDefinition,
} from '../../packages/contracts/src/index.js';
import { compileApplicationSources } from '../../packages/devkit-core/src/compiler/bundle.js';
import { requiredPlatformCapabilitiesFromConfiguration } from '../../packages/devkit-core/src/compiler/package-compiler.js';
import {
  adminNavigationGroup,
  adminResourcePage,
  defineAdminNavigation,
  defineOpenXiangdaApp,
  type OpenXiangdaAppDeclaration,
} from '../../packages/devkit-core/src/compiler/config.js';

const APP_CODE = 'configuration-compatibility-corpus';
const RESOURCE_COUNT = 43;
const SUBMISSION_CAPABILITY =
  `app:${APP_CODE}:workflow:standard-record-approval:submit`;

export function buildConfigurationCompatibilityCorpus() {
  const resources = Array.from({ length: RESOURCE_COUNT }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    return {
      code: `records-${suffix}`,
      name: `Standard records ${suffix}`,
      fields: [
        {
          code: 'name',
          type: 'text.short' as const,
          label: 'Name',
          required: true,
          list: true,
          searchable: true,
          sortable: true,
        },
        index === 0
          ? {
              code: 'status',
              type: 'number.integer' as const,
              label: 'Status',
              required: true,
              min: 0,
              max: 100,
              list: true,
              filter: true,
            }
          : {
              code: 'status',
              type: 'option.single' as const,
              label: 'Status',
              required: true,
              options: [
                { label: 'Enabled', value: 'enabled' },
                { label: 'Disabled', value: 'disabled' },
              ],
              list: true,
              filter: true,
            },
      ],
      list: {
        defaultPageSize: 20,
        defaultSort: { field: 'name', order: 'asc' as const },
      },
      form: { layout: index % 2 === 0 ? ('flat' as const) : ('sections' as const) },
      detail: {
        layout: index % 2 === 0 ? ('sections' as const) : ('flat' as const),
      },
      mobile: { enabled: true },
    };
  });
  const workflow: WorkflowDefinition = {
    schemaVersion: SCHEMA_VERSIONS.workflowDefinition,
    code: 'standard-record-approval',
    title: 'Standard record approval',
    acceptedCommandDeactivationPolicy: 'finish-pinned',
    subject: {
      resourceCode: 'records-01',
      factProjection: { name: 'name', status: 'status' },
    },
    startAt: 'review',
    inputSchema: { type: 'object', additionalProperties: false },
    nodes: {
      review: {
        id: 'review',
        kind: 'approval',
        title: 'Review',
        binding: 'reviewer',
        mode: 'single',
        onApprove: 'approved',
        onReject: 'rejected',
      },
      approved: {
        id: 'approved',
        kind: 'end',
        title: 'Approved',
        outcome: 'approved',
      },
      rejected: {
        id: 'rejected',
        kind: 'end',
        title: 'Rejected',
        outcome: 'rejected',
      },
    },
  };
  const binding: WorkflowBinding = {
    schemaVersion: SCHEMA_VERSIONS.workflowBinding,
    workflowCode: workflow.code,
    bindings: {
      reviewer: { provider: 'app_role', roleCode: 'reviewer' },
    },
  };
  const declaration: OpenXiangdaAppDeclaration = {
    schemaVersion: 3,
    app: { code: APP_CODE, name: 'Configuration compatibility corpus' },
    frontend: {
      root: 'apps/web',
      admin: {
        access: {
          anyOf: [`app:${APP_CODE}:data:records-01:read`],
        },
        navigation: defineAdminNavigation([
          adminNavigationGroup(
            'records-a',
            'Records A',
            resources.slice(0, 15).map(resource =>
              adminResourcePage(resource.code)
            ),
            { icon: 'database' }
          ),
          adminNavigationGroup(
            'records-b',
            'Records B',
            resources.slice(15, 30).map(resource =>
              adminResourcePage(resource.code)
            ),
            { icon: 'database' }
          ),
          adminNavigationGroup(
            'records-c',
            'Records C',
            resources.slice(30).map(resource =>
              adminResourcePage(resource.code)
            ),
            { icon: 'database' }
          ),
        ]),
      },
    },
    backend: {
      root: 'apps/server',
      runtime: 'node',
      framework: 'nestjs',
      operations: [
        {
          code: 'records-01.create-submit',
          method: 'POST',
          path: '/api/records/submit',
          capability: SUBMISSION_CAPABILITY,
          requestSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['idempotencyKey', 'name', 'requestedAt'],
            properties: {
              idempotencyKey: { type: 'string' },
              name: { type: 'string' },
              requestedAt: { type: 'string', format: 'date-time' },
            },
          },
          responseSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'revision'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              revision: { type: 'integer', minimum: 1 },
              processCommand: {
                anyOf: [{ type: 'object' }, { type: 'null' }],
              },
            },
          },
          platformAccess: {
            workflow: { codes: [workflow.code] },
          },
        },
      ],
    },
    platform: { root: 'platform' },
    perspectives: [
      {
        code: 'operations',
        name: 'Operations',
        roleCodes: ['reviewer'],
        default: true,
      },
    ],
    data: { resources },
    authz: {
      capabilities: [
        {
          code: SUBMISSION_CAPABILITY,
          kind: 'backend',
          name: 'Submit standard record approval',
        },
      ],
      roles: [
        {
          code: 'reviewer',
          name: 'Reviewer',
          capabilities: [
            `app:${APP_CODE}:data:records-01:read`,
            SUBMISSION_CAPABILITY,
          ],
        },
      ],
      scopeDimensions: [],
      scopeSources: [],
      dataPolicies: [],
    },
    events: { subscriptions: [] },
    workflows: {
      definitions: [
        {
          version: 1,
          definition: workflow,
          launch: {
            mode: 'standalone',
            submission: {
              kind: 'named-operation',
              create: {
                operationCode: 'records-01.create-submit',
                inputs: {
                  idempotencyKey: { source: 'idempotency-key' },
                  name: { source: 'field', fieldCode: 'name' },
                  requestedAt: { source: 'requested-at' },
                },
                output: {
                  subjectId: 'id',
                  subjectRevision: 'revision',
                  processCommand: 'processCommand',
                },
              },
              context: [{ queryParameter: 'name', fieldCode: 'name' }],
            },
          },
        },
      ],
      bindings: [{ version: 1, binding }],
      activations: [
        {
          workflowCode: workflow.code,
          definitionVersion: 1,
          bindingVersion: 1,
          acceptedCommandDeactivationPolicy: 'finish-pinned',
        },
      ],
    },
  };
  const config = defineOpenXiangdaApp(declaration);
  const generated = compileApplicationSources(
    config,
    'openxiangda-compatibility-corpus/v1'
  );
  const firstResource = generated.config.value.data.resources[0];
  const boundedField = firstResource?.schema.fields.find(
    field => field.code === 'status'
  );
  if (
    firstResource?.surface?.mutationOwner !== 'native' ||
    JSON.stringify(firstResource.surface.generated) !==
      JSON.stringify({
        list: true,
        detail: true,
        create: true,
        update: true,
        delete: true,
      }) ||
    boundedField?.min !== 0 ||
    boundedField?.max !== 100
  ) {
    throw new Error(
      'OPENXIANGDA_CONFIGURATION_COMPATIBILITY_CORPUS_RESOURCE_CONTRACT_DRIFT'
    );
  }
  const counts = {
    resources: generated.config.value.data.resources.length,
    perspectives: generated.config.value.perspectives.length,
    eventProducers: generated.contracts.value.eventProducers.length,
    workflowDefinitions: generated.config.value.workflows.definitions.length,
    adminPages: generated.contracts.value.adminPages.length,
    adminNavigationItems: generated.contracts.value.adminNavigation.reduce(
      (total, group) => total + group.items.length,
      0
    ),
  };
  if (
    counts.resources !== 43 ||
    counts.perspectives !== 1 ||
    counts.eventProducers !== 162 ||
    counts.workflowDefinitions !== 1 ||
    counts.adminPages !== 172 ||
    counts.adminNavigationItems !== 43
  ) {
    throw new Error(
      `OPENXIANGDA_CONFIGURATION_COMPATIBILITY_CORPUS_DRIFT: ${JSON.stringify(
        counts
      )}`
    );
  }
  return {
    schemaVersion: 'openxiangda.configuration-compatibility-corpus/v1',
    appCode: APP_CODE,
    counts,
    requiredPlatformCapabilities:
      requiredPlatformCapabilitiesFromConfiguration(generated.config.value),
    configuration: {
      schemaVersion: generated.config.value.schemaVersion,
      digest: generated.config.digest,
      canonical: generated.config.content,
    },
    contract: {
      schemaVersion: generated.contracts.value.schemaVersion,
      digest: generated.contracts.digest,
      canonical: generated.contracts.content,
    },
  };
}
