import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ContractValidationError,
  CURRENT_APPLICATION_CONTRACT,
  PLATFORM_CAPABILITY_CONTRACT_VERSIONS,
  DATA_EVENT_TYPES_V2,
  DATA_FIELD_TYPES,
  FIELD_VALUE_SCHEMAS,
  fieldValueSchemaForDefinition,
  DEPLOYMENT_ENVIRONMENTS,
  LOCAL_RUNTIME_MODE,
  OPENXIANGDA_CONTRACT_VERSION,
  PLATFORM_EVENT_CATALOG_V2,
  SCHEMA_VERSIONS,
  STUDIO_CLI_EVENT_SCHEMA_VERSION,
  STUDIO_CLI_EVENT_TYPES,
  STUDIO_CLI_RESULT_SCHEMA_VERSION,
  STUDIO_APPLICATION_AUTHORITY,
  STUDIO_CAPABILITIES_SCHEMA_VERSION,
  STUDIO_PLATFORM_CONTRACT_VERSION,
  STUDIO_SITE_PROFILE_ENDPOINT,
  STUDIO_SITE_PROFILE_SCHEMA_VERSION,
  STUDIO_SITE_PROFILE_UNAVAILABLE_CODES,
  STUDIO_WORKSPACE_BINDING_SCHEMA_VERSION,
  STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION,
  STUDIO_WORKSPACE_PROTOCOL_VERSION,
  WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION,
  WORKFLOW_EVENT_DATA_SCHEMA_V2,
  WORKFLOW_EVENT_TYPES_V2,
  assertAppPackage,
  assertDataResource,
  assertDataTransactionRequest,
  assertAiCapabilityCatalog,
  contractSchemas,
  sha256Digest,
  validateAppPackage,
  validateDataTransactionRequest,
  WORKFLOW_SUMMARY_ENVELOPE_MAX_BYTES,
  WORKFLOW_SUMMARY_MAX_FIELDS,
  WORKFLOW_SUMMARY_TEXT_LONG_MAX_BYTES,
  WORKFLOW_DETAIL_ENVELOPE_MAX_BYTES,
  WORKFLOW_DETAIL_MAX_FIELDS,
  WORKFLOW_DETAIL_MAX_RECORD_PROPERTIES,
  WORKFLOW_DETAIL_MAX_SUBTABLE_ROWS,
  isWorkflowBusinessDataWithinLimit,
  normalizeWorkflowBusinessData,
  normalizeWorkflowBusinessDetail,
  normalizeWorkflowSurface,
  type AppPackage,
  type DataResource,
  type DataTransactionRequest,
  type RelationshipGrant,
  type WorkflowSurface,
  validateAiCapabilityCatalog,
} from '../src/index.js';

test('publishes the bounded Studio workspace and JSONL event contracts', () => {
  assert.equal(
    SCHEMA_VERSIONS.studioCliEvent,
    STUDIO_CLI_EVENT_SCHEMA_VERSION
  );
  assert.equal(
    SCHEMA_VERSIONS.workspaceTemplateBinding,
    WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION
  );
  assert.equal(
    SCHEMA_VERSIONS.studioWorkspaceBinding,
    STUDIO_WORKSPACE_BINDING_SCHEMA_VERSION
  );
  assert.equal(
    SCHEMA_VERSIONS.studioWorkspaceInitialization,
    STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION
  );
  assert.equal(
    contractSchemas.studioCliEvent.properties.schemaVersion.const,
    'openxiangda.cli-event/v1'
  );
  assert.deepEqual(
    contractSchemas.studioCliEvent.properties.type.enum,
    STUDIO_CLI_EVENT_TYPES
  );
  assert.equal(
    contractSchemas.workspaceContext.properties.toolchain.properties.studio
      .properties.schemaVersion.const,
    STUDIO_WORKSPACE_PROTOCOL_VERSION
  );
  assert.equal(
    contractSchemas.workspaceContext.properties.toolchain.properties.studio
      .properties.cliResultSchemaVersion.const,
    STUDIO_CLI_RESULT_SCHEMA_VERSION
  );
  assert.equal(
    contractSchemas.workspaceTemplateBinding.properties.digest.pattern,
    '^sha256:[0-9a-f]{64}$'
  );
  assert.equal(
    contractSchemas.studioWorkspaceBinding.properties.applicationAuthority
      .const,
    STUDIO_APPLICATION_AUTHORITY
  );
  assert.equal(
    contractSchemas.studioWorkspaceBinding.properties.siteBaseUrl.pattern,
    '^https://[^/?#@]+(?:/[^?#]*)?$'
  );
  const sitePattern = new RegExp(
    contractSchemas.studioWorkspaceBinding.properties.siteBaseUrl.pattern
  );
  assert.equal(sitePattern.test('https://site.example/openxiangda'), true);
  assert.equal(sitePattern.test('http://site.example/openxiangda'), false);
  assert.equal(sitePattern.test('https://user:pass@site.example'), false);
  assert.equal(sitePattern.test('https://site.example?token=secret'), false);
  assert.equal(sitePattern.test('https://site.example#fragment'), false);
  assert.equal(
    contractSchemas.studioWorkspaceBinding.properties.projectId.format,
    'uuid'
  );
  assert.equal(
    contractSchemas.studioWorkspaceInitialization.properties.workspace
      .properties.root,
    undefined
  );
});

test('keeps platform v3 closed and publishes standalone Studio discovery', () => {
  const platform = contractSchemas.platformCapabilities;
  assert.equal('dependentRequired' in platform, false);
  assert.equal('studioContractVersion' in platform.properties, false);
  assert.equal('studio' in platform.properties, false);

  const capabilities = contractSchemas.studioCapabilities;
  assert.equal(
    SCHEMA_VERSIONS.studioCapabilities,
    STUDIO_CAPABILITIES_SCHEMA_VERSION
  );
  assert.deepEqual(capabilities.required, [
    'schemaVersion',
    'studioContractVersion',
    'studio',
  ]);
  assert.deepEqual(capabilities.properties.schemaVersion, {
    const: STUDIO_CAPABILITIES_SCHEMA_VERSION,
  });
  assert.deepEqual(capabilities.properties.studioContractVersion, {
    const: STUDIO_PLATFORM_CONTRACT_VERSION,
  });

  const studio = capabilities.properties.studio;
  assert.equal(studio.additionalProperties, false);
  assert.deepEqual(studio.required, [
    'contractVersion',
    'profile',
    'compatibility',
  ]);

  const [available, unavailable] = studio.properties.profile.oneOf;
  assert.equal(
    available.properties.schemaVersion.const,
    STUDIO_SITE_PROFILE_SCHEMA_VERSION
  );
  assert.equal(
    available.properties.endpoint.const,
    STUDIO_SITE_PROFILE_ENDPOINT
  );
  assert.equal(available.properties.status.const, 'available');
  assert.equal(available.additionalProperties, false);
  assert.equal(unavailable.properties.status.const, 'unavailable');
  assert.deepEqual(
    unavailable.properties.unavailableCode.enum,
    STUDIO_SITE_PROFILE_UNAVAILABLE_CODES
  );
  assert.equal(unavailable.additionalProperties, false);
  assert.equal(studio.properties.compatibility.additionalProperties, false);
});

test('publishes one canonical native data field type vocabulary', () => {
  assert.deepEqual(DATA_FIELD_TYPES, [
    'text.short', 'text.long', 'text.rich', 'number.integer',
    'number.decimal', 'boolean', 'date', 'time', 'datetime', 'date-range',
    'datetime-range', 'option.single', 'option.multiple', 'cascade.single',
    'cascade.multiple', 'user.single', 'user.multiple', 'department.single',
    'department.multiple', 'resource-ref.single', 'resource-ref.multiple',
    'image', 'signature', 'address', 'location', 'uuid', 'json', 'file',
    'serial-number', 'subtable',
  ]);
  assert.deepEqual(Object.keys(FIELD_VALUE_SCHEMAS), DATA_FIELD_TYPES);
});

