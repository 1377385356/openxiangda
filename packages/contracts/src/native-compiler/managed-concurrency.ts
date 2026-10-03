import { OPENXIANGDA_NATIVE_SYSTEM_FIELD_MAP_V2 } from './data-field.js';
import type { ManagedConcurrencyDeclaration } from '../concurrency.js';

export class ManagedConcurrencyContractError extends Error {
  readonly code = 'NATIVE_MANAGED_CONCURRENCY_INVALID';
  constructor(readonly pointer: string, readonly reason: string) { super(`${pointer}: ${reason}`); }
}

/** Shared between authoring and the platform compiler. Reject unknown keys. */
export function validateManagedConcurrency(value: unknown, resources: readonly any[], capabilities: readonly any[]): ManagedConcurrencyDeclaration | undefined {
  if (value === undefined) return undefined;
  const fail = (path: string, reason: string): never => { throw new ManagedConcurrencyContractError(path, reason); };
  const obj = (v: any, path: string, keys: string[]) => {
    if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) fail(path, 'object contains unsupported properties');
    return v;
  };
  const integer = (v: any, min: number, max: number, p: string) => { if (!Number.isSafeInteger(v) || v < min || v > max) fail(p, `expected integer ${min}..${max}`); };
  const code = (v: any, p: string) => { if (typeof v !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(v)) fail(p, 'invalid code'); };
  const list = (v: any, max: number, p: string) => { if (!Array.isArray(v) || v.length > max) fail(p, 'array exceeds bound'); return v as any[]; };
  const resource = (c: string, p: string) => { const r = resources.find(r => r.code === c); if (!r) fail(p, 'unknown resource'); return r; };
  const field = (r: any, f: string, p: string) => { const d = r.schema.fields.find((v: any) => v.code === f); if (!d && f !== 'id') fail(p, 'unknown field'); return d; };
  const parameters = (v: any, p: string, durable = false) => {
    obj(v, p, Object.keys(v || {}));
    if (Object.keys(v).length > 8) fail(p, 'at most eight parameters');
    for (const [k, d] of Object.entries(v) as any) {
      code(k, p); obj(d, p, ['type', 'values', 'minimum', 'maximum', 'minLength', 'maxLength']);
      if (d.type === 'uuid') { if (Object.keys(d).length !== 1) fail(p, 'uuid has no options'); }
      else if (durable && d.type === 'boolean') { obj(d,p,['type']); }
      else if (durable && d.type === 'string' && d.values === undefined) { obj(d,p,['type','minLength','maxLength']); integer(d.maxLength,1,256,p); if(d.minLength!==undefined) integer(d.minLength,0,d.maxLength,p); }
      else if (d.type === 'string') { obj(d,p,['type','values']); const vs = list(d.values, 100, p); if (!vs.length || vs.some(x => typeof x !== 'string' || x.length > 128) || new Set(vs).size !== vs.length) fail(p, 'finite string values required'); }
      else if (d.type === 'integer') { obj(d,p,['type','minimum','maximum']); integer(d.minimum, 0, 1000000, p); integer(d.maximum, d.minimum, d.minimum + 1000, p); }
      else fail(p, 'unsupported parameter type');
    }
  };
  const binding = (b: any, params: any, p: string, allocation = false) => {
    obj(b, p, ['from', 'key', 'value']);
    if (b.from === 'input' && Object.keys(b).length === 2 && Object.hasOwn(params, b.key)) return;
    if ((b.from === 'actor' || (allocation && b.from === 'allocation')) && Object.keys(b).length === 1) return;
    if (b.from === 'literal' && Object.keys(b).length === 2 && Object.hasOwn(b, 'value') && (b.value === null || ['string','boolean'].includes(typeof b.value) || (typeof b.value==='number'&&Number.isFinite(b.value))) && JSON.stringify(b.value).length <= 512) return;
    fail(p, 'invalid binding');
  };
  const uuidBinding = (b: any, params: any, p: string) => {
    binding(b, params, p);
    if (b.from === 'input' && params[b.key].type === 'uuid') return;
    if (b.from === 'literal' && typeof b.value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.value)) return;
    fail(p, 'record and allocation identifiers require a UUID binding');
  };
  const revisionBinding = (b: any, params: any, p: string) => {
    binding(b, params, p);
    if (b.from === 'input' && params[b.key].type === 'integer' && params[b.key].minimum >= 1) return;
    if (b.from === 'literal' && Number.isSafeInteger(b.value) && b.value >= 1) return;
    fail(p, 'expectedRevision requires a positive integer binding');
  };
  const root = '/data/concurrency';
  if(JSON.stringify(value).length>131072) fail(root,'declaration exceeds 128 KiB');
  const d = obj(value, root, ['version','admission','reads','quotas','commands']);
  if (d.version !== 1) fail(root, 'unsupported version');
  obj(d.admission, root, ['perSecond','burst','maxInFlight']);
  integer(d.admission.perSecond, 1, 1000, root); integer(d.admission.burst, 1, 1000, root); integer(d.admission.maxInFlight, 1, 1000, root);
  const unique = (items: any[], p: string) => { const seen = new Set(); for (const v of items) { code(v?.code,p); if (seen.has(v.code)) fail(p,'duplicate code'); seen.add(v.code); } };
  unique(list(d.reads, 32, root), root); unique(list(d.quotas, 16, root), root); unique(list(d.commands, 32, root), root);
  for (const q of d.reads) {
    const p = `${root}/reads/${q.code}`;
    obj(q,p,['code','resourceCode','parameters','select','where','limit','scope','freshSeconds','staleSeconds','maxKeys','sourcePerSecond','dependencies']);
    const r = resource(q.resourceCode,p); parameters(q.parameters,p);
    if (!['subject','application'].includes(q.scope)) fail(p,'invalid cache scope');
    if (q.scope === 'application' && r.dataPolicyCode) fail(p,'shared cache cannot bypass a row policy');
    const select = list(q.select,32,p); if (!select.length) fail(p,'select required'); select.forEach(f=>field(r,f,p));
    const deps = list(q.dependencies,64,p); deps.forEach(f=>field(r,f,p));
    for (const w of list(q.where || [],8,p)) { obj(w,p,['field','value']); field(r,w.field,p); binding(w.value,q.parameters,p); if (q.scope === 'application' && w.value.from === 'actor') fail(p,'actor requires subject cache'); if (!deps.includes(w.field)) fail(p,'filter dependency missing'); }
    if (select.some(f=> !deps.includes(f))) fail(p,'selected field dependency missing');
    integer(q.limit,1,100,p); integer(q.freshSeconds,1,300,p); integer(q.staleSeconds,0,300,p); integer(q.maxKeys,1,10000,p); integer(q.sourcePerSecond,1,20,p);
  }
  for (const q of d.quotas) {
    const p = `${root}/quotas/${q.code}`;
    obj(q,p,['code','sourceResource','capacityField','allocationResource','allocationField','reservationSeconds']);
    const s = resource(q.sourceResource,p), r = resource(q.allocationResource,p);
    if (field(s,q.capacityField,p)?.type !== 'number.integer') fail(p,'capacity must be an integer');
    if (field(r,q.allocationField,p)?.type !== 'uuid' || field(r,q.allocationField,p)?.nullable!==false) fail(p,'allocation reference must be a uuid');
    if (r.surface?.mutationOwner !== 'queued-command') fail(p,'allocation model must be command owned');
    if (q.reservationSeconds !== undefined) integer(q.reservationSeconds,10,86400,p);
  }
  if (new Set(d.quotas.map((q:any)=>q.allocationResource)).size!==d.quotas.length) fail(root,'an allocation model has exactly one pool owner');
  for (const c of d.commands) {
    const p = `${root}/commands/${c.code}`;
    obj(c,p,['code','mode','intake','execution','capability','parameters','resourceKey','admission','deadlineSeconds','guards','operations','quota']);
    if(c.mode!==undefined && !['permit','durable'].includes(c.mode)) fail(p,'unsupported mode');
    const durable = c.mode==='durable'; parameters(c.parameters,p,durable); binding(c.resourceKey,c.parameters,p);
    if (!capabilities.some(v=>v.code===c.capability)) fail(p,'command capability must be declared');
    obj(c.admission,p,['perSecond','burst','maxInFlight','maxQueue','maxWaitSeconds','permitSeconds']);
    integer(c.admission.perSecond,1,d.admission.perSecond,p); integer(c.admission.burst,1,d.admission.burst,p); integer(c.admission.maxInFlight,1,d.admission.maxInFlight,p); integer(c.admission.maxQueue,1,10000,p); integer(c.admission.maxWaitSeconds,1,3600,p); if(!durable || c.admission.permitSeconds!==undefined) integer(c.admission.permitSeconds,5,60,p); integer(c.deadlineSeconds,10,3600,p);
    if (durable) {
      if(c.operations!==undefined || c.guards!==undefined || c.quota!==undefined) fail(p,'backend-plan does not accept static operations, guards or quota');
      obj(c.intake,p,['perSecond','burst','maxInFlight']);
      for(const k of ['perSecond','burst','maxInFlight']) integer(c.intake[k],1,1000,p);
      const e=obj(c.execution,p,['kind','handlerCode','timeoutMs','resources','directory']);
      if(e.kind!=='backend-plan') fail(p,'durable requires backend-plan');
      code(e.handlerCode,p); integer(e.timeoutMs,100,30000,p);
      const rs=list(e.resources,32,p); if(!rs.length) fail(p,'execution resources required');
      if(new Set(rs.map(x=>x.resourceCode)).size!==rs.length) fail(p,'duplicate execution resource');
      for(const a of rs) {
        obj(a,p,['resourceCode','readFields','writeOperations','writeFields']); const r=resource(a.resourceCode,p);
        for(const k of ['readFields','writeFields']) { const fs=list(a[k],64,p); if(new Set(fs).size!==fs.length) fail(p,'duplicate field'); fs.forEach(f=>{if(k==='readFields' && OPENXIANGDA_NATIVE_SYSTEM_FIELD_MAP_V2.has(f)) return;field(r,f,p);}); }
        const ops=list(a.writeOperations,3,p); if(new Set(ops).size!==ops.length || ops.some(o=>!['create','update','increment'].includes(o))) fail(p,'unsupported execution operation');
        if(a.writeFields.some((f:string)=>['id','revision','created_by','updated_by','created_at','updated_at'].includes(f))) fail(p,'record metadata is platform owned');
        if(!ops.length && a.writeFields.length) fail(p,'write fields require an operation');
        if(ops.length && !a.writeFields.length) fail(p,'write operations require fields');
        if(d.quotas.some((q:any)=>q.allocationResource===a.resourceCode) && ops.length) fail(p,'allocation references remain owned by their pool command');
      }
      if(e.directory!==undefined) { obj(e.directory,p,['mode','fields']); if(e.directory.mode!=='current-initiator') fail(p,'only current initiator allowed'); const fs=list(e.directory.fields,5,p); if(!fs.length || new Set(fs).size!==fs.length || fs.some(f=>!['displayName','employeeNumber','primaryDepartment','departments','phone'].includes(f))) fail(p,'unsupported directory fields'); }
      continue;
    }
    if(c.execution!==undefined || c.intake!==undefined) fail(p,'execution and intake require durable mode');
    for (const g of list(c.guards || [],8,p)) {
      obj(g,p,['resourceCode','id','conditions']); const r=resource(g.resourceCode,p); uuidBinding(g.id,c.parameters,p);
      for (const v of list(g.conditions,16,p)) { obj(v,p,['kind','field','operator','value']); const f=field(r,v.field,p); if(!['eq','neq','lt','lte','gt','gte'].includes(v.operator)) fail(p,'unsupported guard'); if(v.kind==='database-now') {if(f?.type!=='datetime'||!['lt','lte','gt','gte'].includes(v.operator)||v.value!==undefined) fail(p,'database-now requires datetime and an ordering operator');} else {if(v.kind!==undefined&&v.kind!=='value') fail(p,'unsupported condition kind'); binding(v.value,c.parameters,p);} }
    }
    for (const o of list(c.operations,8,p)) {
      obj(o,p,['operation','resourceCode','id','expectedRevision','data']); const r=resource(o.resourceCode,p);
      if (r.surface?.mutationOwner !== 'queued-command') fail(p,'command mutations require command owned models');
      const owner=d.quotas.find((q:any)=>q.allocationResource===o.resourceCode);
      if(owner && (o.operation==='create' ? c.quota?.action!=='allocate'||c.quota.pool!==owner.code : Object.hasOwn(o.data||{},owner.allocationField))) fail(p,'allocation references are owned by their pool command');
      if (!['create','update'].includes(o.operation)) fail(p,'unsupported operation');
      if (o.operation === 'update') { uuidBinding(o.id,c.parameters,p); revisionBinding(o.expectedRevision,c.parameters,p); } else if(o.id!==undefined||o.expectedRevision!==undefined) fail(p,'create has no caller supplied id/revision');
      obj(o.data,p,Object.keys(o.data || {})); if (Object.keys(o.data).length > 32) fail(p,'too many fields');
      for (const [f,b] of Object.entries(o.data)) { if(f==='id') fail(p,'record identifiers are platform owned'); field(r,f,p); binding(b,c.parameters,p, c.quota?.action==='allocate'); }
    }
    if (c.quota) {
      const q = obj(c.quota,p,['pool','action','units','mode','allocation']);
      const pool = d.quotas.find((v: any)=>v.code===q.pool); if(!pool) fail(p,'unknown quota pool');
      uuidBinding(c.resourceKey,c.parameters,p);
      if(q.action==='allocate') {
        obj(q,p,['pool','action','units','mode']);
        integer(q.units,1,1000,p); if(!['committed','reserved'].includes(q.mode) || (q.mode==='reserved' && !pool.reservationSeconds)) fail(p,'invalid allocation mode');
        if(c.operations.length!==1 || c.operations[0].operation!=='create' || c.operations[0].resourceCode!==pool.allocationResource || c.operations[0].data[pool.allocationField]?.from!=='allocation') fail(p,'allocation must atomically create its bound business record');
      } else if (['confirm','release'].includes(q.action)) { obj(q,p,['pool','action','allocation']); uuidBinding(q.allocation,c.parameters,p); if(c.operations.length) fail(p,'lifecycle owns allocation state; business reference remains immutable'); }
      else fail(p,'invalid quota action');
    } else if(!c.operations.length) fail(p,'operations required');
  }
  const handlers=d.commands.filter((c:any)=>c.mode==='durable').map((c:any)=>c.execution.handlerCode);
  if(new Set(handlers).size!==handlers.length) fail(root,'handler code must be unique');
  return JSON.parse(JSON.stringify(d));
}
