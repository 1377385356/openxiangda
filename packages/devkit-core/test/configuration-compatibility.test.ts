import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  CONFIGURATION_COMPATIBILITY_CAPABILITY,
  contractSchemas,
  type RequiredPlatformCapabilityContract,
} from 'openxiangda-contracts';
import {
  CONFIGURATION_COMPATIBILITY_CAPABILITY as BROWSER_CONFIGURATION_COMPATIBILITY_CAPABILITY,
} from 'openxiangda-contracts/browser';
import { buildConfigurationCompatibilityCorpus } from '../../../scripts/lib/configuration-compatibility-corpus.mjs';

const SUBMISSION_CAPABILITY =
  'app:configuration-compatibility-corpus:workflow:standard-record-approval:submit';

interface CompatibilityCorpus {
  schemaVersion: string;
  appCode: string;
  counts: {
    resources: number;
    perspectives: number;
    eventProducers: number;
    workflowDefinitions: number;
    adminPages: number;
    adminNavigationItems: number;
  };
  requiredPlatformCapabilities: RequiredPlatformCapabilityContract[];
  configuration: { canonical: string; digest: string };
  contract: { canonical: string; digest: string };
}

function fixedCorpus(): CompatibilityCorpus {
  return JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        '../../contracts/test/fixtures/configuration-compatibility-corpus.json'
      ),
      'utf8'
    )
  );
}

test('keeps the fixed compatibility corpus identical to real toolchain generation', () => {
  const fixed = fixedCorpus();
  const generated = buildConfigurationCompatibilityCorpus();
  assert.deepEqual(generated, fixed);
  assert.deepEqual(fixed.counts, {
    resources: 43,
    perspectives: 1,
    eventProducers: 162,
    workflowDefinitions: 1,
    adminPages: 172,
    adminNavigationItems: 43,
  });
  assert.equal(
    CONFIGURATION_COMPATIBILITY_CAPABILITY,
    'configuration.compatibility-preflight'
  );
  assert.equal(
    BROWSER_CONFIGURATION_COMPATIBILITY_CAPABILITY,
    CONFIGURATION_COMPATIBILITY_CAPABILITY
  );
  assert.ok(
    fixed.requiredPlatformCapabilities.some(
      capability => capability.code === 'workflow.fresh-command-token'
    )
  );
  const configuration = JSON.parse(fixed.configuration.canonical);
  assert.equal(
    configuration.workflows.definitions[0].launch.submission.kind,
    'named-operation'
  );
  assert.equal(configuration.frontend.admin.navigation.length, 3);
  assert.equal(configuration.data.resources[0].surface.mutationOwner, 'native');
  assert.deepEqual(configuration.data.resources[0].surface.generated, {
    create: true,
    delete: true,
    detail: true,
    list: true,
    update: true,
  });
  assert.deepEqual(
    configuration.data.resources[0].schema.fields.find(
      (field: { code: string }) => field.code === 'status'
    ),
    {
      code: 'status',
      indexed: true,
      max: 100,
      min: 0,
      nullable: false,
      type: 'number.integer',
    }
  );
  const contract = JSON.parse(fixed.contract.canonical);
  assert.equal(
    contract.workflows[0].launch.submission.create.operationCode,
    'records-01.create-submit'
  );
  assert.equal(contract.workflows[0].processOperationCode, undefined);
  assert.equal(
    contract.routeManifest.routes.find(
      (route: { kind: string }) => route.kind === 'workflow-launch'
    ).desktop.capability,
    SUBMISSION_CAPABILITY
  );
  assert.equal(contract.adminPages.length, 172);
  assert.equal(
    contract.adminNavigation.flatMap(
      (group: { items: unknown[] }) => group.items
    ).length,
    43
  );
});

test('accepts the complete corpus through the exported public JSON Schemas', () => {
  const fixed = fixedCorpus();
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });
  for (const schema of Object.values(contractSchemas)) {
    ajv.addSchema(schema);
  }
  const { $id: _configurationId, ...configurationSchema } =
    contractSchemas.configurationBundle;
  const { $id: _contractId, ...contractSchema } = contractSchemas.contractBundle;
  const validateConfiguration = ajv.compile(configurationSchema);
  const validateContract = ajv.compile(contractSchema);
  assert.equal(
    validateConfiguration(JSON.parse(fixed.configuration.canonical)),
    true,
    JSON.stringify(validateConfiguration.errors)
  );
  assert.equal(
    validateContract(JSON.parse(fixed.contract.canonical)),
    true,
    JSON.stringify(validateContract.errors)
  );
  const unknownManifestKey = JSON.parse(fixed.contract.canonical) as any;
  unknownManifestKey.routeManifest.unknown = true;
  assert.equal(validateContract(unknownManifestKey), false);
  const unknownRouteKey = JSON.parse(fixed.contract.canonical) as any;
  unknownRouteKey.routeManifest.routes[0].desktop.unknown = true;
  assert.equal(validateContract(unknownRouteKey), false);
});

test('configuration JSON Schema rejects non-canonical authorization transitions', () => {
  const fixed = fixedCorpus();
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });
  for (const schema of Object.values(contractSchemas)) {
    ajv.addSchema(schema);
  }
  const { $id: _configurationId, ...configurationSchema } =
    contractSchemas.configurationBundle;
  const validateConfiguration = ajv.compile(configurationSchema);
  const configuration = JSON.parse(fixed.configuration.canonical) as {
    authz: { authorizationTransitions: unknown[] };
  };
  const canonical = {
    fromAuthzDigest: 'a'.repeat(64),
    removeRoleCodes: ['retired-role'],
    removeCapabilityCodes: ['app:configuration-compatibility-corpus:retired'],
    reason: 'retired authorization facts',
  };

  configuration.authz.authorizationTransitions = [canonical];
  assert.equal(
    validateConfiguration(configuration),
    true,
    JSON.stringify(validateConfiguration.errors)
  );

  for (const invalid of [
    { ...canonical, legacyRoleAliases: ['retired-role'] },
    { ...canonical, removeRoleCodes: 'retired-role' },
    { ...canonical, removeRoleCodes: ['retired-role', 'retired-role'] },
    { ...canonical, removeRoleCodes: [`r${'x'.repeat(128)}`] },
    { ...canonical, removeCapabilityCodes: [42] },
    { ...canonical, reason: { text: 'retired' } },
    null,
  ]) {
    configuration.authz.authorizationTransitions = [invalid];
    assert.equal(
      validateConfiguration(configuration),
      false,
      JSON.stringify({ invalid, errors: validateConfiguration.errors })
    );
  }
});