test('requires explicit range boundaries and projects them into value schemas', () => {
  const base = {
    schemaVersion: SCHEMA_VERSIONS.dataResource,
    appCode: 'reference-app',
    code: 'periods',
    name: '时段',
    capabilities: {
      read: 'app:reference-app:data:periods:read',
      create: 'app:reference-app:data:periods:create',
      update: 'app:reference-app:data:periods:update',
      delete: 'app:reference-app:data:periods:delete',
    },
    fieldPolicies: {},
  };
  assert.throws(
    () =>
      assertDataResource({
        ...base,
        schema: { fields: [{ code: 'period', type: 'date-range' }] },
      }),
    ContractValidationError
  );
  assert.doesNotThrow(() =>
    assertDataResource({
      ...base,
      schema: {
        fields: [
          { code: 'period', type: 'date-range', rangeBoundary: 'closed' },
        ],
      },
    })
  );
  assert.equal(
    fieldValueSchemaForDefinition({
      type: 'datetime-range',
      rangeBoundary: 'half-open',
    })['x-openxiangda-range-boundary'],
    'half-open'
  );
  assert.throws(() => fieldValueSchemaForDefinition({ type: 'date-range' }));
});

test('publishes the canonical event v2 catalog and bounded subscription contracts', () => {
  assert.deepEqual(DATA_EVENT_TYPES_V2, [
    'openxiangda.data.record.created.v2',
    'openxiangda.data.record.updated.v2',
    'openxiangda.data.record.deleted.v2',
  ]);
  assert.equal(
    PLATFORM_EVENT_CATALOG_V2.some(
      entry => entry.eventType === 'openxiangda.data.record.date_due.v2'
    ),
    false
  );
  assert.equal(SCHEMA_VERSIONS.cloudEvent, 'openxiangda.cloud-event/v2');
  assert.equal(
    PLATFORM_EVENT_CATALOG_V2.every(entry => entry.maxDataBytes === 65_536),
    true
  );
  assert.equal(
    PLATFORM_EVENT_CATALOG_V2.some(
      entry => entry.eventType === 'openxiangda.workflow.task.approved.v2'
    ),
    true
  );
  const subscription = contractSchemas.eventSubscription;
  assert.equal('subjectFilters' in subscription.properties, false);
  assert.equal(subscription.properties.eventTypes.maxItems, 20);
  assert.equal(subscription.properties.payload.properties.fields.maxItems, 32);
  assert.equal('signingSecret' in subscription.properties, false);
  assert.equal('signingSecretVersion' in subscription.properties, false);
  assert.deepEqual(subscription.properties.delivery.properties.ordering.enum, [
    'none',
    'record',
    'workflow-instance',
  ]);
  assert.equal(
    contractSchemas.eventHandlerManifest.properties.handlers.items.properties
      .maxBodyBytes.const,
    65_536
  );
});

test('publishes strict durable business process wire contracts', () => {
  assert.equal(
    SCHEMA_VERSIONS.businessProcessCommit,
    'openxiangda.business-process.commit/v2',
  );
  assert.equal(
    SCHEMA_VERSIONS.processCommandSurface,
    'openxiangda.process-command-surface/v2',
  );
  assert.equal(
    SCHEMA_VERSIONS.businessProcessReceipt,
    'openxiangda.business-process-receipt/v2',
  );
  assert.equal(
    SCHEMA_VERSIONS.businessProcessPoll,
    'openxiangda.business-process-poll/v2',
  );
  for (const key of [
    'businessProcessCommit',
    'standardProcessCommit',
    'businessProcessCommand',
    'processCommandSurface',
    'businessProcessAnswer',
    'businessProcessRetry',
    'businessProcessReceipt',
    'businessProcessPoll',
    'businessProcessCommandList',
  ] as const) {
    assert.equal(contractSchemas[key].additionalProperties, false);
  }
  assert.deepEqual(contractSchemas.businessProcessReceipt.required, [
    'schemaVersion',
    'receiptId',
    'commandId',
    'operationCode',
    'idempotencyKey',
    'requestDigest',
    'command',
    'createdAt',
  ]);
  assert.deepEqual(contractSchemas.businessProcessPoll.required, [
    'schemaVersion',
    'command',
    'changed',
    'terminal',
    'retryable',
    'cursor',
    'nextPoll',
  ]);
  assert.equal(
    contractSchemas.businessProcessPoll.properties.cursor.properties
      .afterRevision.minimum,
    0,
  );
  assert.equal(
    contractSchemas.businessProcessPoll.properties.nextPoll.anyOf[0]
      .properties.retryAfterMs.maximum,
    30000,
  );
  assert.equal(
    contractSchemas.businessProcessCommit.properties.data.properties.operations
      .maxItems,
    16,
  );
  assert.equal(
    contractSchemas.businessProcessAnswer.properties.answers.maxProperties,
    64,
  );
  assert.equal(
    'facts' in contractSchemas.standardProcessCommit.properties,
    false,
  );
  assert.equal(
    'dataRef' in contractSchemas.standardProcessCommit.properties,
    false,
  );
  assert.equal(
    'preparationToken' in contractSchemas.standardProcessCommit.properties,
    false,
  );
});

test('publishes the digest-bound desktop/mobile standard route manifest contract', () => {
  const manifest = contractSchemas.applicationRouteManifest;
  assert.equal(manifest.$id, SCHEMA_VERSIONS.applicationRouteManifest);
  assert.deepEqual(manifest.required, [
    'schemaVersion',
    'appCode',
    'devicePolicy',
    'rootEntry',
    'authentication',
    'routes',
    'digest',
  ]);
  assert.equal(manifest.additionalProperties, false);
  assert.equal(manifest.properties.routes.maxItems, 512);
  const entry = manifest.properties.routes.items;
  assert.equal(entry.additionalProperties, false);
  assert.deepEqual(entry.required, ['code', 'kind', 'desktop', 'mobile']);
  assert.deepEqual(entry.properties.kind.enum, [
    'application-todo-center',
    'workflow-work-center',
    'workflow-launch',
    'workflow-task',
    'workflow-instance',
  ]);
  const desktop = entry.properties.desktop;
  assert.equal(desktop.additionalProperties, false);
  assert.equal(entry.properties.mobile.additionalProperties, false);
  assert.equal(desktop.properties.surface.enum[0], 'admin');
  assert.deepEqual(desktop.properties.requiresAuthentication, { const: true });
  assert.equal(desktop.properties.pathParams.maxItems, 32);
  assert.equal(desktop.properties.pathParams.uniqueItems, true);
  assert.equal('capability' in desktop.properties, true);
  assert.equal('access' in desktop.properties, true);
  assert.equal(
    desktop.not.required.includes('capability') &&
      desktop.not.required.includes('access'),
    true,
  );
});

function fixture(): AppPackage {
  return {
    schemaVersion: SCHEMA_VERSIONS.appPackage,
    appCode: 'reference-app',
    version: '2.0.0-test.1',
    createdAt: '2026-08-10T00:00:00.000Z',
    source: {
      repository: 'https://example.invalid/reference-app.git',
      commit: '0123456789abcdef',
      dirty: false,
    },
    toolchain: {
      version: '2.0.0-alpha.1',
      contractVersion: OPENXIANGDA_CONTRACT_VERSION,
    },
    artifacts: [
      {
        kind: 'config',
        digest: 'a'.repeat(64),
        mediaType: 'application/vnd.openxiangda.config.v2+json',
        size: 128,
      },
    ],
    manifests: { config: 'a'.repeat(64) },
    compatibility: {
      minimumPlatformVersion: '2.0.0-alpha.1',
      requiredPlatformCapabilities: [
        {
          code: 'deployment.durable-runs',
          contractVersion:
            PLATFORM_CAPABILITY_CONTRACT_VERSIONS['deployment.durable-runs'],
          usageDigest: `sha256:${'b'.repeat(64)}`,
        },
      ],
      applicationContract: { ...CURRENT_APPLICATION_CONTRACT },
    },
  };
}

test('exports every frozen M0 JSON Schema', () => {
  assert.deepEqual(
    Object.values(contractSchemas)
      .map(schema => schema.$id)
      .sort(),
    Object.values(SCHEMA_VERSIONS).sort()
  );
});

test('publishes the non-secret developer CLI backend image build target', () => {
  const build =
    contractSchemas.platformCapabilities.properties.deployment.properties
      .backendImageBuild;
  assert.deepEqual(build.required, [
    'owner',
    'available',
    'repositoryPrefix',
    'platform',
  ]);
  assert.deepEqual(build.properties.owner, { const: 'developer-cli' });
  assert.deepEqual(build.properties.repositoryPrefix, {
    type: ['string', 'null'],
  });
  assert.deepEqual(build.properties.platform, { const: 'linux/amd64' });
});

