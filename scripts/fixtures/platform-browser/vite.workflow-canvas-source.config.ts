import base from './vite.workflow-management-source.config';
const supervisor={provider:'department_supervisor',departmentIdFrom:'organizationContext.departmentId',level:1,fallbackToAncestorSupervisor:false,min:1,max:1};
const owner={...supervisor,departmentIdFrom:'ownerDept.value'};
const template={code:'department-supervisor',title:'部门主管',entry:supervisor,parameters:{departmentIdFrom:{values:['organizationContext.departmentId','ownerDept.value']},level:{values:[1,2,3]}}};
const approval=(id:string,title:string,next:string)=>({id,kind:'approval',title,binding:id,mode:'single',onApprove:next,onReject:'rejected',allowedOperations:['approve','reject','return','transfer'],returnPolicy:{targets:[{nodeId:'correct',routes:['replay','resume'],defaultRoute:'replay'}]},returnTargets:['correct'],administration:{modes:['single','any','all','sequence'],assigneeProviders:['fixed_users','app_role'],operations:['approve','reject','return','transfer']}});
const definition:any={schemaVersion:'openxiangda.workflow-definition/v2',code:'approval',title:'部门主管与画布交互 · 本地合成验证',startAt:'review',acceptedCommandDeactivationPolicy:'finish-pinned',organizationContext:{department:{source:'choose_if_multiple',required:true}},authoring:{peopleSources:[template]},subject:{resourceCode:'requests',factProjection:{ownerDept:'ownerDept'}},inputSchema:{type:'object',properties:{ownerDept:{type:'object',properties:{value:{type:'string'},label:{type:'string'}}}}},readability:{variables:{'ownerDept.value':{label:'归口单位'},'organizationContext.departmentId':{label:'本次发起单位'}}},taskPages:{correction:{title:'修改申请',fields:[{code:'ownerDept'}]}},nodes:{review:approval('review','发起单位部门负责人审核','owner'),owner:approval('owner','归口部门负责人确认','office'),office:approval('office','综合办审核','end'),end:{id:'end',kind:'end',title:'通过',outcome:'approved'},rejected:{id:'rejected',kind:'end',title:'拒绝结束',outcome:'rejected'},correct:{id:'correct',kind:'correction',title:'发起人修改',next:'review',taskPageCode:'correction'}}};
// Synthetic routing region deliberately isolated from all customer records.
definition.inputSchema.properties.category={type:'string'};
definition.readability.variables.category={label:'合同分支'};
definition.nodes.review.onApprove='route';
definition.nodes.owner.onApprove='after';definition.nodes.office.onApprove='after';
definition.nodes.after=approval('after','分管院领导审核','end');
definition.nodes.route={id:'route',kind:'condition',title:'重大合同路由',branches:[{label:'重大',when:{op:'eq',left:{op:'path',path:'category'},right:{op:'literal',value:'major'}},target:'owner'},{label:'一般',when:{op:'eq',left:{op:'path',path:'category'},right:{op:'literal',value:'general'}},target:'office'}],otherwise:'after'};
const binding:any={schemaVersion:'openxiangda.workflow-binding/v2',workflowCode:'approval',bindings:{review:supervisor,owner,office:{provider:'app_role',roleCode:'office'},after:{provider:'app_role',roleCode:'office'}}};
let draft:any={view:'draft',authority:{actions:['definition.read','draft.edit']},workflowCode:'approval',environmentKey:'preproduction',revision:1,baseHeadRevision:3,definitionVersion:1,bindingVersion:1,definition:structuredClone(definition),binding:structuredClone(binding),publishedDefinition:definition,publishedBinding:binding,diagnostics:[],publishable:true,updatedAt:null,updatedBy:null};
draft.capabilities={appVersionId:'local-only',digest:'synthetic',taskPages:definition.taskPages,steps:[],peopleSources:binding.bindings,nativePeopleAuthoring:true,peopleSourceTemplates:[template]};
const configuration:any={schemaVersion:'openxiangda.workflow-node-configurations/v2',workflowCode:'approval',definitionVersion:1,bindingVersion:1,effect:'future_node_entries_keep_existing_tasks',history:[],principals:{users:[],roles:[{code:'office',name:'综合办审核人员'}]},conditionalAssignment:{definition,nativePeopleAuthoring:true,peopleSourceTemplates:[template],releasedSources:binding.bindings,scopeDimensionsByNode:{}},nodes:['review','owner','office','after'].map(id=>({nodeId:id,kind:'approval',defaults:{title:definition.nodes[id].title,mode:'single',binding:binding.bindings[id],allowedOperations:definition.nodes[id].allowedOperations},effective:{revision:0,title:definition.nodes[id].title,mode:'single',binding:binding.bindings[id],allowedOperations:definition.nodes[id].allowedOperations},configuration:{revision:0,patch:null,updatedAt:null,updatedBy:null},administration:definition.nodes[id].administration}))};
const requests:any[]=[];
export default {...base,server:{...base.server,port:33336},plugins:[{name:'synthetic-canvas-http',configureServer(server:any){server.middlewares.use(async(req:any,res:any,next:any)=>{
 const path=new URL(req.url,'http://127.0.0.1').pathname;
 if(!path.startsWith('/service/')&&path!='/__canvas_fixture__')return next();
 const send=(data:any,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify({code:status,data}));};
 if(path==='/__canvas_fixture__')return send({requests,draft});
 if(req.method==='GET'){
  if(path.endsWith('/admin/context'))return send({authorization:'application_user',headRevision:3});
  if(path.endsWith('/node-configurations'))return send(configuration);
  if(path.endsWith('/draft'))return send(draft);
  if(path.endsWith('/publications'))return send([]);
  return send(null,404);
 }
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000000)return send(null,413);}
 const body=JSON.parse(raw);requests.push({path,body});
 if(path.endsWith('/draft')){draft={...draft,...body,revision:draft.revision+1};return send(draft);}
 if(path.includes('/publications')||path.includes('/node-configurations/'))return send({error:'forbidden'},403);
 return send(null,404);
});}}]};
