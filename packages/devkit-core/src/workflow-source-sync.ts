import { createHash,randomUUID } from 'node:crypto';
import { existsSync,lstatSync,mkdirSync,readFileSync,renameSync,unlinkSync,writeFileSync } from 'node:fs';
import { dirname,relative,resolve,sep } from 'node:path';
import ts from 'typescript';
import { canonicalJson,validateWorkflowSourceBundle,workflowSourceImportDrift,WORKFLOW_SOURCE_BUNDLE_MAX_BYTES,
  workflowNodeAllowedOperations,type WorkflowSourceBundle,type WorkflowSourceLock,type WorkflowRegistrationPlan,type WorkflowDefinition } from 'openxiangda-contracts';
import { NATIVE_CONTRACT_CAPACITY_V2 } from 'openxiangda-contracts/native-compiler';
import type { OpenXiangdaAppConfig } from './compiler/config.js';
function fail(code: string,detail = ''): never { throw Object.assign(new Error(`${code}${detail ? `: ${detail}` : ''}`),{ code }); }
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const fileDigest = (value: string) => createHash('sha256').update(value).digest('hex');
export const workflowSourceLockPath = (root: string,code: string) => {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(code)) fail('WORKFLOW_SOURCE_CODE_INVALID');
  return resolve(root,'platform/workflows',`${code}.lock.json`);
};
function inside(root: string,path: string): void {
  const rel = relative(resolve(root),resolve(path));
  if (rel === '..' || rel.startsWith(`..${sep}`) || !rel) fail('WORKFLOW_SOURCE_PATH_INVALID');
  let current = resolve(root);
  for (const component of rel.split(sep)) {
    current = resolve(current,component);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) fail('WORKFLOW_SOURCE_SYMLINK_FORBIDDEN');
  }
}
export function readWorkflowSourceBundle(path: string): WorkflowSourceBundle {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('WORKFLOW_SOURCE_BUNDLE_PATH_INVALID');
  if (stat.size > WORKFLOW_SOURCE_BUNDLE_MAX_BYTES) fail('WORKFLOW_BUNDLE_TOO_LARGE');
  let value: unknown;
  try { value=JSON.parse(readFileSync(path,'utf8')); } catch { fail('WORKFLOW_BUNDLE_CORRUPT'); }
  const errors = validateWorkflowSourceBundle(value,digest);
  if (errors.length) fail(errors[0]!);
  return value as WorkflowSourceBundle;
}
export function workflowSourceDeclaration(config: OpenXiangdaAppConfig,code: string) {
  const activation = config.workflows?.activations.find(item => item.workflowCode === code);
  const definition = config.workflows?.definitions.find(item => item.definition.code === code && item.version === activation?.definitionVersion);
  const binding = config.workflows?.bindings.find(item => item.binding.workflowCode === code && item.version === activation?.bindingVersion);
  if (!activation || !definition || !binding) fail('WORKFLOW_SOURCE_DECLARATION_REQUIRED',code);
  return { activation,definition,binding,definitionDigest: digest(definition.definition),bindingDigest: digest(binding.binding) };
}
function handlingDefaults(source: WorkflowDefinition,bundle: WorkflowSourceBundle): WorkflowDefinition {
  const next = structuredClone(source);
  for (const [id,handling] of Object.entries(bundle.handling)) {
    const node = next.nodes[id];
    if (!node || !['approval','handle'].includes(node.kind)) continue;
    if (node.kind !== 'approval' && node.kind !== 'handle') continue;
    if (handling.mode) node.mode=handling.mode;
    if (handling.operations) {
      const enabled = new Set(workflowNodeAllowedOperations(node));
      node.operationPolicy={ ...node.operationPolicy };
      for (const [operation,policy] of Object.entries(handling.operations)) {
        if (!policy) continue;
        if (policy.enabled === true) enabled.add(operation as any);else if (policy.enabled === false) enabled.delete(operation as any);
        const { enabled: ignored,...presentation }=policy;
        (node.operationPolicy as Record<string,unknown>)[operation]={ ...(node.operationPolicy as Record<string,unknown>)[operation] as object,...presentation };
      }
      node.allowedOperations=[...enabled] as NonNullable<typeof node.allowedOperations>;
    }
  }
  return next;
}
export function prepareWorkflowSourceImport(config: OpenXiangdaAppConfig,bundle: WorkflowSourceBundle,adoptHandlingDefaults = false) {
  if (config.app.code !== bundle.appCode) fail('WORKFLOW_IMPORT_APP_MISMATCH');
  const current = workflowSourceDeclaration(config,bundle.workflowCode);
  const errors = workflowSourceImportDrift(current.definition.definition,current.binding.binding,bundle,digest);
  if (errors.length) fail(errors[0]!);
  const workflows = structuredClone(config.workflows!);
  const definition = adoptHandlingDefaults ? handlingDefaults(bundle.definition,bundle) : structuredClone(bundle.definition);
  const amended = { ...bundle,definition,origin: { ...bundle.origin,definitionDigest: digest(definition) } };
  // Handling can change defaults only inside the same released code authority.
  if (adoptHandlingDefaults) {
    const amendedErrors = workflowSourceImportDrift(current.definition.definition,current.binding.binding,amended,digest);
    if (amendedErrors.length) fail(amendedErrors[0]!);
  }
  const sourceDefinition = workflows.definitions.find(item => item.definition.code === bundle.workflowCode && item.version === current.definition.version)!;
  const sourceBinding = workflows.bindings.find(item => item.binding.workflowCode === bundle.workflowCode && item.version === current.binding.version)!;
  const definitionCollision = workflows.definitions.find(item => item !== sourceDefinition && item.definition.code === bundle.workflowCode && item.version === bundle.origin.definitionVersion);
  const bindingCollision = workflows.bindings.find(item => item !== sourceBinding && item.binding.workflowCode === bundle.workflowCode && item.version === bundle.origin.bindingVersion);
  if (definitionCollision && digest(definitionCollision.definition) !== digest(definition) || bindingCollision && digest(bindingCollision.binding) !== digest(bundle.binding)) fail('WORKFLOW_IMPORT_LOCAL_VERSION_CONFLICT');
  sourceDefinition.definition=definition;sourceDefinition.version=bundle.origin.definitionVersion;
  sourceBinding.binding=structuredClone(bundle.binding);sourceBinding.version=bundle.origin.bindingVersion;
  if (definitionCollision) workflows.definitions=workflows.definitions.filter(item => item !== definitionCollision);
  if (bindingCollision) workflows.bindings=workflows.bindings.filter(item => item !== bindingCollision);
  const activation=workflows.activations.find(item => item.workflowCode === bundle.workflowCode)!;
  activation.definitionVersion=bundle.origin.definitionVersion;activation.bindingVersion=bundle.origin.bindingVersion;
  activation.sourceBase={ definitionDigest: bundle.origin.definitionDigest,bindingDigest: bundle.origin.bindingDigest };
  const lock: WorkflowSourceLock={ schemaVersion: 'openxiangda.workflow-source-lock/v1',workflowCode: bundle.workflowCode,
    base: { definitionVersion: bundle.origin.definitionVersion,bindingVersion: bundle.origin.bindingVersion,definitionDigest: bundle.origin.definitionDigest,bindingDigest: bundle.origin.bindingDigest },
    origin: { environmentKey: bundle.origin.environmentKey,headRevision: bundle.origin.headRevision } };
  return { workflows,lock,handlingNotImported: Object.entries(bundle.handling).filter(([,handling]) => handling.assignee?.kind === 'named_people').map(([nodeId,handling]) => ({ nodeId,count: handling.assignee?.kind === 'named_people' ? handling.assignee.count : 0 })) };
}
/** The config remains authoritative. Only its explicit workflows initializer is replaced; no hidden overlay is installed. */
export function rewriteWorkflowSourceConfig(source: string,path: string,workflows: NonNullable<OpenXiangdaAppConfig['workflows']>): string {
  const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  const matches: ts.PropertyAssignment[]=[];
  const visit=(node: ts.Node) => { if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === 'workflows') matches.push(node);ts.forEachChild(node,visit); };
  visit(file);
  if (matches.length !== 1) fail('WORKFLOW_SOURCE_REWRITE_AMBIGUOUS','配置必须有一个显式 workflows 属性；代码能力检查通过后才会写入');
  const expression=matches[0]!.initializer;
  return source.slice(0,expression.getStart(file))+JSON.stringify(workflows,null,2)+source.slice(expression.getEnd());
}
function replaceFiles(root: string,changes: Array<{ path: string; before: string | null; after: string }>): void {
  const staged: Array<{ path: string; temp: string; before: string | null; after: string }> = [];
  const committed: typeof staged = [];
  try {
    for (const change of changes) {
      inside(root,change.path);mkdirSync(dirname(change.path),{ recursive: true });
      const temp=`${change.path}.${randomUUID()}.tmp`;
      writeFileSync(temp,change.after,{ flag: 'wx',mode: 0o644 });staged.push({ ...change,temp });
    }
    for (const change of staged) if ((existsSync(change.path) ? readFileSync(change.path,'utf8') : null) !== change.before) fail('WORKFLOW_SOURCE_FILE_CHANGED');
    for (const change of staged) { renameSync(change.temp,change.path);committed.push(change); }
  } catch (error) {
    for (const change of committed.reverse()) if (existsSync(change.path) && fileDigest(readFileSync(change.path,'utf8')) === fileDigest(change.after)) {
      if (change.before === null) unlinkSync(change.path);else writeFileSync(change.path,change.before);
    }
    throw error;
  } finally { for (const change of staged) if (existsSync(change.temp)) unlinkSync(change.temp); }
}
export function importWorkflowSource(root: string,configPath: string,config: OpenXiangdaAppConfig,bundle: WorkflowSourceBundle,adoptHandlingDefaults = false) {
  inside(root,configPath);
  const before=readFileSync(configPath,'utf8'),prepared=prepareWorkflowSourceImport(config,bundle,adoptHandlingDefaults);
  const after=rewriteWorkflowSourceConfig(before,configPath,prepared.workflows),lockPath=workflowSourceLockPath(root,bundle.workflowCode);
  inside(root,lockPath);
  replaceFiles(root,[{ path: lockPath,before: existsSync(lockPath) ? readFileSync(lockPath,'utf8') : null,after: JSON.stringify(prepared.lock,null,2)+'\n' },{ path: configPath,before,after }]);
  return { workflowCode: bundle.workflowCode,configPath,lockPath,definitionVersion: bundle.origin.definitionVersion,bindingVersion: bundle.origin.bindingVersion,handlingNotImported: prepared.handlingNotImported };
}
export function writeWorkflowRegistrationPlan(root: string,configPath: string,config: OpenXiangdaAppConfig,plans: WorkflowRegistrationPlan[]) {
  inside(root,configPath);
  const workflows=structuredClone(config.workflows || { definitions: [],bindings: [],activations: [] });
  if (!Array.isArray(plans) || !plans.length || plans.length > NATIVE_CONTRACT_CAPACITY_V2.workflows || new Set(plans.map(plan => plan.workflowCode)).size !== plans.length) fail('WORKFLOW_SOURCE_PLAN_INVALID');
  for (const plan of plans) {
    const current=workflowSourceDeclaration(config,plan.workflowCode);
    if (current.definitionDigest !== plan.definition.digest.replace(/^sha256:/,'') || current.bindingDigest !== plan.binding.digest.replace(/^sha256:/,'')) fail('WORKFLOW_SOURCE_PLAN_STALE');
    if (![plan.definition.number,plan.binding.number].every(number => Number.isSafeInteger(number) && number >= 1 && number <= 1000000)) fail('WORKFLOW_SOURCE_PLAN_INVALID');
    const definition=workflows.definitions.find(item => item.definition.code === plan.workflowCode && item.version === current.definition.version)!;
    const binding=workflows.bindings.find(item => item.binding.workflowCode === plan.workflowCode && item.version === current.binding.version)!;
    const definitionCollision=workflows.definitions.find(item => item !== definition && item.definition.code === plan.workflowCode && item.version === plan.definition.number);
    const bindingCollision=workflows.bindings.find(item => item !== binding && item.binding.workflowCode === plan.workflowCode && item.version === plan.binding.number);
    if (definitionCollision && digest(definitionCollision.definition) !== current.definitionDigest || bindingCollision && digest(bindingCollision.binding) !== current.bindingDigest) fail('WORKFLOW_SOURCE_PLAN_LOCAL_VERSION_CONFLICT');
    if (definitionCollision) workflows.definitions=workflows.definitions.filter(item => item !== definitionCollision);
    if (bindingCollision) workflows.bindings=workflows.bindings.filter(item => item !== bindingCollision);
    definition.version=plan.definition.number;binding.version=plan.binding.number;
    const activation=workflows.activations.find(item => item.workflowCode === plan.workflowCode)!;activation.definitionVersion=plan.definition.number;activation.bindingVersion=plan.binding.number;
  }
  const before=readFileSync(configPath,'utf8');replaceFiles(root,[{ path: configPath,before,after: rewriteWorkflowSourceConfig(before,configPath,workflows) }]);
  return { configPath,workflows: plans.map(plan => ({ workflowCode: plan.workflowCode,definitionVersion: plan.definition.number,bindingVersion: plan.binding.number })) };
}