test('publishes one bounded atomic application contract compatibility tuple', () => {
  assert.deepEqual(
    fixture().compatibility.applicationContract,
    CURRENT_APPLICATION_CONTRACT
  );
  const accepted =
    contractSchemas.platformCapabilities.properties.configurationCompatibility
      .properties.supportedApplicationContracts;
  assert.equal(accepted.minItems, 1);
  assert.equal(accepted.maxItems, 8);
  assert.equal(accepted.uniqueItems, true);
  assert.deepEqual(accepted.items.required, [
    'appPackageSchemaVersion',
    'configurationBundleSchemaVersion',
    'contractBundleSchemaVersion',
    'compilerContractVersion',
  ]);
  assert.ok(
    contractSchemas.appPackage.properties.compatibility.required.includes(
      'applicationContract'
    )
  );
  assert.ok(
    contractSchemas.appPackage.properties.compatibility.required.includes(
      'requiredPlatformCapabilities'
    )
  );
  assert.equal(
    'requiredCapabilities' in
      contractSchemas.appPackage.properties.compatibility.properties,
    false
  );
  assert.deepEqual(
    contractSchemas.appPackage.properties.compatibility.properties
      .requiredPlatformCapabilities.items.required,
    ['code', 'contractVersion', 'usageDigest']
  );
  const featureContract =
    contractSchemas.platformCapabilities.properties.features
      .additionalProperties;
  assert.deepEqual(featureContract.required, ['contractVersion', 'status']);
  assert.equal('version' in featureContract.properties, false);
  assert.equal(
    contractSchemas.platformCapabilities.properties.configurationCompatibility
      .properties.capability.properties.code.const,
    'configuration.compatibility-preflight'
  );
  assert.equal(
    contractSchemas.configurationValidationRequest.properties.configuration
      .properties.canonical.maxLength,
    4 * 1024 * 1024
  );
  assert.equal(
    contractSchemas.configurationValidationRequest.properties.contract
      .properties.canonical.maxLength,
    8 * 1024 * 1024
  );
  assert.deepEqual(
    contractSchemas.platformCapabilities.properties.configurationCompatibility
      .properties.limits.properties,
    {
      configurationCanonicalBytes: { const: 4 * 1024 * 1024 },
      contractCanonicalBytes: { const: 8 * 1024 * 1024 },
      requestBytes: { const: 10 * 1024 * 1024 },
    }
  );
});

test('publishes bounded authoritative directory and scope selector contracts', () => {
  assert.deepEqual(contractSchemas.directoryEntryPage.required, [
    'schemaVersion',
    'kind',
    'items',
    'nextCursor',
  ]);
  assert.equal(
    contractSchemas.directoryEntryPage.properties.items.items.required.includes(
      'selectable'
    ),
    true
  );
  assert.equal(
    contractSchemas.directoryEntryPage.properties.items.items.required.includes(
      'snapshot'
    ),
    true
  );
  assert.equal(
    contractSchemas.directoryEntryPage.properties.items.items.properties.snapshot.anyOf.length,
    2
  );
  assert.equal(
    contractSchemas.nativeScopeValueResolveRequest.properties.values.maxItems,
    50
  );
  assert.equal(
    contractSchemas.nativeScopeValueResolveRequest.properties.values.uniqueItems,
    true
  );
  assert.deepEqual(
    contractSchemas.nativeScopeValuePage.properties.operation.enum,
    ['create', 'update']
  );
  assert.deepEqual(
    contractSchemas.nativeScopeValuePage.properties.environment.properties.key,
    { enum: DEPLOYMENT_ENVIRONMENTS }
  );
  assert.equal(
    contractSchemas.dataFieldSourceQuery.properties.bindings.maxProperties,
    20
  );
  assert.equal(
    contractSchemas.dataFieldSourcePage.properties.items.maxItems,
    100
  );
  assert.deepEqual(
    contractSchemas.dataFieldSourcePage.properties.items.items.required,
    ['label', 'value', 'resourceCode']
  );

  const scopeDimension =
    contractSchemas.configurationBundle.properties.authz.properties
      .scopeDimensions.items;
  assert.equal(scopeDimension.additionalProperties, false);
  assert.deepEqual(scopeDimension.properties.valueSource.required, [
    'kind',
    'resourceCode',
    'labelField',
  ]);
  assert.deepEqual(scopeDimension.allOf[0].then.properties.valueType, {
    const: 'uuid',
  });
  const scopeSource =
    contractSchemas.configurationBundle.properties.authz.properties.scopeSources
      .items;
  const semanticPathPattern = new RegExp(
    scopeSource.properties.grants.items.properties.valueField.pattern
  );
  assert.equal(semanticPathPattern.test('college.value'), true);
  assert.equal(semanticPathPattern.test('college.snapshot.code'), true);
  assert.equal(semanticPathPattern.test('college.unknown'), false);
  const membershipSource =
    contractSchemas.configurationBundle.properties.authz.properties
      .roleMembershipSources.items;
  const relationshipSource =
    contractSchemas.configurationBundle.properties.authz.properties
      .relationshipGrantSources.items;
  assert.equal(membershipSource.additionalProperties, false);
  assert.equal(membershipSource.properties.failureMode.const, 'strict');
  assert.equal(relationshipSource.additionalProperties, false);
  assert.equal(relationshipSource.properties.operations.maxItems, 20);
  assert.equal(
    relationshipSource.properties.subject.oneOf[1].additionalProperties,
    false
  );
  const dataPolicy =
    contractSchemas.configurationBundle.properties.authz.properties.dataPolicies
      .items;
  assert.equal(dataPolicy.required.includes('resourceCode'), true);
  assert.equal(dataPolicy.required.includes('matchMode'), true);
  assert.equal(dataPolicy.required.includes('rules'), true);
  assert.equal(
    dataPolicy.properties.readExpression.$ref,
    '#/$defs/appDataPolicyExpression'
  );
  assert.equal(
    contractSchemas.configurationBundle.$defs.appDataPolicyExpression.oneOf
      .length,
    3
  );
  assert.equal(dataPolicy.properties.writeBoundary.const, 'capability_only');
  assert.deepEqual(dataPolicy.allOf[1], {
    not: { required: ['operations', 'readExpression'] },
  });

  const authorizationTransition =
    contractSchemas.configurationBundle.properties.authz.properties
      .authorizationTransitions.items;
  assert.equal(authorizationTransition.additionalProperties, false);
  assert.deepEqual(authorizationTransition.required, [
    'fromAuthzDigest',
    'reason',
  ]);
  assert.deepEqual(Object.keys(authorizationTransition.properties).sort(), [
    'fromAuthzDigest',
    'reason',
    'removeCapabilityCodes',
    'removeRoleCodes',
  ]);
  assert.equal(
    authorizationTransition.properties.removeRoleCodes.uniqueItems,
    true
  );
  assert.equal(
    authorizationTransition.properties.removeCapabilityCodes.maxItems,
    2000
  );
});

test('contains no legacy workflow or migration compatibility surface', () => {
  assert.equal('workflowCompatibilityReport' in SCHEMA_VERSIONS, false);
  assert.equal('workflowKernelDescriptor' in SCHEMA_VERSIONS, false);
  assert.equal('workflowKernelWorkCenter' in contractSchemas, false);
  assert.equal(
    contractSchemas.workflowInstance.required.includes(
      'initiatorAuthorizationDigest'
    ),
    true
  );
  assert.equal(
    contractSchemas.workflowInstance.required.includes(
      'initiatorRoleSubjectKey'
    ),
    false
  );
  assert.deepEqual(contractSchemas.appPackage.properties.artifacts.items.properties.kind.enum, [
    'frontend',
    'backend',
    'config',
    'contracts',
  ]);
});

test('publishes exact Native runtime lease and active Secret result contracts', () => {
  assert.equal(
    contractSchemas.runtimeLeaseResult.$id,
    SCHEMA_VERSIONS.runtimeLeaseResult
  );
  assert.equal(
    contractSchemas.runtimeSecretValues.$id,
    SCHEMA_VERSIONS.runtimeSecretValues
  );
  assert.equal(
    contractSchemas.runtimeLeaseResult.properties.target,
    contractSchemas.runtimeSecretValues.properties.target
  );
  assert.equal(
    contractSchemas.runtimeSecretValues.properties.items.maxItems,
    64
  );
});

test('publishes current-user Workflow facts with participant ordering', () => {
  assert.equal(
    WORKFLOW_EVENT_TYPES_V2.includes('openxiangda.workflow.instance.cc_added.v2'),
    true
  );
  assert.equal(
    WORKFLOW_EVENT_TYPES_V2.includes(
      'openxiangda.workflow.participant.activated.v2'
    ),
    true
  );
  assert.deepEqual(WORKFLOW_EVENT_DATA_SCHEMA_V2.required, [
    'workflowCode',
    'definitionVersion',
    'bindingVersion',
    'instanceId',
    'generation',
    'businessKey',
    'instanceSequence',
    'revision',
    'dataRef',
    'dataRevision',
    'actor',
    'cause',
  ]);
  assert.equal(WORKFLOW_EVENT_DATA_SCHEMA_V2.maxProperties, 48);
  const participant = PLATFORM_EVENT_CATALOG_V2.find(
    item => item.eventType === 'openxiangda.workflow.participant.cancelled.v2'
  );
  assert.equal(
    participant?.subjectPattern,
    '/workflow-instances/{instanceId}/tasks/{taskId}/participants/{participantId}'
  );
});

