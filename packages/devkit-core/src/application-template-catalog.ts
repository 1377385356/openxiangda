/** Shared CLI/MCP discovery. Template selection has no remote side effects. */
export interface ApplicationTemplateItem { code: string; name: string; purpose: string; requires?: readonly string[]; }
export interface ApplicationTemplateSelection { scenario?: string; style?: string; admin?: string; pc?: string; mobile?: string; login?: string; with?: readonly string[]; without?: readonly string[]; }
export const applicationTemplateCatalog = {
  scenarios: [
    { code: 'crud', name: '表单与数据管理', purpose: '提交、数据列表和可编辑后台组成的简单应用', modules: ['records'], style: 'graphite-blue', admin: 'sidebar', pc: 'portal', mobile: 'tabbar', login: 'split' },
    { code: 'visitor', name: '访客系统', purpose: '员工邀请、前台接待和到访状态回读；不需要应用后端', modules: ['time-slot', 'pass-and-checkin', 'party-directory', 'my-records'], style: 'calm-teal', admin: 'sidebar', pc: 'portal', mobile: 'tabbar', login: 'split' },
  ],
  modules: [
    { code: 'public-entry', name: '访客自行登记', purpose: '可选无账号登记表单，使用平台匿名草稿及提交能力', requires: ['time-slot'] },
    { code: 'records', name: '普通记录', purpose: '原生表单和增删改查' },
    { code: 'time-slot', name: '来访预约', purpose: '访客、公司、区域、到访时间和目的' },
    { code: 'pass-and-checkin', name: '接待登记', purpose: '可编辑前台列表和到访登记', requires: ['time-slot'] },
    { code: 'party-directory', name: '往来单位', purpose: '公司、联系人和联系方式' },
    { code: 'my-records', name: '我的来访', purpose: '员工提交与自己邀请的访客记录', requires: ['time-slot'] },
  ] as readonly ApplicationTemplateItem[],
  frames: {
    admin: [{code:'sidebar',name:'侧边导航',purpose:'常用管理操作'}, {code:'topbar',name:'顶部导航',purpose:'少量管理模块'}],
    pc: [{code:'portal',name:'门户',purpose:'任务入口和工作台'}, {code:'workbench',name:'工作台',purpose:'紧凑业务任务'}],
    mobile: [{code:'tabbar',name:'底部导航',purpose:'常用移动任务'}, {code:'task-list',name:'任务页',purpose:'单任务沉浸操作'}],
    login: [{code:'split',name:'品牌分栏',purpose:'桌面品牌和登录表单'}, {code:'centered',name:'居中表单',purpose:'轻量应用'}],
  },
  styles: [{code:'calm-teal',name:'清爽青绿',purpose:'访客、接待和服务'}, {code:'graphite-blue',name:'石墨蓝',purpose:'后台、数据与项目'}],
} as const;
export function resolveApplicationTemplateSelection(input: ApplicationTemplateSelection) {
  const scenario = applicationTemplateCatalog.scenarios.find(item=>item.code===(input.scenario ?? 'crud'));
  if (!scenario) throw new Error('TEMPLATE_SCENARIO_UNKNOWN: '+input.scenario);
  const style = input.style ?? scenario.style;
  if (!applicationTemplateCatalog.styles.some(item=>item.code===style)) throw new Error('TEMPLATE_STYLE_UNKNOWN: '+style);
  const frames = { admin: input.admin ?? scenario.admin, pc: input.pc ?? scenario.pc, mobile: input.mobile ?? scenario.mobile, login: input.login ?? scenario.login };
  for (const [kind, code] of Object.entries(frames)) {
    if (!applicationTemplateCatalog.frames[kind as keyof typeof frames].some(item=>item.code===code)) throw new Error('TEMPLATE_FRAME_UNKNOWN: '+kind+':'+code);
  }
  const enabled = input.with || [], disabled = input.without || [];
  if (new Set(enabled).size !== enabled.length || new Set(disabled).size !== disabled.length || enabled.some(code=>disabled.includes(code))) throw new Error('TEMPLATE_MODULE_CONFLICT');
  for (const code of [...enabled,...disabled]) {
    if (!applicationTemplateCatalog.modules.some(item=>item.code===code)) throw new Error('TEMPLATE_MODULE_UNKNOWN: '+code);
  }
  const modules = [...new Set([...scenario.modules,...enabled])].filter(code=>!disabled.includes(code)).sort();
  for (const code of modules) for (const requirement of applicationTemplateCatalog.modules.find(item=>item.code===code)?.requires || []) {
    if (!modules.includes(requirement)) throw new Error('TEMPLATE_MODULE_REQUIREMENT_MISSING: '+code+' requires '+requirement);
  }
  // These two models both own the starter's user submission task.
  if (modules.includes('records') && modules.includes('time-slot')) throw new Error('TEMPLATE_MODULE_CONFLICT: records/time-slot');
  return { scenario: scenario.code, style, frames, modules, assumptions: ['页面和外壳为应用源码，可自由修改', '登录、权限和数据由平台能力提供', '默认不启用 Nest 或工作流'] };
}
