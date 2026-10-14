import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import { DATA_RECORD_EVENT_DATA_SCHEMA_V2 } from '../src/event-catalog.js';
import type { EventActor } from '../src/types.js';
const ajv = new Ajv({strict:false});
const validate = ajv.compile(DATA_RECORD_EVENT_DATA_SCHEMA_V2);
const actor:EventActor={principalType:'anonymous_public',subjectId:'anonymous:synthetic-public-session'};
const event=(operation='created')=>({resourceCode:'external-intake',recordId:'synthetic-record',operation,revision:1,changedFields:['name'],projection:{},actor,cause:{depth:0,eventId:null,subscriptionCode:null}});
test('platform anonymous record actor is accepted for each Native record operation without applicant projections',()=>{
 for(const op of ['created','updated','deleted'])assert.equal(validate(event(op)),true,JSON.stringify(validate.errors));
});
test('anonymous event fact never accepts application authority or arbitrary actor properties',()=>{
 for(const patch of [{subjectId:''},{principalType:'unknown'},{initiatedBy:{principalType:'user',subjectId:'forged'}},{businessAction:{code:'fake',requiredCapability:'app:*',proof:'gateway-invocation'}},{roleCodes:['admin']}])assert.equal(validate({...event(),actor:{...actor,...patch}}),false);
});
test('existing actor identities retain their behavior',()=>{
 for(const principalType of ['user','user_union','application','developer','workflow','timer','system'])assert.equal(validate({...event(),actor:{principalType,subjectId:'synthetic-subject'}}),true);
});