test('publishes the native-4 configuration and contract bundle schemas', () => {
  assert.equal(
    contractSchemas.configurationBundle.properties.compilerContractVersion.const,
    'native-4'
  );
  assert.equal(
    contractSchemas.contractBundle.properties.compilerContractVersion.const,
    'native-4'
  );
  assert.deepEqual(
    contractSchemas.configurationBundle.properties.runtime.properties.health
      .properties,
    {
      livePath: { const: '/__platform/health' },
      readyPath: { const: '/__platform/ready' },
      versionPath: { const: '/__platform/version' },
    }
  );
  const routeSchema =
    contractSchemas.configurationBundle.properties.frontend.properties.routes
      .items;
  assert.deepEqual(routeSchema.not, {
    required: ['capability', 'access'],
  });
  assert.deepEqual(routeSchema.properties.access.anyOf, [
    { required: ['allOf'] },
    { required: ['anyOf'] },
  ]);
  assert.equal(routeSchema.properties.access.properties.allOf.minItems, 1);
  assert.equal(routeSchema.properties.access.properties.anyOf.uniqueItems, true);
  assert.deepEqual(routeSchema.properties.tabPersistence.enum, [
    'session',
    'none',
  ]);
  assert.deepEqual(routeSchema.properties.keepAlive.enum, ['none', 'memory']);
  const contractRouteSchema = contractSchemas.contractBundle.properties.routes.items;
  assert.equal(contractRouteSchema.required.includes('tabPersistence'), true);
  assert.equal(contractRouteSchema.required.includes('keepAlive'), true);
});

test('publishes explicit Native RoleSubject-bound workflow participants', () => {
  const task = contractSchemas.workflowTask;
  assert.equal(task.required.includes('participants'), true);
  assert.equal(task.required.includes('activeParticipantId'), true);
  assert.equal(task.required.includes('assignedRoleSubjectKey'), true);
  assert.equal(
    task.properties.participants.items.required.includes('roleSubjectKey'),
    true
  );
  assert.equal(
    task.properties.participants.items.required.includes('roleSubjectRevision'),
    true
  );
  assert.deepEqual(task.properties.participants.items.properties.kind.enum, [
    'primary',
    'add_sign',
    'transfer',
    'delegate',
  ]);
  assert.equal(
    task.properties.participants.items.required.includes('delegationId'),
    true
  );
  assert.deepEqual(
    task.properties.participants.items.properties.delegationId,
    { type: ['string', 'null'] }
  );
});

test('publishes platform-resolved workflow detail navigation', () => {
  const surface = contractSchemas.workflowSurface;
  assert.equal(surface.required.includes('detailNavigation'), true);
  assert.equal(surface.required.includes('instanceSequence'), true);
  assert.equal(surface.required.includes('navigationTarget'), true);
  assert.equal(surface.required.includes('commandToken'), true);
  assert.equal(surface.required.includes('commandTokenExpiresAt'), true);
  assert.deepEqual(surface.properties.detailNavigation.required, [
    'custom',
    'desktopPath',
    'mobilePath',
  ]);
  assert.equal(
    surface.properties.detailNavigation.properties.desktopPath.maxLength,
    512
  );
  assert.equal(
    surface.properties.detailNavigation.properties.mobilePath.maxLength,
    512
  );
});

test('bounds and normalizes the workflow business summary envelope', () => {
  const businessData = contractSchemas.workflowBusinessData;
  assert.equal(businessData.properties.fields.maxProperties, WORKFLOW_SUMMARY_MAX_FIELDS);
  assert.equal(
    businessData['x-openxiangda-max-bytes'],
    WORKFLOW_SUMMARY_ENVELOPE_MAX_BYTES,
  );
  assert.equal(
    businessData['x-openxiangda-text-long-max-bytes'],
    WORKFLOW_SUMMARY_TEXT_LONG_MAX_BYTES,
  );
  assert.deepEqual(
    contractSchemas.workflowSurface.properties.presentation.required,
    ['businessData', 'businessDetail', 'summary'],
  );
  assert.deepEqual(normalizeWorkflowBusinessData(undefined), {
    status: 'none',
    resourceCode: null,
    recordId: null,
    requestedRevision: null,
    sourceRevision: null,
    fields: {},
    projectionDigest: null,
  });
  const legacySurface = normalizeWorkflowSurface({
    presentation: {},
  } as unknown as WorkflowSurface);
  assert.equal(legacySurface.presentation.businessData.status, 'none');
  assert.equal(legacySurface.presentation.businessDetail.status, 'unavailable');
  assert.equal(legacySurface.presentation.summary.title, '标准审批流程');
  assert.equal(normalizeWorkflowBusinessDetail(undefined).status, 'unavailable');
  const businessDetail = contractSchemas.workflowBusinessDetail;
  assert.equal(
    businessDetail.properties.record.maxProperties,
    WORKFLOW_DETAIL_MAX_RECORD_PROPERTIES,
  );
  assert.equal(
    businessDetail.properties.subtables.maxProperties,
    WORKFLOW_DETAIL_MAX_FIELDS,
  );
  assert.equal(
    businessDetail.properties.subtables.additionalProperties.properties.rows
      .maxItems,
    WORKFLOW_DETAIL_MAX_SUBTABLE_ROWS,
  );
  assert.equal(
    businessDetail['x-openxiangda-max-bytes'],
    WORKFLOW_DETAIL_ENVELOPE_MAX_BYTES,
  );
  assert.equal(
    normalizeWorkflowBusinessDetail({
      status: 'ready',
      resourceCode: 'applications',
      resourceName: '申请',
      recordId: 'record-1',
      requestedRevision: 1,
      sourceRevision: 1,
      surface: {},
      record: {},
      subtables: {
        lines: {
          resourceCode: 'application-lines',
          surface: {},
          rows: Array.from(
            { length: WORKFLOW_DETAIL_MAX_SUBTABLE_ROWS + 1 },
            () => ({}),
          ),
          total: WORKFLOW_DETAIL_MAX_SUBTABLE_ROWS + 1,
        },
      },
      projectionDigest: null,
    }).status,
    'unavailable',
  );
  assert.equal(
    isWorkflowBusinessDataWithinLimit({
      status: 'fresh',
      resourceCode: 'applications',
      recordId: 'record-1',
      requestedRevision: 1,
      sourceRevision: 1,
      fields: { title: 'x'.repeat(WORKFLOW_SUMMARY_ENVELOPE_MAX_BYTES) },
      projectionDigest: null,
    }),
    false,
  );
  assert.equal(
    normalizeWorkflowBusinessData({
      status: 'fresh',
      resourceCode: 'applications',
      recordId: 'record-1',
      requestedRevision: 1,
      sourceRevision: 1,
      fields: {},
      projectionDigest: null,
      extra: true,
    }).status,
    'unavailable',
  );
});

test('publishes the closed fresh workflow command-token request', () => {
  const input = contractSchemas.workflowCommandInput;
  assert.equal(input.$id, 'openxiangda.workflow-command-input/v2');
  assert.equal(input.additionalProperties, false);
  assert.deepEqual(input.required, ['commandToken', 'idempotencyKey']);
  assert.deepEqual(Object.keys(input.properties).sort(), [
    'commandToken',
    'idempotencyKey',
    'input',
  ]);
  assert.equal('expectedTaskVersion' in input.properties, false);
  assert.equal('expectedInstanceVersion' in input.properties, false);
  assert.equal(input.properties.commandToken.pattern, '^[A-Za-z0-9_-]{43}$');
});

test('publishes one revision-consistent Workflow detail aggregate', () => {
  const detail = contractSchemas.workflowDetailSurface;
  assert.equal(
    detail.$id,
    'openxiangda.workflow-detail-surface/v2',
  );
  assert.equal(detail.additionalProperties, false);
  assert.deepEqual(detail.properties.timeline.required, [
    'engineVersion',
    'instanceId',
    'instanceSequence',
    'timelineRevision',
    'flow',
    'items',
    'display',
  ]);
  assert.deepEqual(detail.properties.navigationContext.required, [
    'desktopReturnPath',
    'mobileReturnPath',
  ]);
  assert.equal(
    detail.properties.protocolVersion.const,
    'workflow_detail_surface_v2',
  );
});

