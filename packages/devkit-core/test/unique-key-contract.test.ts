import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalJson, sha256Digest, parseNativeUniqueKeys, nativeUniqueKeysJsonSchema, validateDataResource } from 'openxiangda-contracts';
import { compileNativeApplicationConfiguration } from 'openxiangda-contracts/native-compiler';
import { compileApplicationSources, defineOpenXiangdaApp, defineDataModel, defineApplicationModule, requiredPlatformCapabilities,
  type OpenXiangdaAppDeclaration } from '../src/index.js';

const cjs = createRequire(import.meta.url)('openxiangda-contracts/native-compiler');
const fields = [
  { code: 'externalId', label: 'External ID', type: 'text.short' as const },
  { code: 'name', label: 'Name', type: 'text.short' as const },
  { code: 'state', label: 'State', type: 'option.single' as const, options: [{value:'active',label:'Active'},{value:'void',label:'Void'}] },
];
const rules = [{ code: 'active-external-id', fields: [{fieldCode:'externalId',normalizer:'nfkc-upper-ascii-v1' as const}],
  when: [{fieldCode:'state',operator:'notIn' as const,values:['void']}] }];
const source = (): OpenXiangdaAppDeclaration => ({ app:{code:'unique-example',name:'Unique example'},
  data:{resources:[{code:'partners',name:'Partners',fields,uniqueKeys:rules}]} });
function platform(output: ReturnType<typeof compileApplicationSources>, mutate?: (value: any) => void) {
  const config = structuredClone(output.config.value), contract = structuredClone(output.contracts.value);
  mutate?.(config); contract.configDigest = sha256Digest(config);
  return compileNativeApplicationConfiguration({appCode:'unique-example',configBytes:canonicalJson(config),contractBytes:canonicalJson(contract),
    expectedConfigDigest:sha256Digest(config),expectedContractDigest:sha256Digest(contract)});
}

test('model, client and server compiler preserve one canonical unique rule and derive its required capability', () => {
  const defined = defineOpenXiangdaApp(source());
  const output = compileApplicationSources(defined), native = platform(output);
  assert.deepEqual(output.config.value.data.resources[0]!.uniqueKeys, rules);
  assert.deepEqual(native.projections.data.value.resources[0]!.uniqueKeys, rules);
  for (const capabilities of [requiredPlatformCapabilities(defined), native.requiredPlatformCapabilities])
    assert.ok(capabilities.some(item => item.code==='data.unique-keys' && item.contractVersion==='1.0.0'));
  assert.deepEqual(requiredPlatformCapabilities(defined).find(item=>item.code==='data.unique-keys'),
    native.requiredPlatformCapabilities.find(item=>item.code==='data.unique-keys'));
  assert.deepEqual(validateDataResource(output.config.value.data.resources[0]), []);
  const model = defineDataModel({code:'partners',name:'Partners',fields,uniqueKeys:rules});
  const fromModel = compileApplicationSources(defineOpenXiangdaApp({app:source().app,
    modules:[defineApplicationModule({code:'directory',models:[model]})]}));
  assert.deepEqual(fromModel.config.value.data.resources[0]!.uniqueKeys,rules);
  assert.doesNotThrow(() => platform(fromModel));
});

test('optional rules leave ordinary applications without a new platform requirement', () => {
  const input=source(); delete input.data!.resources[0]!.uniqueKeys;
  const config=defineOpenXiangdaApp(input), result=platform(compileApplicationSources(config));
  assert.equal(result.projections.data.value.resources[0]!.uniqueKeys,undefined);
  assert.ok(!requiredPlatformCapabilities(config).some(item=>item.code==='data.unique-keys'));
  assert.ok(!result.requiredPlatformCapabilities.some(item=>item.code==='data.unique-keys'));
});

test('ESM, CJS and JSON Schema reject null defaults, unknown properties and bounded-shape violations', () => {
  const schema=new Ajv2020({strict:false}).compile(nativeUniqueKeysJsonSchema);
  const cases: unknown[] = [null, {}, [{...rules[0],unknown:true}], [{...rules[0],code:'Invalid'}],
    [{...rules[0],code:'a'.repeat(21)}], [{...rules[0],fields:[]}],
    [{...rules[0],fields:[{fieldCode:'name',normalizer:null}]}], [{...rules[0],when:null}],
    [{...rules[0],fields:[{fieldCode:'name',normalizer:'locale-fold'}]}],
    Array.from({length:9},(_,i)=>({...rules[0],code:`key-${i}`})),
    [{...rules[0],when:[{fieldCode:'state',operator:'in',values:[]}]}],
    [{...rules[0],when:[{fieldCode:'name',operator:'empty',values:['active']}]}],
  ];
  for (const value of cases) {
    assert.equal(schema(value),false,JSON.stringify(value));
    for (const parse of [parseNativeUniqueKeys,cjs.parseNativeUniqueKeys])
      assert.throws(()=>parse(value,fields),(error:any)=>error.code==='NATIVE_UNIQUE_KEY_INVALID');
  }
  assert.equal(schema(rules),true);
  assert.deepEqual(parseNativeUniqueKeys([{code:'name',fields:[{fieldCode:'name'}]}],fields),
    [{code:'name',fields:[{fieldCode:'name',normalizer:'exact-v1'}],when:[]}]);
  assert.deepEqual(cjs.parseNativeUniqueKeys(rules,fields),rules);
});

test('both authoring and independent platform validation reject invalid field semantics', () => {
  const invalid = [
    [{code:'key',fields:[{fieldCode:'missing'}]}],
    [{code:'key',fields:[{fieldCode:'state',normalizer:'nfkc-space-v1'}]}],
    [{code:'key',fields:[{fieldCode:'name'},{fieldCode:'name'}]}],
    [{...rules[0],when:[{fieldCode:'state',operator:'empty'}]}],
    [{...rules[0],when:[{fieldCode:'name',operator:'in',values:['active']}]}],
    [{...rules[0],when:[{fieldCode:'state',operator:'in',values:['unknown']}]}],
    [rules[0],rules[0]],
  ];
  const valid=compileApplicationSources(defineOpenXiangdaApp(source()));
  for(const value of invalid) {
    const input=source(); input.data!.resources[0]!.uniqueKeys=value as any;
    assert.throws(()=>defineOpenXiangdaApp(input),(error:any)=>error.code==='NATIVE_UNIQUE_KEY_INVALID');
    assert.throws(()=>platform(valid,config=>{config.data.resources[0].uniqueKeys=value;}),
      (error:any)=>error.code==='NATIVE_UNIQUE_KEY_INVALID' && error.pointer.includes('uniqueKeys'));
    assert.ok(validateDataResource({...valid.config.value.data.resources[0],uniqueKeys:value}).some(item=>item.code==='NATIVE_UNIQUE_KEY_INVALID'));
  }
});

test('canonical order is independent from the authoring order of compound fields and predicates', () => {
  const a=[{code:'multi',fields:[{fieldCode:'name'},{fieldCode:'externalId'}],when:[
    {fieldCode:'state',operator:'in',values:['void','active']},{fieldCode:'name',operator:'nonempty'}]}];
  const b=structuredClone(a); b[0]!.fields.reverse(); b[0]!.when.reverse();
  (b[0]!.when[1] as any).values.reverse();
  assert.deepEqual(parseNativeUniqueKeys(a,fields),parseNativeUniqueKeys(b,fields));
});
