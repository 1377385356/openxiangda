import type { WorkflowDefinition, WorkflowStandardBindingEntry } from '../types.js';
import { workflowBusinessStepFactSchema } from './workflow-business-step.js';
import { validateWorkflowStandardAssignment } from './workflow-standard-assignment-validation.js';
import { validateWorkflowSupervisorChains } from './workflow-supervisor-chain.js';

export type WorkflowPeopleSourceParameter = { values: unknown[]; minimum?: never; maximum?: never } | { minimum: number; maximum: number; values?: never };
/** Immutable source-owned ceiling; never accepted as a configuration patch. */
export interface WorkflowPeopleSourceTemplate {
  code: string;
  title: string;
  entry: WorkflowStandardBindingEntry;
  parameters: Record<string, WorkflowPeopleSourceParameter>;
}
const fields: Record<string, readonly string[]> = {
  department_supervisor: ['departmentIdFrom', 'level', 'fallbackToAncestorSupervisor', 'min', 'max'],
  supervisor_chain: ['from', 'until', 'continuous', 'missing', 'min', 'max'],
  form_field_users: ['inputPath', 'min', 'max'], input_users: ['inputPath', 'min', 'max'],
  app_role_in_scope: ['roleCode', 'scope', 'min', 'max'],
};
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value) && [null,Object.prototype].includes(Object.getPrototypeOf(value));
function bounded(value: unknown): boolean {
  let budget = 4096;
  const walk = (v: unknown, depth: number): boolean => {
    if (--budget < 0 || depth > 12) return false;
    if (v === null || typeof v === 'boolean') return true;
    if (typeof v === 'string') return v.length <= 2048;
    if (typeof v === 'number') return Number.isFinite(v);
    if (Array.isArray(v)) return v.length <= 200 && v.every(item => walk(item, depth+1));
    return record(v) && Object.keys(v).every(key => !['__proto__','prototype','constructor'].includes(key) && !Object.getOwnPropertyDescriptor(v,key)?.get && walk(v[key],depth+1));
  };
  try { return walk(value,0) && new TextEncoder().encode(JSON.stringify(value)).length <= 32768; } catch { return false; }
}
const semantic = (value: unknown): string => {
  const sorted = (v: any): any => Array.isArray(v) ? v.map(sorted) : record(v) ? Object.fromEntries(Object.keys(v).filter(key=>v[key]!==undefined).sort().map(key=>[key,sorted(v[key])])) : v;
  return JSON.stringify(sorted(value));
};
const parameterAllows = (value: unknown, parameter: WorkflowPeopleSourceParameter) => Array.isArray(parameter.values) ? parameter.values.some(candidate=>semantic(candidate)===semantic(value)) : Number.isSafeInteger(value) && (value as number)>=parameter.minimum! && (value as number)<=parameter.maximum!;
function templateErrors(template: unknown): string[] {
  if (!bounded(template) || !record(template) || Object.keys(template).some(key=>!['code','title','entry','parameters'].includes(key)) ||
      typeof template.code !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(template.code) || typeof template.title !== 'string' || !template.title.trim() || template.title.length>160 ||
      !record(template.entry) || !fields[template.entry.provider] || validateWorkflowStandardAssignment(template.entry).length || !record(template.parameters) || !Object.keys(template.parameters).length || Object.keys(template.parameters).length>8) return ['WORKFLOW_PEOPLE_SOURCE_TEMPLATE_INVALID'];
  for (const [field, parameter] of Object.entries<any>(template.parameters)) {
    if (!fields[template.entry.provider]!.includes(field) || !record(parameter)) return ['WORKFLOW_PEOPLE_SOURCE_PARAMETER_INVALID'];
    if (Object.hasOwn(parameter,'values')) {
      if (Object.keys(parameter).length!==1 || !Array.isArray(parameter.values) || !parameter.values.length || parameter.values.length>32 || new Set(parameter.values.map(semantic)).size!==parameter.values.length) return ['WORKFLOW_PEOPLE_SOURCE_PARAMETER_INVALID'];
      for (const value of parameter.values) {
        const variant={...template.entry,[field]:value};
        if (validateWorkflowStandardAssignment(variant).length || field==='scope' && value?.dimension!==template.entry.scope?.dimension ||
            field==='min' && value<(template.entry.min??1) || field==='max' && value>(template.entry.max??200)) return ['WORKFLOW_PEOPLE_SOURCE_PARAMETER_CEILING'];
      }
    } else if (Object.keys(parameter).some(key=>!['minimum','maximum'].includes(key)) || !['level','min','max'].includes(field) || !Number.isSafeInteger(parameter.minimum) || !Number.isSafeInteger(parameter.maximum) || parameter.minimum<1 || parameter.maximum<parameter.minimum || parameter.maximum>(field==='level'?20:200) ||
               field==='min' && parameter.minimum<(template.entry.min??1) || field==='max' && parameter.maximum>(template.entry.max??200)) return ['WORKFLOW_PEOPLE_SOURCE_PARAMETER_CEILING'];
  }
  return [];
}
export function validateWorkflowPeopleSourceTemplates(definition: WorkflowDefinition): string[] {
  const values=definition.authoring?.peopleSources;
  if (values===undefined) return [];
  if (!Array.isArray(values) || values.length>32) return ['WORKFLOW_PEOPLE_SOURCE_TEMPLATE_LIMIT'];
  // Inspect JSON structure before reading catalogue keys: even a code getter
  // must not execute while validating an untrusted source declaration.
  const shapes=values.flatMap(templateErrors);
  if(shapes.length)return [...new Set(shapes)];
  if(new Set(values.map(template=>template.code)).size!==values.length)return ['WORKFLOW_PEOPLE_SOURCE_TEMPLATE_LIMIT'];
  const schema=workflowBusinessStepFactSchema(definition);
  const fact=(path: unknown) => {
    if (path === 'organizationContext.departmentId' && definition.organizationContext?.department && definition.organizationContext.department.source !== 'none') return { type: 'string' };
    if (typeof path!=='string' || path.split('.').some(key=>!key || ['__proto__','prototype','constructor'].includes(key))) return undefined;
    let current:any=schema;for(const key of path.split('.')) current=record(current?.properties)&&Object.hasOwn(current.properties,key)?current.properties[key]:undefined;return current;
  };
  const errors:string[]=[];
  for (const template of values) {
    const shape=templateErrors(template);if(shape.length){errors.push(...shape);continue;}
    const variants=[template.entry,...Object.entries(template.parameters).flatMap(([key, parameter]) => parameter.values?.map(value=>({...template.entry,[key]:value}))||[])];
    for(const entry of variants) {
      for(const path of [entry.inputPath,entry.departmentIdFrom,entry.scope?.valueFrom,...(typeof entry.from==='object'?[entry.from.field]:[])].filter(value=>value!==undefined)) if(!fact(path))errors.push('WORKFLOW_PEOPLE_SOURCE_FACT_UNAVAILABLE');
      if(entry.provider==='supervisor_chain') {
        const probe={...definition,nodes:{probe:{id:'probe',kind:'approval',mode:entry.continuous===false?'single':'sequence',binding:'probe'}}};
        errors.push(...validateWorkflowSupervisorChains(probe,{bindings:{probe:entry}}));
      }
    }
  }
  return [...new Set(errors)];
}
/** Match fixed parts separately so invalid local parameter input stays repairable. */
export function workflowPeopleSourceTemplateMatches(entry: WorkflowStandardBindingEntry, template: WorkflowPeopleSourceTemplate, checkParameters = true): boolean {
  if (!bounded(entry) || templateErrors(template).length || entry.provider!==template.entry.provider) return false;
  const fixed=(value:any)=>Object.fromEntries(Object.entries(value).filter(([key])=>!Object.hasOwn(template.parameters,key)));
  if(semantic(fixed(entry))!==semantic(fixed(template.entry)))return false;
  return !checkParameters || !validateWorkflowStandardAssignment(entry).length && Object.entries(template.parameters).every(([key,parameter])=>
    semantic((entry as any)[key])===semantic((template.entry as any)[key]) || parameterAllows((entry as any)[key],parameter));
}
export function workflowPeopleSourceTemplateAllows(entry: WorkflowStandardBindingEntry, templates: readonly WorkflowPeopleSourceTemplate[] = []): boolean {
  return Array.isArray(templates)&&templates.length<=32&&templates.some(template=>workflowPeopleSourceTemplateMatches(entry,template));
}