test('publishes one revision-bound desktop and mobile workflow launch Surface', () => {
  const surface = contractSchemas.workflowLaunchSurface;
  assert.equal(
    surface.$id,
    'openxiangda.workflow-launch-surface/v3'
  );
  assert.equal(
    surface.properties.protocolVersion.const,
    'workflow_launch_surface_v3',
  );
  assert.deepEqual(surface.properties.launchMode.enum, [
    'standalone',
    'hidden-handoff',
  ]);
  assert.deepEqual(surface.properties.head.required, [
    'workflowRevision',
    'definitionVersion',
    'bindingVersion',
    'nativeRevision',
    'contractRevisionId',
  ]);
  assert.deepEqual(surface.properties.paths.required, ['desktop', 'mobile']);
  assert.equal(surface.properties.commit.properties.idempotencyRequired.const, true);
  assert.equal('prepare' in surface.properties, false);
  assert.equal('start' in surface.properties, false);
  assert.equal(surface.required.includes('processOperationCode'), false);
  assert.equal(surface.required.includes('submission'), true);
  assert.deepEqual(
    surface.properties.submission.oneOf.map(item => item.properties.kind.const),
    ['standard-process', 'named-operation'],
  );
  assert.deepEqual(surface.properties.submission.oneOf[1].anyOf, [
    { required: ['create'] },
    { required: ['existing'] },
  ]);
  assert.equal(surface.required.includes('subject'), true);
});

test('allows workflow bindings to disable long-term delegation explicitly', () => {
  assert.deepEqual(
    contractSchemas.workflowBinding.properties.bindings.additionalProperties
      .properties.delegatable,
    { type: 'boolean' }
  );
});

test('publishes the closed Workflow trust boundary and provider request v2.1', () => {
  const definition = contractSchemas.workflowDefinition;
  assert.deepEqual(definition.properties.inputSchema.required, [
    'type',
    'additionalProperties',
  ]);
  assert.deepEqual(
    definition.properties.inputSchema.properties.additionalProperties,
    { const: false }
  );
  assert.equal(definition.required.includes('subject'), true);
  assert.deepEqual(definition.properties.subject.required, [
    'resourceCode',
    'factProjection',
    'summaryFields',
  ]);
  assert.equal(
    definition.properties.subject.properties.factProjection.minProperties,
    1
  );
  assert.equal(
    definition.properties.subject.properties.factProjection.maxProperties,
    64
  );
  const bindingEntry =
    contractSchemas.workflowBinding.properties.bindings.additionalProperties;
  assert.equal(bindingEntry.properties.min.maximum, 200);
  assert.equal(bindingEntry.properties.max.maximum, 200);

  const preparation = contractSchemas.workflowPreparation;
  assert.equal(preparation.required.includes('dataRevision'), true);
  assert.equal(preparation.required.includes('factDigest'), true);
  assert.equal(preparation.properties.dataRevision.minimum, 1);

  const providerRequest = contractSchemas.workflowAssigneeRequest;
  assert.equal(
    SCHEMA_VERSIONS.workflowAssigneeRequest,
    'openxiangda.workflow-assignee-request/v2.1'
  );
  for (const field of [
    'businessKey',
    'dataRef',
    'dataRevision',
    'definitionVersion',
    'bindingVersion',
    'factDigest',
  ]) {
    assert.equal(providerRequest.required.includes(field), true);
  }
  assert.equal(providerRequest.properties.dataRef.additionalProperties, false);
  assert.deepEqual(providerRequest.properties.dataRef.required, [
    'resourceCode',
    'id',
  ]);
});

test('separates local runtime from the two remote deployment environments', () => {
  assert.deepEqual(DEPLOYMENT_ENVIRONMENTS, ['preproduction', 'production']);
  assert.equal(LOCAL_RUNTIME_MODE, 'local');
  assert.deepEqual(
    contractSchemas.workspaceContext.properties.environments.items.properties.kind,
    { enum: DEPLOYMENT_ENVIRONMENTS }
  );
  assert.deepEqual(contractSchemas.environmentHead.properties.environmentKind, {
    enum: DEPLOYMENT_ENVIRONMENTS,
  });
  assert.deepEqual(
    contractSchemas.applicationEnvironments.properties.items.items.properties
      .runtimeState,
    { enum: ['running', 'stopped'] }
  );
  assert.deepEqual(
    contractSchemas.applicationEnvironments.properties.items.items.properties
      .activeHead.anyOf[1],
    { type: 'null' }
  );
  assert.deepEqual(
    contractSchemas.deploymentRun.properties.environment.properties.kind,
    { enum: DEPLOYMENT_ENVIRONMENTS }
  );
  assert.deepEqual(contractSchemas.deploymentRun.properties.kind.enum, [
    'deploy',
    'promotion',
    'rollback',
    'redeploy',
    'start',
    'stop',
  ]);
});

test('publishes the strict authoritative DeploymentRun attempt ledger', () => {
  const run = contractSchemas.deploymentRun;
  for (const field of [
    'rootFailure',
    'latestFailure',
    'candidate',
    'recovery',
    'attempts',
  ]) {
    assert.equal(run.required.includes(field), true, field);
  }
  assert.equal(run.properties.rootFailure.anyOf[1].type, 'null');
  assert.equal(run.properties.latestFailure.anyOf[1].type, 'null');
  assert.equal(run.properties.candidate.additionalProperties, false);
  assert.equal(run.properties.recovery.additionalProperties, false);
  assert.deepEqual(run.properties.recovery.required, [
    'mode',
    'retryable',
    'replacementAllowed',
    'cancelAllowed',
    'action',
    'expectedAttempt',
    'nextCommand',
  ]);
  assert.equal(run.properties.attempts.items.additionalProperties, false);
  assert.equal(
    run.properties.attempts.items.properties.failure.anyOf[1].type,
    'null'
  );
});

test('publishes bounded batch authorization contracts for field-aware admin pages', () => {
  assert.equal(
    contractSchemas.authorizationBatchRequest.properties.requests.maxItems,
    200
  );
  assert.deepEqual(
    contractSchemas.authorizationBatchResult.properties.items.items.properties
      .decision,
    { $ref: SCHEMA_VERSIONS.authorizationDecision }
  );
});

test('uses one environmentKey identity field across Principal and Workflow', () => {
  assert.ok(contractSchemas.principal.required.includes('environmentKey'));
  assert.equal(
    'environmentId' in contractSchemas.principal.properties,
    false
  );
  assert.ok(
    contractSchemas.workflowDelegation.required.includes('environmentKey')
  );
  assert.deepEqual(contractSchemas.dataRef.properties.environmentKey, {
    type: 'string',
    minLength: 1,
  });
  assert.equal('environmentId' in contractSchemas.dataRef.properties, false);
});

test('publishes only the bounded current-user role union identity', () => {
  assert.deepEqual(contractSchemas.nativePrincipal.properties.subjectKind.enum, [
    'super_admin',
    'role_union',
  ]);
  assert.deepEqual(
    contractSchemas.roleSubjectPage.properties.items.items.properties
      .subjectKind.enum,
    ['membership', 'super_admin', 'workflow_participant']
  );
  assert.equal(contractSchemas.roleSubjectPage.properties.items.maxItems, 50);
  assert.equal(
    contractSchemas.roleSubjectPage.properties.items.items.properties
      .scopeSummary.maxItems,
    8
  );
  assert.equal(
    contractSchemas.roleSubjectPage.properties.items.items.properties
      .scopeSummary.items.properties.previewValues.maxItems,
    3
  );
  assert.equal(
    'scopeGrants' in contractSchemas.nativePrincipal.properties,
    false
  );
});

test('publishes bounded delegated role management contracts', () => {
  assert.equal(
    contractSchemas.nativeAuthorizationManagementCatalog.$id,
    SCHEMA_VERSIONS.nativeAuthorizationManagementCatalog
  );
  assert.equal(
    contractSchemas.nativeRoleManagementGrantPage.properties.items.maxItems,
    100
  );
  assert.deepEqual(
    contractSchemas.nativeRoleManagementGrantPage.properties.items.items
      .properties.actions.items.enum,
    [
      'membership.read',
      'membership.assign',
      'membership.update',
      'membership.revoke',
      'management.delegate',
    ]
  );
  assert.ok(
    contractSchemas.nativeRoleMembershipPage.properties.items.items.required.includes(
      'maintainable'
    )
  );
  assert.equal(
    contractSchemas.nativeAuthorizationMutationReceipt.properties.requestDigest
      .pattern,
    '^[0-9a-f]{64}$'
  );
});

