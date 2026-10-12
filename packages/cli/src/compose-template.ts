import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveApplicationTemplateSelection, type ApplicationTemplateSelection } from 'openxiangda-devkit-core';
import { calculateTemplateDigest, inspectWorkspaceTemplate } from './create-workspace.js';
import { resolveDefaultTemplate } from './toolchain-capsule.js';

/** Validate all choices first; materialize only into a bounded temporary tree. */
export function composeWorkspaceTemplate(input: ApplicationTemplateSelection) {
  const selected = resolveApplicationTemplateSelection(input);
  const base = resolveDefaultTemplate();
  const repositoryComponents = dirname(base);
  const componentsRoot = existsSync(join(repositoryComponents, 'frames')) ? repositoryComponents : join(dirname(base), 'template-components');
  const pieces = [
    ...Object.entries(selected.frames).map(([kind, code]) => ({kind, code, path:join(componentsRoot,'frames',kind,code)})),
    {kind:'shared',code:'resource-pages',path:join(componentsRoot,'shared')},
    {kind:'style',code:selected.style,path:join(componentsRoot,'styles',selected.style)},
    ...selected.modules.map(code=>({kind:'module',code,path:join(componentsRoot,'modules',code)})),
  ];
  // Hashing rejects symlinks, unsupported files and oversized trees before copying.
  const inspected=[{kind:'base',code:'application',...inspectWorkspaceTemplate(base)},...pieces.map(piece=>({kind:piece.kind,code:piece.code,...inspectWorkspaceTemplate(piece.path)}))];
  if(inspected.reduce((sum,item)=>sum+item.fileCount,0)>2000 || inspected.reduce((sum,item)=>sum+item.totalBytes,0)>20*1024*1024) throw new Error('TEMPLATE_LIMIT_EXCEEDED: composed template exceeds 2000 files / 20 MiB');
  const components=inspected.map(({kind,code,digest})=>({kind,code,digest}));
  const temporary = mkdtempSync(join(tmpdir(),'openxiangda-template-'));
  const root = join(temporary,'application');
  try {
    cpSync(base,root,{recursive:true,filter:path=>!path.slice(base.length).replaceAll(String.fromCharCode(92),'/').split('/').some(segment=>['node_modules','dist','coverage','.openxiangda','.turbo'].includes(segment))});
    const put=(path:string,content:string)=>{const target=join(root,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content,'utf8');};
    for(const piece of pieces){
      if(['admin','pc','mobile'].includes(piece.kind)) cpSync(piece.path,join(root,'apps/web/src/frames',piece.kind),{recursive:true});
      else if(piece.kind==='login') cpSync(piece.path,join(root,'apps/web/src/login'),{recursive:true});
      else if(piece.kind==='style') cpSync(piece.path,join(root,'apps/web/src/theme'),{recursive:true});
      else {
        for(const folder of ['pages','admin']) if(existsSync(join(piece.path,folder))) cpSync(join(piece.path,folder),join(root,'apps/web/src',folder),{recursive:true});
        if(existsSync(join(piece.path,'config.ts'))) put('modules/'+piece.code+'.config.ts',readFileSync(join(piece.path,'config.ts'),'utf8').replaceAll('__USER_SURFACE__','false'));
      }
    }
    cpSync(join(componentsRoot,'shared/ApplicationFrame.tsx'),join(root,'apps/web/src/frames/ApplicationFrame.tsx'));
    const has=(code:string)=>selected.modules.includes(code);
    const models=[...(has('time-slot')?['visits']:[]),...(has('records')?['records']:[]),...(has('party-directory')?['companies']:[])];
    for(const code of models){
      for(const file of ['FormPage.tsx','DetailPage.tsx','ListPage.tsx']){
        const target=join(root,'apps/web/src/admin',code,file);mkdirSync(dirname(target),{recursive:true});if(!existsSync(target))cpSync(join(componentsRoot,'shared',file),target);
      }
    }
    const userModels=[...(has('records')?['records']:[]),...(has('my-records')?['visits']:[])];
    for(const model of userModels){const target=join(root,'apps/web/src/pages',model,'ResourcePage.tsx');mkdirSync(dirname(target),{recursive:true});cpSync(join(componentsRoot,'shared/UserResourcePage.tsx'),target);}
    const taskRoutes=userModels.flatMap(model=>['desktop','mobile'].flatMap(device=>[
      {code:model+'-records'+(device==='mobile'?'-mobile':''),path:(device==='mobile'?'/m':'')+'/my/'+model,label:'我的记录',surface:'user',capability:'app:openxiangda-application:data:'+model+':read'},
      {code:model+'-submit'+(device==='mobile'?'-mobile':''),path:(device==='mobile'?'/m':'')+'/my/'+model+'/submit',label:'提交记录',surface:'user',capability:'app:openxiangda-application:data:'+model+':create'},
      {code:model+'-record-detail'+(device==='mobile'?'-mobile':''),path:(device==='mobile'?'/m':'')+'/my/'+model+'/:id',label:'记录详情',surface:'user',capability:'app:openxiangda-application:data:'+model+':read'},
      {code:model+'-record-edit'+(device==='mobile'?'-mobile':''),path:(device==='mobile'?'/m':'')+'/my/'+model+'/:id/edit',label:'编辑记录',surface:'user',capability:'app:openxiangda-application:data:'+model+':update'},
    ]));
    const configurations=selected.modules.filter(code=>existsSync(join(componentsRoot,'modules',code,'config.ts')));
    const variable=(code:string)=>code.replace(/-([a-z])/g,(_,letter:string)=>letter.toUpperCase())+'Module';
    const imports=configurations.map(code=>"import "+variable(code)+" from './modules/"+code+".config.js';").join('\n');
    let config=readFileSync(join(base,'openxiangda.config.ts'),'utf8');
    config=config.replace("import { defineAdminNavigation, defineOpenXiangdaApp }", "import { defineAdminNavigation, defineOpenXiangdaApp, adminNavigationGroup, adminResourcePage, resourceRoleCapabilities, currentUserDataPolicy }");
    config=imports+'\n'+config.replace('  modules: [],','  modules: ['+configurations.map(variable).join(', ')+'],');
    const permissions=models.map(code=>"...resourceRoleCapabilities('openxiangda-application', '"+code+"', "+(code==='visits'?"['read','create','update']":"'manage'")+")").join(', ');
    const ownerRules=has('time-slot')?"currentUserDataPolicy({code:'visit-owner',name:'本人邀请的来访',resourceCode:'visits',field:'created_by',roleCodes:['host'],unrestrictedRoleCodes:['front_desk']})":'';
    const host=has('time-slot')?"{code:'host',name:'邀请员工',capabilities:resourceRoleCapabilities('openxiangda-application','visits',['read','create'])},":'';
    if(models.length) config=config.replace('  modules: [',"  authz: {capabilities:[],roles:["+host+"{code:'front_desk',name:'业务管理员',capabilities:["+permissions+"]}],dataPolicies:["+ownerRules+"]},\n  modules: [");
    const navigation=models.length?"defineAdminNavigation([adminNavigationGroup('business','业务管理',["+models.map(code=>"adminResourcePage('"+code+"')").join(',')+"])])":"defineAdminNavigation([])";
    config=config.replace('admin: { navigation: defineAdminNavigation([]) }',"admin: {"+(models.length?"access:{anyOf:["+models.map(code=>"'app:openxiangda-application:data:"+code+":update'").join(',')+"]},":"")+" navigation: "+navigation+" }");
    config=config.replace('    routes: [','    routes: ['+taskRoutes.map(route=>JSON.stringify(route)).join(',')+(taskRoutes.length?',':''));
    if(has('public-entry')){
      config=config.replace('    routes: [',"    routes: [{code:'visitor-registration',path:'/visit/register',label:'来访登记',surface:'user'},");
      config=config.replace('    authentication:',"    publicAccess:{policies:[{code:'visitor-public-entry',routeCode:'visitor-registration',resourceCode:'visits',mode:'anonymous',operations:['create','draft.read','draft.update'],fields:['visitorName','company','area','arriveAt','purpose'],requiredFields:['visitorName','company','area','arriveAt','purpose'],draft:{enabled:true}}]},\n    authentication:");
    }
    put('openxiangda.config.ts',config);
    let main=readFileSync(join(base,'apps/web/src/main.tsx'),'utf8');
    const extraImports=["import { ApplicationFrame } from './frames/ApplicationFrame';","import { AdminShell } from './frames/admin/AdminShell';","import { PcFrame } from './frames/pc/PcFrame';","import { MobileFrame } from './frames/mobile/MobileFrame';","import { DesktopLogin } from './login/DesktopLogin';","import { MobileLogin } from './login/MobileLogin';","import { templateTheme } from './theme/theme';","import { DefaultApplicationTodoCenter } from 'openxiangda/react';","import './theme/tokens.css';",...models.flatMap(code=>["import { FormPage as "+code+"Form } from './admin/"+code+"/FormPage';","import { DetailPage as "+code+"Detail } from './admin/"+code+"/DetailPage';"]),...models.map(code=>"import { ListPage as "+code+"List } from './admin/"+code+"/ListPage';")];
    if(has('public-entry'))extraImports.push("import { Registration } from './pages/public-entry/Registration';");
    const userPageName=(model:string)=>model.split('-').map(part=>part[0]!.toUpperCase()+part.slice(1)).join('')+'UserPage';
    for(const model of userModels)extraImports.push("import { UserResourcePage as "+userPageName(model)+" } from './pages/"+model+"/ResourcePage';");
    const userPageBindings=userModels.flatMap(model=>['','Mobile'].flatMap(suffix=>[
      ['Records','list'],['Submit','create'],['RecordDetail','detail'],['RecordEdit','edit'],
    ].map(([code,mode])=>model+code+suffix+': withFrame(()=><'+userPageName(model)+' resourceCode={'+JSON.stringify(model)+'} mode="'+mode+'"/>)')));
    const homeModule=has('my-records')?'my-records':has('records')?'records':undefined;
    if(homeModule){extraImports.push("import { ApplicationHome } from './pages/"+homeModule+"/Home';"); main=main.replace("const ApplicationHome = () => <main>OpenXiangda 应用</main>;",'').replace("const ApplicationHomeMobile = () => <main>OpenXiangda 移动应用</main>;",'const ApplicationHomeMobile = ApplicationHome;');}
    main=main.replace('<DefaultDesktopApplicationLoginSurface {...props} />','<DesktopLogin {...props} />').replace('<DefaultMobileApplicationLoginSurface {...props} />','<MobileLogin {...props} />');
    const pages=models.map(code=>code+': { default: { '+('list: '+code+'List, ')+'form: '+code+'Form, detail: '+code+'Detail } }').join(', ');
    main=main.replace('    pages: {','    resourcePages: { '+pages+' },\n    standardUserSurfaces: { frame: { desktop: PcFrame, mobile: MobileFrame }, applicationTodoCenter: { desktop: DefaultApplicationTodoCenter, mobile: DefaultApplicationTodoCenter } },\n    pages: {');
    if(has('pass-and-checkin')){extraImports.push("import { CheckinAction } from './admin/visits/CheckinAction';"); main=main.replace('    resourcePages:',"    resources: { visits: { row: [{code:'checkin',label:'登记到访',capability:'app:openxiangda-application:data:visits:update',render:({record,refresh})=><CheckinAction record={record} refresh={refresh}/>}]} },\n    resourcePages:");}
    main=main.replace('const applicationContributions', 'const withFrame=(Page:React.ComponentType)=>()=> <ApplicationFrame><Page/></ApplicationFrame>;\nconst applicationContributions');
    main=main.replace('applicationHome: ApplicationHome,','applicationHome: withFrame(ApplicationHome),').replace('applicationHomeMobile: ApplicationHomeMobile,','applicationHomeMobile: withFrame(ApplicationHomeMobile),');
    main=main.replace('    pages: {','    pages: { '+userPageBindings.join(',')+(userPageBindings.length?',':''));
    if(has('public-entry')) main=main.replace('    pages: {','    pages: { visitorRegistration: Registration,');
    main=main.replace('      appCode={appCode}','      ui={{ admin: { shell: AdminShell }, theme: templateTheme }}\n      appCode={appCode}');
    put('apps/web/src/main.tsx',extraImports.join('\n')+'\n'+main);
    const mobileFramePath=join(root,'apps/web/src/frames/mobile/MobileFrame.tsx');
    put('apps/web/src/frames/mobile/MobileFrame.tsx',readFileSync(mobileFramePath,'utf8').replace('/m/my/visits',has('records')?'/m/my/records':has('my-records')?'/m/my/visits':'/m/home').replace('我的来访',has('records')?'我的记录':has('my-records')?'我的来访':'首页'));
    const webManifest=JSON.parse(readFileSync(join(root,'apps/web/package.json'),'utf8'));
    webManifest.scripts['check:imports']='node scripts/check-public-imports.mjs';
    webManifest.scripts.check='pnpm check:imports && '+webManifest.scripts.check;
    put('apps/web/package.json',JSON.stringify(webManifest,null,2)+'\n');
    cpSync(join(componentsRoot,'shared/check-public-imports.mjs'),join(root,'apps/web/scripts/check-public-imports.mjs'));
    put('TEMPLATE.md','# 应用源码模板\n\n场景：'+selected.scenario+'；风格：'+selected.style+'；模块：'+selected.modules.join(', ')+'。\n\n后台只有一个应用源码外壳 apps/web/src/frames/admin/AdminShell.tsx。资源列表在 apps/web/src/admin，各块和控制器从 openxiangda/resource 导入；业务后端、权限和偏好保持平台拥有。PC/移动 frame 和登录外观均可直接修改，登录行为使用 SDK 提供的 props。选项属于初始化来源，之后不会自动覆盖应用文件。\n');
    calculateTemplateDigest(root);
    for(const original of inspected){const path=original.kind==='base'?base:pieces.find(piece=>piece.kind===original.kind&&piece.code===original.code)!.path;if(calculateTemplateDigest(path)!==original.digest)throw new Error('TEMPLATE_COMPONENT_CHANGED: '+original.kind+':'+original.code);}
    return { root, components, selected, ref: 'builtin:composed:'+selected.scenario, cleanup:()=>rmSync(temporary,{recursive:true,force:true}) };
  } catch(error) { rmSync(temporary,{recursive:true,force:true}); throw error; }
}
