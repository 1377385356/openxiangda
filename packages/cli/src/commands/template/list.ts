import { applicationTemplateCatalog } from 'openxiangda-devkit-core';
import { OpenXiangdaCommand } from '../../base.js';
export default class TemplateList extends OpenXiangdaCommand { static summary = '列出场景、模块、四类源码模板和风格'; async run() { return this.present({ok:true,operation:'template.list',workspace:{appCode:'unbound',root:process.cwd()},data:applicationTemplateCatalog,diagnostics:[],nextActions:[]}); } }