test('accepts the frozen current-user role union gateway principal shape', () => {
  const principal = contractSchemas.nativePrincipal;
  assert.deepEqual(principal.properties.expiresAt.anyOf.at(-1), {
    type: 'null',
  });
  assert.ok(principal.required.includes('roleCodes'));
  assert.ok(principal.required.includes('authorizationDigest'));
  assert.ok(principal.required.includes('displayName'));
  assert.deepEqual(principal.properties.displayName, {
    type: 'string',
    minLength: 1,
  });
});

test('publishes bounded Native authorization decisions', () => {
  assert.equal(
    contractSchemas.nativeAuthorizationBatchRequest.properties.requests
      .maxItems,
    200
  );
  assert.equal(
    contractSchemas.nativeAuthorizationBatchRequest.properties.requests.items
      .properties.data.maxProperties,
    100
  );
  assert.equal(
    contractSchemas.nativeAuthorizationDecision.properties.decisions.maxItems,
    4
  );
  assert.equal(
    'principal' in contractSchemas.nativeAuthorizationDecision.properties,
    false
  );
  assert.deepEqual(
    contractSchemas.nativeAuthorizationBatchResult.properties.items.items
      .properties.decision,
    { $ref: SCHEMA_VERSIONS.nativeAuthorizationDecision }
  );
});

test('accepts and deterministically hashes a valid AppPackage', () => {
  const value = fixture();
  assert.doesNotThrow(() => assertAppPackage(value));
  assert.equal(validateAppPackage(value).length, 0);
  assert.equal(
    sha256Digest(value),
    '7175cac0a2cb8cf152879af9c18d6e27efc65810528d59bb2e4db260a5fcb0cd'
  );
  assert.equal(
    sha256Digest({ b: 2, a: 1 }),
    sha256Digest({ a: 1, b: 2 })
  );
});

test('returns stable diagnostics and rejects an incompatible package', () => {
  const value = fixture() as AppPackage & {
    toolchain: { version: string; contractVersion: string };
  };
  value.toolchain.contractVersion = '1.0.0';
  value.artifacts[0]!.digest = 'not-a-digest';

  const diagnostics = validateAppPackage(value);
  assert.deepEqual(
    diagnostics.map(item => item.code),
    [
      'APP_PACKAGE_CONTRACT_VERSION_MISMATCH',
      'APP_PACKAGE_DIGEST_INVALID',
    ]
  );
  assert.throws(() => assertAppPackage(value), ContractValidationError);
});

test('rejects the deleted string capability shape without an alias', () => {
  const value = fixture() as unknown as Record<string, any>;
  value.compatibility.requiredCapabilities = ['deployment.durable-runs'];
  delete value.compatibility.requiredPlatformCapabilities;

  assert.deepEqual(
    validateAppPackage(value)
      .map(item => item.code)
      .filter(code => code.includes('CAPABILIT')),
    [
      'APP_PACKAGE_CAPABILITIES_LEGACY_SHAPE_UNSUPPORTED',
      'APP_PACKAGE_PLATFORM_CAPABILITIES_REQUIRED',
    ]
  );
  assert.throws(() => assertAppPackage(value), ContractValidationError);
});

test('rejects hand-edited platform capability contracts and usage digests', () => {
  const value = fixture();
  value.compatibility.requiredPlatformCapabilities[0] = {
    code: 'deployment.durable-runs',
    contractVersion: '0.0.0',
    usageDigest: 'sha256:not-a-digest',
  };

  assert.deepEqual(
    validateAppPackage(value)
      .map(item => item.code)
      .filter(code => code.includes('PLATFORM_CAPABILITY')),
    [
      'APP_PACKAGE_PLATFORM_CAPABILITY_CONTRACT_UNSUPPORTED',
      'APP_PACKAGE_PLATFORM_CAPABILITY_USAGE_DIGEST_INVALID',
    ]
  );
});

test('accepts only canonical resources and operation-specific field policies', () => {
  const dataResource: DataResource = {
    schemaVersion: SCHEMA_VERSIONS.dataResource,
    appCode: 'reference-app',
    code: 'instruments',
    name: '仪器',
    schema: {
      fields: [
        { code: 'name', type: 'text.short', nullable: false, indexed: true },
        { code: 'capacity', type: 'number.integer', min: 0, max: 1000 },
        { code: 'occupied', type: 'number.integer', min: 0, max: 1000 },
        { code: 'college_id', type: 'uuid' },
        {
          code: 'attachments',
          type: 'file',
          file: { maxCount: 5, maxSizeMb: 50 },
        },
      ],
    },
    invariants: [
      {
        code: 'capacity-not-exceeded',
        message: 'Capacity must cover occupied seats',
        expression: {
          leftField: 'capacity',
          operator: 'gte',
          rightField: 'occupied',
        },
      },
    ],
    capabilities: {
      read: 'app:reference-app:data:instruments:read',
      create: 'app:reference-app:data:instruments:create',
      update: 'app:reference-app:data:instruments:update',
      delete: 'app:reference-app:data:instruments:delete',
    },
    dataPolicyCode: 'college_scope',
    fieldPolicies: {},
  };
  assert.doesNotThrow(() => assertDataResource(dataResource));
  assert.throws(
    () =>
      assertDataResource({
        ...dataResource,
        schema: {
          fields: dataResource.schema.fields.map(field =>
            field.code === 'capacity' ? { ...field, min: 100, max: 10 } : field
          ),
        },
      }),
    ContractValidationError
  );
  assert.throws(
    () =>
      assertDataResource({
        ...dataResource,
        invariants: [
          {
            code: 'unknown-field',
            expression: {
              leftField: 'missing',
              operator: 'gte',
              rightField: 'occupied',
            },
          },
        ],
      }),
    ContractValidationError
  );
  assert.throws(
    () => assertDataResource({ ...dataResource, code: 'course_selections' }),
    ContractValidationError
  );
  assert.throws(
    () =>
      assertDataResource({
        ...dataResource,
        fieldPolicies: { name: { write: ['legacy'] } },
      } as unknown as DataResource),
    ContractValidationError
  );
  dataResource.schema.fields.push({ code: 'tenant_id', type: 'text.short' });
  assert.throws(() => assertDataResource(dataResource), ContractValidationError);
});

test('requires semantic snapshot fields to declare one authoritative source', () => {
  const base = {
    schemaVersion: SCHEMA_VERSIONS.dataResource,
    appCode: 'reference-app',
    code: 'appointments',
    name: '预约',
    capabilities: {
      read: 'app:reference-app:data:appointments:read',
      create: 'app:reference-app:data:appointments:create',
      update: 'app:reference-app:data:appointments:update',
      delete: 'app:reference-app:data:appointments:delete',
    },
    fieldPolicies: {},
  };
  assert.doesNotThrow(() =>
    assertDataResource({
      ...base,
      schema: {
        fields: [
          {
            code: 'owner',
            type: 'user.single',
          },
          {
            code: 'department',
            type: 'department.single',
          },
          {
            code: 'participants',
            type: 'user.multiple',
          },
          {
            code: 'customer',
            type: 'resource-ref.single',
            source: {
              kind: 'resource',
              resourceCode: 'customers',
              labelField: 'name',
              snapshotFields: ['code', 'level'],
            },
          },
          {
            code: 'status',
            type: 'option.single',
            options: [{ label: '草稿', value: 'draft' }],
          },
        ],
      },
    })
  );
  assert.throws(
    () =>
      assertDataResource({
        ...base,
        schema: {
          fields: [
            {
              code: 'customer',
              type: 'resource-ref.single',
            },
          ],
        },
      }),
    ContractValidationError
  );
  assert.throws(
    () =>
      assertDataResource({
        ...base,
        schema: {
          fields: [
            {
              code: 'participants',
              type: 'user.multiple',
              nullable: true,
            },
          ],
        },
      }),
    ContractValidationError
  );
});