export function writeWorkflowSourceBundle(root: string,path: string,bundle: WorkflowSourceBundle) {
  const errors=validateWorkflowSourceBundle(bundle,digest);if (errors.length) fail(errors[0]!);
  inside(root,path);const before=existsSync(path) ? readFileSync(path,'utf8') : null;
  replaceFiles(root,[{ path,before,after: JSON.stringify(bundle,null,2)+'\n' }]);return { path,workflowCode: bundle.workflowCode,definitionVersion: bundle.origin.definitionVersion,bindingVersion: bundle.origin.bindingVersion };
}
export function readWorkflowSourceLock(root: string,code: string): WorkflowSourceLock | undefined {
  const path=workflowSourceLockPath(root,code);inside(root,path);if (!existsSync(path)) return undefined;
  if (lstatSync(path).size > 8192) fail('WORKFLOW_SOURCE_LOCK_INVALID');
  const lock=JSON.parse(readFileSync(path,'utf8')) as WorkflowSourceLock;
  if (lock.schemaVersion !== 'openxiangda.workflow-source-lock/v1' || lock.workflowCode !== code || !lock.base || !/^(sha256:)?[a-f0-9]{64}$/.test(lock.base.definitionDigest) || !/^(sha256:)?[a-f0-9]{64}$/.test(lock.base.bindingDigest)) fail('WORKFLOW_SOURCE_LOCK_INVALID');
  return lock;
}
