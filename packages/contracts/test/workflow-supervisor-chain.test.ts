import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorkflowSupervisorChainBinding, validateWorkflowSupervisorChains } from '../src/native-compiler/workflow-supervisor-chain.js';
import { validateWorkflowNodeConfigurationPatch } from '../src/native-compiler/workflow-node-administration.js';
import { workflowBindingRoleCodes } from '../src/native-compiler/workflow-role-union.js';
const entry={provider:'supervisor_chain',from:'initiator',until:{level:3},continuous:true,missing:'skip_level'};
function fixture():any {return {definition:{organizationContext:{department:{source:'user_primary_department',required:true}},inputSchema:{type:'object',properties:{person:{type:'string'}},additionalProperties:false},nodes:{a:{id:'a',kind:'approval',mode:'sequence',binding:'chain',administration:{modes:['sequence','all','any','single']}}}},binding:{bindings:{chain:structuredClone(entry)}}};}
test('chains are released closed bindings with bounded level and declared starter facts',()=>{
 const {definition,binding}=fixture();assert.deepEqual(validateWorkflowSupervisorChains(definition,binding),[]);
 binding.bindings.chain.from={field:'person'};assert.deepEqual(validateWorkflowSupervisorChains(definition,binding),[]);
 binding.bindings.chain.from={field:'missing'};assert.ok(validateWorkflowSupervisorChains(definition,binding).some(error=>error.includes('USER_FACT_REQUIRED')));
 for(const patch of [{until:{level:21}},{until:{level:0}},{until:{level:3,roleCode:'leader'}},{from:{field:'__proto__.user'}},{missing:'auto_approve'},{continuous:'true'},{users:['a']}]) assert.ok(validateWorkflowSupervisorChainBinding({...entry,...patch}).length);
});
test('continuous chains cannot be turned into parallel seats through either canvas or live configuration',()=>{
 const {definition,binding}=fixture();const node=definition.nodes.a;
 node.mode='any';assert.ok(validateWorkflowSupervisorChains(definition,binding).some(error=>error.includes('SEQUENCE_REQUIRED')));
 node.mode='sequence';assert.ok(validateWorkflowNodeConfigurationPatch(node,binding.bindings.chain,{mode:'any'}).includes('WORKFLOW_SUPERVISOR_CHAIN_SEQUENCE_REQUIRED'));
 binding.bindings.chain.continuous=false;assert.deepEqual(validateWorkflowSupervisorChains({...definition,nodes:{a:{...node,mode:'single'}}},binding),[]);
});
test('initiator chain requires an explicitly frozen department and role stops remain role references',()=>{
 const {definition,binding}=fixture();delete definition.organizationContext;assert.ok(validateWorkflowSupervisorChains(definition,binding).some(error=>error.includes('DEPARTMENT_CONTEXT_REQUIRED')));
 assert.deepEqual(workflowBindingRoleCodes({until:{roleCode:'leader'}}),['leader']);
 assert.deepEqual(validateWorkflowSupervisorChainBinding({provider:'fixed_users',users:['a'],until:{roleCode:'leader'}}),['WORKFLOW_SUPERVISOR_CHAIN_PROVIDER_INVALID']);
});