test('publishes bounded aggregate, audit and managed file contracts', () => {
  assert.equal(contractSchemas.dataAggregateQuery.properties.dimensions.maxItems, 3);
  assert.equal(contractSchemas.dataAggregateQuery.properties.measures.maxItems, 8);
  assert.equal(contractSchemas.dataAggregateQuery.properties.limit.maximum, 100);
  assert.equal(
    contractSchemas.dataExportRequest.$id,
    SCHEMA_VERSIONS.dataExportRequest
  );
  assert.equal(
    'limit' in contractSchemas.dataExportRequest.properties,
    false
  );
  assert.equal(contractSchemas.dataAuditPage.$id, SCHEMA_VERSIONS.dataAuditPage);
  const auditEntry = contractSchemas.dataAuditPage.properties.items.items;
  assert.equal(contractSchemas.dataAuditPage.properties.items.maxItems, 100);
  assert.deepEqual(auditEntry.required, [
    'id',
    'operation',
    'recordId',
    'revision',
    'actor',
    'correlation',
    'changes',
    'projection',
    'occurredAt',
  ]);
  assert.deepEqual(auditEntry.properties.actor.required, [
    'principalType',
    'subjectId',
  ]);
  assert.equal(
    auditEntry.properties.changes.additionalProperties.properties.before !== undefined,
    true
  );
  assert.equal(
    auditEntry.properties.changes.additionalProperties.properties.after !== undefined,
    true
  );
  assert.equal(auditEntry.properties.changes.maxProperties, 32);
  assert.equal(auditEntry.properties.projection.maxProperties, 32);
  assert.equal('before' in auditEntry.properties, false);
  assert.equal('record' in auditEntry.properties, false);
  assert.equal(contractSchemas.dataFileUploadPlan.properties.uploadMethod.const, 'PUT');
  assert.equal(
    contractSchemas.dataFilePreview.properties.schemaVersion.const,
    SCHEMA_VERSIONS.dataFilePreview
  );
  assert.deepEqual(
    contractSchemas.dataFilePreview.properties.previewProvider.enum,
    ['browser', 'platform', 'none']
  );
});

test('publishes a discriminated, bounded Native batch read contract', () => {
  const request = contractSchemas.dataBatchQuery;
  const operation = request.properties.operations.items;
  assert.equal(operation.oneOf.length, 2);
  assert.deepEqual(operation.oneOf.map(item => item.required), [
    ['key', 'resourceCode', 'query'],
    ['key', 'resourceCode', 'aggregate'],
  ]);
  assert.equal(request.properties.operations.maxItems, 16);

  const success = contractSchemas.dataBatchQueryResult.properties.results.items.oneOf[0];
  assert.deepEqual(success.properties.data.oneOf, [
    { $ref: SCHEMA_VERSIONS.dataPage },
    { $ref: SCHEMA_VERSIONS.dataAggregatePage },
  ]);
});

test('publishes the role-bound RelationshipGrant contract', () => {
  const grant: RelationshipGrant = {
    schemaVersion: SCHEMA_VERSIONS.relationshipGrant,
    id: 'grant-1',
    tenantId: 'tenant-1',
    appCode: 'reference-app',
    relationCode: 'instrument_manager',
    subjectType: 'role_assignment',
    subjectKey: 'assignment-instrument',
    resourceCode: 'instrument',
    resourceId: 'instrument-1',
    operations: ['query', 'update'],
    sourceCode: 'manual',
    status: 'active',
    revision: 1,
    validFrom: null,
    validTo: null,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  };

  assert.equal(grant.subjectType, 'role_assignment');
  assert.equal(contractSchemas.relationshipGrant.$id, grant.schemaVersion);
});

test('transaction contract allows only bounded declared resource mutations', () => {
  const transaction: DataTransactionRequest = {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey: 'reserve-instrument-1',
    guards: [
      {
        kind: 'query-empty',
        resourceCode: 'reservations',
        lockKey: 'instrument:instrument-1',
        errorCode: 'OPENXIANGDA_RESERVATION_CONFLICT',
        where: {
          field: 'instrument_id',
          operator: 'eq',
          value: 'instrument-1',
        },
      },
    ],
    operations: [
      {
        operation: 'create',
        resourceCode: 'reservations',
        data: { instrument_id: 'instrument-1' },
      },
    ],
  };
  assert.doesNotThrow(() => assertDataTransactionRequest(transaction));
  assert.equal(contractSchemas.dataTransactionRequest.properties.guards.maxItems, 20);
  assert.throws(
    () =>
      assertDataTransactionRequest({
        ...transaction,
        operations: [
          {
            operation: 'create',
            resourceCode: 'reservations',
            data: {},
            sql: 'truncate table apps',
          },
        ],
      }),
    ContractValidationError
  );
  assert.throws(
    () =>
      assertDataTransactionRequest({
        ...transaction,
        guards: [
          {
            kind: 'query-empty',
            resourceCode: 'reservations',
            lockKey: 'instrument:instrument-1',
            errorCode: 'OPENXIANGDA_RESERVATION_CONFLICT',
            where: { and: [] },
            table: 'app_data.reservations',
          },
        ],
      }),
    ContractValidationError
  );
});

test('transaction contract requires locked record assertions for bounded increments', () => {
  const transaction: DataTransactionRequest = {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey: 'course-selection-1',
    guards: [
      {
        kind: 'record-assert',
        resourceCode: 'courses',
        lockKey: 'course:1',
        errorCode: 'OPENXIANGDA_CAPACITY_EXCEEDED',
        id: 'course-1',
        assertions: [
          {
            kind: 'field',
            leftField: 'enrolledCount',
            operator: 'lt',
            rightField: 'capacity',
          },
        ],
      },
    ],
    operations: [
      {
        operation: 'increment',
        resourceCode: 'courses',
        id: 'course-1',
        field: 'enrolledCount',
        amount: 1,
      },
    ],
  };
  assert.doesNotThrow(() => assertDataTransactionRequest(transaction));
  assert.throws(
    () => assertDataTransactionRequest({ ...transaction, guards: [] }),
    ContractValidationError
  );
  assert.throws(
    () => assertDataTransactionRequest({
      ...transaction,
      guards: [{
        ...(transaction.guards || [])[0],
        errorCode: 'CAPACITY_EXCEEDED',
      }],
    }),
    ContractValidationError
  );
  assert.throws(
    () => assertDataTransactionRequest({
      ...transaction,
      operations: [{
        ...(transaction.operations || [])[0],
        amount: 0,
      }],
    }),
    ContractValidationError
  );
  assert.equal(
    validateDataTransactionRequest({
      ...transaction,
      operations: [
        {
          operation: 'create',
          resourceCode: 'course_selections',
          data: { courseId: 'course-1' },
        },
      ],
    }).some(
      item => item.code === 'DATA_TRANSACTION_RECORD_ASSERT_MUTATION_REQUIRED'
    ),
    true
  );
  assert.equal(
    validateDataTransactionRequest({
      ...transaction,
      operations: [
        ...(transaction.operations || []),
        {
          operation: 'update',
          resourceCode: 'courses',
          id: 'course-1',
          expectedRevision: 1,
          data: { status: 'open' },
        },
      ],
    }).some(
      item => item.code === 'DATA_TRANSACTION_RECORD_ASSERT_MUTATION_REQUIRED'
    ),
    true
  );
});

test('transaction contract supports read-only record guards across resources', () => {
  const transaction: DataTransactionRequest = {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey: 'reservation-policy-1',
    guards: [
      {
        kind: 'record-exists',
        resourceCode: 'reservation-policies',
        lockKey: 'reservation-policy:policy-1',
        errorCode: 'OPENXIANGDA_RESERVATION_POLICY_REQUIRED',
        id: 'policy-1',
      },
      {
        kind: 'record-match',
        resourceCode: 'reservation-policies',
        lockKey: 'reservation-policy:policy-1',
        errorCode: 'OPENXIANGDA_RESERVATION_POLICY_INACTIVE',
        id: 'policy-1',
        assertions: [
          { kind: 'value', field: 'status', operator: 'eq', value: 'active' },
          {
            kind: 'field',
            leftField: 'occupied',
            operator: 'lte',
            rightField: 'capacity',
          },
        ],
      },
    ],
    operations: [
      {
        operation: 'create',
        resourceCode: 'reservations',
        data: { policyId: 'policy-1' },
      },
    ],
  };

  assert.doesNotThrow(() => assertDataTransactionRequest(transaction));
  assert.equal(
    validateDataTransactionRequest(transaction).some(
      item => item.code === 'DATA_TRANSACTION_RECORD_ASSERT_MUTATION_REQUIRED'
    ),
    false
  );

  assert.throws(
    () =>
      assertDataTransactionRequest({
        ...transaction,
        guards: [
          {
            ...(transaction.guards || [])[0],
            assertions: [
              { kind: 'value', field: 'status', operator: 'eq', value: 'active' },
            ],
          },
        ],
      }),
    ContractValidationError
  );
});

