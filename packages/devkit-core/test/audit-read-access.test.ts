import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, sha256Digest, DATA_AUDIT_METADATA_FIELDS, validateDataResource } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration, compileRequiredPlatformCapabilitiesV3 } from 'openxiangda-contracts/native-compiler';
import {
  defineOpenXiangdaApp, compileApplicationSources, requiredPlatformCapabilities,
  type OpenXiangdaAppDeclaration,
} from '../src/index.js';

function declaration(read?: string[] | false): OpenXiangdaAppDeclaration {
  return {
    app: {code:'audit-app', name:'Audit access'}, frontend: {root:'apps/web'},
    modules: [{code:'schedule', models:[{code:'slots', name:'Slots',
      fields:[{code:'name', type:'text.short', label:'Name'}],
      ...(read === undefined ? {} : {audit:{read}}),
    }], crud:[]}],
  };
}

test('model audit rule reaches the canonical resource without duplicate storage fields', () => {
  for (const read of [false, ['app:audit-app:audit:read']] as const) {
    const source = declaration(read === false ? false : [...read]);
    const app = defineOpenXiangdaApp(source);
    const compiled = compileApplicationSources(app);
    const resource = compiled.config.value.data.resources[0]!;
    assert.deepEqual(resource.schema.fields.map(field => field.code), ['name']);
    for (const field of DATA_AUDIT_METADATA_FIELDS) {
      assert.deepEqual(resource.fieldPolicies[field], {read:read === false ? [] : [...read]});
    }
    assert.deepEqual(validateDataResource(resource), []);
    assert.equal(compileNativeApplicationConfiguration({
      appCode:'audit-app', configBytes:canonicalJson(compiled.config.value),
      contractBytes:canonicalJson(compiled.contracts.value),
      expectedConfigDigest:compiled.config.digest, expectedContractDigest:compiled.contracts.digest,
    }).appCode, 'audit-app');
    const required = requiredPlatformCapabilities(app);
    assert.equal(required.find(item => item.code === 'data.audit-read-access')?.contractVersion, '1.0.0');
    assert.deepEqual(required, compileRequiredPlatformCapabilitiesV3(compiled.config.value));
  }
  assert.equal(requiredPlatformCapabilities(defineOpenXiangdaApp(declaration()))
    .some(item => item.code === 'data.audit-read-access'), false);
});

test('shared platform validator rejects protocol-column policies, audit writes and invalid read grants', () => {
  const compiled = compileApplicationSources(defineOpenXiangdaApp(declaration(false)));
  for (const [field, policy] of [
    ['id',{read:[]}], ['revision',{read:[]}], ['unknown',{read:[]}],
    ['created_by',{create:[]}], ['created_by',{read:[],mask:'omit'}],
    ['created_by',{read:['']}], ['created_by',{read:false}],
  ] as const) {
    const config = structuredClone(compiled.config.value);
    (config.data.resources[0]!.fieldPolicies as any)[field] = policy;
    assert.ok(validateDataResource(config.data.resources[0]).length > 0);
    const contract = {...compiled.contracts.value, configDigest:sha256Digest(config)};
    assert.throws(() => compileNativeApplicationConfiguration({
      appCode:'audit-app', configBytes:canonicalJson(config), contractBytes:canonicalJson(contract),
      expectedConfigDigest:sha256Digest(config), expectedContractDigest:sha256Digest(contract),
    }), (error: any) => /^NATIVE_DATA_|^NATIVE_PROPERTY_UNKNOWN$/.test(error.code) &&
      error.pointer.startsWith('/config/data/resources/0/fieldPolicies/'));
  }
});

test('direct resource authoring preserves audit policy and rejects malformed rules', () => {
  const base = declaration();
  const model = base.modules![0]!.models[0]!;
  const direct = {...base, modules:undefined, data:{resources:[{...model, fields:[...model.fields],audit:{read:false as const}}]}};
  assert.deepEqual(defineOpenXiangdaApp(direct).data!.resources[0]!.fieldPolicies.created_by, {read:[]});
  for (const audit of [null, {}, [], {read:true}, {read:[]}, {read:['']}, {read:['a','a']}, {read:false, write:true}]) {
    const invalid = structuredClone(direct) as any;
    invalid.data.resources[0].audit = audit;
    assert.throws(() => defineOpenXiangdaApp(invalid), error =>
      Boolean((error as any).diagnostics?.some(item => item.code === 'APP_CONFIG_DATA_AUDIT_READ_INVALID')));
  }
});
