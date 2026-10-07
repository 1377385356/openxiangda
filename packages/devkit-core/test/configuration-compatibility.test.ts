import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  CONFIGURATION_COMPATIBILITY_CAPABILITY,
  CURRENT_APPLICATION_CONTRACT,
  OPENXIANGDA_CONTRACT_VERSION,
  PLATFORM_CAPABILITY_CONTRACT_VERSIONS,
  SCHEMA_VERSIONS,
  contractSchemas,
  validateAppPackage,
  type AppPackage,
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

test('complete known capability closures pass preflight and package schemas beyond 64 entries', () => {
  const capabilities = Object.entries(PLATFORM_CAPABILITY_CONTRACT_VERSIONS).map(([code, contractVersion]) => ({
    code: code as RequiredPlatformCapabilityContract['code'], contractVersion,
    usageDigest: `sha256:${'b'.repeat(64)}` as const,
  })).sort((left, right) => left.code.localeCompare(right.code));
  assert.ok(capabilities.length > 64, 'The public catalog already exceeds the retired limit');
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validatePreflight = ajv.compile(contractSchemas.configurationValidationResult);
  const validatePackage = ajv.compile(contractSchemas.appPackage);
  for (const count of [64, 65, capabilities.length]) {
    const closure = capabilities.slice(0, count);
    const preflight = {
      schemaVersion: SCHEMA_VERSIONS.configurationValidationResult, compatible: true,
      environmentKey: 'preproduction', clientContractVersion: OPENXIANGDA_CONTRACT_VERSION,
      platformVersion: 'capability-closure-test',
      capability: { code: CONFIGURATION_COMPATIBILITY_CAPABILITY,
        version: CURRENT_APPLICATION_CONTRACT.compilerContractVersion, status: 'available' },
      required: CURRENT_APPLICATION_CONTRACT, supported: [CURRENT_APPLICATION_CONTRACT],
      source: { configurationDigest: 'a'.repeat(64), contractDigest: 'b'.repeat(64) },
      projectionDigest: 'c'.repeat(64), requiredPlatformCapabilities: closure,
      counts: { resources: 1, perspectives: 0, capabilities: 1, eventProducers: 0, workflowDefinitions: 1 },
    };
    const pkg: AppPackage = {
      schemaVersion: SCHEMA_VERSIONS.appPackage, appCode: 'capability-closure-test',
      version: '2.0.0-test.1', createdAt: '2026-10-07T00:00:00.000Z',
      source: { repository: 'https://example.invalid/capability-closure.git', commit: '0123456789abcdef', dirty: false },
      toolchain: { version: '2.0.0-test.1', contractVersion: OPENXIANGDA_CONTRACT_VERSION },
      artifacts: [{ kind: 'config', digest: 'a'.repeat(64), size: 128,
        mediaType: 'application/vnd.openxiangda.config.v3+json' }],
      manifests: { config: 'a'.repeat(64) },
      compatibility: { minimumPlatformVersion: '2.0.0-alpha.1',
        requiredPlatformCapabilities: closure, applicationContract: CURRENT_APPLICATION_CONTRACT },
    };
    assert.equal(validatePreflight(preflight), true, JSON.stringify(validatePreflight.errors));
    assert.equal(validatePackage(pkg), true, JSON.stringify(validatePackage.errors));
    assert.deepEqual(validateAppPackage(pkg), [], `semantic package validation: ${count} entries`);
    for (const invalid of [[], [closure[0], closure[0]],
      [{ ...closure[0], code: 'unknown-capability' }],
      [{ ...closure[0], usageDigest: 'invalid-digest' }],
      [...capabilities, { ...capabilities[0], usageDigest: `sha256:${'d'.repeat(64)}` }]]) {
      assert.equal(validatePreflight({ ...preflight, requiredPlatformCapabilities: invalid }), false);
      const badPackage = { ...pkg, compatibility: { ...pkg.compatibility, requiredPlatformCapabilities: invalid } };
      assert.equal(validatePackage(badPackage), false);
      assert.ok(validateAppPackage(badPackage).length > 0);
    }
  }
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