test('transaction contract accepts only bounded database-time assertions', () => {
  const transaction: DataTransactionRequest = {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey: 'publish-window-1',
    guards: [
      {
        kind: 'record-match',
        resourceCode: 'articles',
        lockKey: 'article:article-1',
        errorCode: 'OPENXIANGDA_ARTICLE_NOT_PUBLISHABLE',
        id: 'article-1',
        assertions: [
          { kind: 'database-now', field: 'publishAt', operator: 'lte' },
          { kind: 'database-now', field: 'expireAt', operator: 'gt' },
        ],
      },
    ],
    operations: [
      {
        operation: 'create',
        resourceCode: 'article-views',
        data: { articleId: 'article-1' },
      },
    ],
  };

  assert.doesNotThrow(() => assertDataTransactionRequest(transaction));
  assert.throws(
    () =>
      assertDataTransactionRequest({
        ...transaction,
        guards: [
          {
            ...(transaction.guards || [])[0],
            assertions: [
              {
                kind: 'database-now',
                field: 'publishAt',
                operator: 'lte',
                value: new Date().toISOString(),
              },
            ],
          },
        ],
      } as DataTransactionRequest),
    ContractValidationError
  );
});

test('operation-time binds bounded guards to literal operation datetimes', () => {
  const guard = { kind: 'operation-time', operationIndex: 0, field: 'startsAt',
    operator: 'gt', offsetMilliseconds: 0, errorCode: 'OPENXIANGDA_NOT_FUTURE' };
  const input = { schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest, idempotencyKey: 'time-1',
    guards: [guard], operations: [{ operation: 'create', resourceCode: 'meetings',
      data: { startsAt: '2026-09-08T10:00:00+08:00' } }] };
  assert.doesNotThrow(() => assertDataTransactionRequest(input));
  for (const delta of [{ operationIndex: -1 }, { operationIndex: 1 }, { operationIndex: 0.5 },
    { offsetMilliseconds: 31622400001 }, { offsetMilliseconds: -31622400001 },
    { offsetMilliseconds: '0' }, { field: 'startsAt.value' }, { value: 'now' }, { operator: 'sql' }]) {
    assert.throws(() => assertDataTransactionRequest({ ...input, guards: [{ ...guard, ...delta }] }), ContractValidationError);
  }
  for (const startsAt of [null, undefined, {}, { operationIndex: 0, field: 'id' },
    'bad', '2026-09-08T10:00:00']) {
    assert.throws(() => assertDataTransactionRequest({ ...input, operations: [{
      ...input.operations[0], data: { startsAt },
    }] }), ContractValidationError);
  }
  for (const operation of ['increment', 'delete', 'emitEvent']) {
    assert.throws(() => assertDataTransactionRequest({ ...input, operations: [{
      ...input.operations[0], operation,
    }] }), ContractValidationError);
  }
  assert.equal(contractSchemas.dataTransactionRequest.properties.guards.items.oneOf.some(
    item => item.properties.kind.const === 'operation-time'), true);
});

test('transaction contract permits only direct references to prior create ids', () => {
  const transaction: DataTransactionRequest = {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey: 'parent-with-children-1',
    operations: [
      {
        operation: 'create',
        resourceCode: 'orders',
        data: { name: 'Order 1' },
      },
      {
        operation: 'create',
        resourceCode: 'order-lines',
        data: {
          order_id: { operationIndex: 0, field: 'id' },
          display_order: 0,
        },
      },
    ],
  };
  assert.doesNotThrow(() => assertDataTransactionRequest(transaction));
  const invalidValues = [
    { operationIndex: 1, field: 'id' },
    { operationIndex: 0, field: 'revision' },
    { operationIndex: -1, field: 'id' },
    { operationIndex: 0, field: 'id', path: 'value' },
  ];
  for (const reference of invalidValues) {
    assert.throws(
      () =>
        assertDataTransactionRequest({
          ...transaction,
          operations: [
            transaction.operations[0],
            {
              ...transaction.operations[1],
              data: { order_id: reference },
            },
          ],
        }),
      ContractValidationError
    );
  }
  assert.throws(
    () =>
      assertDataTransactionRequest({
        ...transaction,
        operations: [
          transaction.operations[0],
          {
            ...transaction.operations[1],
            data: {
              payload: { parent: { operationIndex: 0, field: 'id' } },
            },
          },
        ],
      }),
    ContractValidationError
  );
});

test('transaction contract atomically emits only bounded application events', () => {
  const transaction: DataTransactionRequest = {
    schemaVersion: SCHEMA_VERSIONS.dataTransactionRequest,
    idempotencyKey: 'submit-reservation-1',
    operations: [
      {
        operation: 'create',
        resourceCode: 'reservations',
        data: { status: 'submitted' },
      },
      {
        operation: 'emitEvent',
        eventType: 'reference-app.reservation.submitted.v1',
        subject: '/reservations/pending',
        data: {
          reservationId: { operationIndex: 0, field: 'id' },
        },
      },
    ],
  };
  assert.doesNotThrow(() => assertDataTransactionRequest(transaction));
  assert.equal(
    contractSchemas.dataTransactionRequest.properties.operations.items.oneOf.some(
      operation => operation.properties.operation.const === 'emitEvent'
    ),
    true
  );
  assert.throws(
    () =>
      assertDataTransactionRequest({
        ...transaction,
        operations: [
          {
            operation: 'emitEvent',
            eventType: 'openxiangda.data.record.updated.v2',
            data: {},
          },
        ],
      }),
    ContractValidationError
  );
  const oversized = validateDataTransactionRequest({
    ...transaction,
    operations: [
      {
        operation: 'emitEvent',
        eventType: 'reference-app.reservation.submitted.v1',
        data: { value: 'x'.repeat(65_537) },
      },
    ],
  });
  assert.ok(
    oversized.some(item => item.code === 'DATA_TRANSACTION_EVENT_DATA_TOO_LARGE')
  );
  const tooMany = validateDataTransactionRequest({
    ...transaction,
    operations: Array.from({ length: 21 }, () => ({
      operation: 'emitEvent',
      eventType: 'reference-app.reservation.submitted.v1',
      data: {},
    })),
  });
  assert.ok(
    tooMany.some(item => item.code === 'DATA_TRANSACTION_EMIT_EVENTS_EXCEEDED')
  );
});

test('validates the AI capability catalog execution boundary', () => {
  const catalog = {
    schemaVersion: SCHEMA_VERSIONS.aiCapabilityCatalog,
    appCode: 'reference-app',
    appName: 'Reference App',
    capabilities: [
      {
        code: 'reference-app.instruments.query',
        appCode: 'reference-app',
        name: '仪器查询',
        description: '受权限控制的仪器查询',
        kind: 'generatedCrud',
        operation: 'query',
        resources: ['instruments'],
        inputSchema: { type: 'object', additionalProperties: false },
        outputSchema: { type: 'object' },
        authorization: {
          capabilities: ['app:reference-app:data:instruments:read'],
        },
        risk: 'read',
        confirmation: 'none',
        idempotency: 'none',
        concurrency: 'none',
        limits: { maxRows: 100, timeoutMs: 10000 },
        sideEffects: [],
        generatedFrom: { resourceCode: 'instruments', operation: 'query' },
      },
    ],
  } as const;
  assert.doesNotThrow(() => assertAiCapabilityCatalog(catalog));
  assert.equal(
    validateAiCapabilityCatalog({
      ...catalog,
      capabilities: [
        {
          ...catalog.capabilities[0],
          confirmation: 'none',
          risk: 'write',
        },
      ],
    }).some(item => item.code === 'AI_CAPABILITY_EXECUTION_POLICY_INVALID'),
    true
  );
  const customCatalog = {
    ...catalog,
    capabilities: [
      {
        ...catalog.capabilities[0],
        code: 'reference-app.custom.reservation.enroll',
        kind: 'customAction',
        operation: 'custom',
        risk: 'write',
        confirmation: 'required',
        idempotency: 'required',
        concurrency: 'none',
        generatedFrom: undefined,
        sideEffects: ['创建预约'],
        binding: {
          kind: 'app-api',
          operationCode: 'reservation.enroll',
          method: 'POST',
          path: '/api/reservations/enroll',
        },
      },
    ],
  } as const;
  assert.doesNotThrow(() => assertAiCapabilityCatalog(customCatalog));
  assert.equal(
    validateAiCapabilityCatalog({
      ...customCatalog,
      capabilities: [
        { ...customCatalog.capabilities[0], binding: undefined },
      ],
    }).some(item => item.code === 'AI_CAPABILITY_CUSTOM_BINDING_INVALID'),
    true
  );
});
