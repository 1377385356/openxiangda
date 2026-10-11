import { workflowBusinessStepFactSchema } from './workflow-business-step.js';
export interface WorkflowSupervisorChainParameters {
  from: 'initiator' | { field: string };
  until: 'top' | { level: number } | { roleCode: string };
  continuous?: boolean;
  missing?: 'skip_level' | 'block';
}
const plain=(value:any)=>!!value && typeof value==='object' && !Array.isArray(value);
const path=(value:any)=>typeof value==='string' && value.length<=255 && value.split('.').length<=8 && /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z][A-Za-z0-9_-]*)*$/.test(value) && !value.split('.').some((key:string)=>['__proto__','prototype','constructor'].includes(key));
export function validateWorkflowSupervisorChainBinding(entry:any): string[] {
  if (entry?.provider !== 'supervisor_chain') return entry && ['from','until','continuous','missing'].some(key=>entry[key]!==undefined) ? ['WORKFLOW_SUPERVISOR_CHAIN_PROVIDER_INVALID'] : [];
  const from=entry.from,until=entry.until;
  if (!plain(entry) || Object.keys(entry).some(key=>!['provider','from','until','continuous','missing','min','max','delegatable'].includes(key)) || !(from==='initiator' || plain(from) && Object.keys(from).length===1 && path(from.field)) || !(until==='top' || plain(until) && Object.keys(until).length===1 && (Number.isInteger(until.level) && until.level>=1 && until.level<=20 || typeof until.roleCode==='string' && /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(until.roleCode) && until.roleCode.length<=128)) || entry.continuous!==undefined && typeof entry.continuous!=='boolean' || entry.missing!==undefined && !['skip_level','block'].includes(entry.missing)) return ['WORKFLOW_SUPERVISOR_CHAIN_BINDING_INVALID'];
  return [];
}
export function validateWorkflowSupervisorChains(definition:any,binding:any): string[] {
  const errors:string[]=[];
  for(const [code,entry] of Object.entries<any>(binding?.bindings || {})) errors.push(...validateWorkflowSupervisorChainBinding(entry).map(error=>`${error}:${code}`));
  for(const [id,node] of Object.entries<any>(definition?.nodes || {})) {
    const entry=binding?.bindings?.[node?.binding];if(entry?.provider!=='supervisor_chain' || validateWorkflowSupervisorChainBinding(entry).length) continue;
    if(!['approval','handle'].includes(node.kind)) errors.push(`WORKFLOW_SUPERVISOR_CHAIN_HUMAN_REQUIRED:${id}`);
    if(entry.continuous!==false && node.mode!=='sequence') errors.push(`WORKFLOW_SUPERVISOR_CHAIN_SEQUENCE_REQUIRED:${id}`);
    if(entry.from==='initiator') { if(!definition.organizationContext?.department || definition.organizationContext.department.source==='none') errors.push(`WORKFLOW_SUPERVISOR_CHAIN_DEPARTMENT_CONTEXT_REQUIRED:${id}`); }
    else {
      let schema:any=workflowBusinessStepFactSchema(definition);for(const key of entry.from.field.split('.')) schema=schema?.properties?.[key];
      const type=Array.isArray(schema?.type)?schema.type.filter((value:string)=>value!=='null')[0]:schema?.type;
      if(!schema || !['string','array','object'].includes(type)) errors.push(`WORKFLOW_SUPERVISOR_CHAIN_USER_FACT_REQUIRED:${id}`);
    }
  }
  return errors;
}
export function formatWorkflowSupervisorChain(entry:WorkflowSupervisorChainParameters):string {
  const from=entry.from==='initiator'?'申请人':`成员变量 ${entry.from.field}`;
  const until=entry.until==='top'?'最上级':'level' in entry.until?`第 ${entry.until.level} 级`:`角色 ${entry.until.roleCode}`;
  return `${from}的主管链 · 至${until} · ${entry.continuous!==false?'逐级办理':'仅终点办理'}`;
}
