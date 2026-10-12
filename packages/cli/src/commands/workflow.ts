import { Args,Flags } from '@oclif/core';
import { DEVELOPER_ENVIRONMENTS,developerEnvironment } from 'openxiangda-devkit-core';
import { OpenXiangdaCommand,workspaceFlags } from '../base.js';
export default class Workflow extends OpenXiangdaCommand {
  static summary='导出流程、导入源码、规划版本登记、查看状态并同步到目标环境';
  static args={ action: Args.string({ required: true,options: ['export','import','plan-registration','status','sync'] }),value: Args.string({ summary: '流程代码或 import 的导出文件路径' }) };
  static flags={ ...workspaceFlags,environment: Flags.string({ options: [...DEVELOPER_ENVIRONMENTS],summary: '读取目标环境，默认 test' }),out: Flags.string({ summary: 'export 的工作区输出文件' }),to: Flags.string({ options: ['source',...DEVELOPER_ENVIRONMENTS],summary: 'import 指定 source；sync 指定目标环境' }),from: Flags.string({ options: [...DEVELOPER_ENVIRONMENTS],summary: 'sync 的源环境' }),'expected-source-head': Flags.integer({ min: 1,summary: 'sync 源流程当前版本修订号，重试保留相同值' }),'expected-target-head': Flags.integer({ min: 1,summary: 'sync 目标流程当前版本修订号' }),'operation-id': Flags.string({ summary: '同步幂等操作标识，重试保留相同值' }),reason: Flags.string({ summary: '同步原因' }),'new-only': Flags.boolean({ default: false,summary: '仅新申请生效，默认同时更新在途和新申请' }),'acknowledge-exceptions': Flags.boolean({ default: false,summary: '确认不兼容的在途申请保持原版本' }),'copy-handling-defaults': Flags.boolean({ default: false,summary: '复制办理模式、按钮设置及角色覆盖；保留两边的指定人员' }),write: Flags.boolean({ default: false,summary: '将服务器只读规划的版本数字写入源码；环境观察不进入包' }),'adopt-handling-defaults': Flags.boolean({ default: false,summary: '把办理模式、按钮开关和文案作为源码默认值；不导入人员覆盖' }) };
  async run() {
    const { args,flags }=await this.parse(Workflow);
    if (args.action === 'sync') {
      if (!args.value || !flags.from || !flags.to || flags.to === 'source' || !flags['expected-source-head'] || !flags['expected-target-head'] || !flags['operation-id'] || !flags.reason || flags.environment || flags.out || flags.write || flags['adopt-handling-defaults']) throw new Error('WORKFLOW_SYNC_ARGUMENT_REQUIRED: 指定流程代码、--from、--to、--expected-source-head、--expected-target-head、--operation-id、--reason');
      return this.present(await this.services.workflowSync(flags.cwd,args.value,{ fromEnvironment: developerEnvironment(flags.from),toEnvironment: developerEnvironment(flags.to),expectedSourceHeadRevision: flags['expected-source-head'],expectedTargetHeadRevision: flags['expected-target-head'],operationId: flags['operation-id'],reason: flags.reason,scope: flags['new-only'] ? 'new_only' : 'running_and_new',acknowledgeExceptions: flags['acknowledge-exceptions'],copyHandlingDefaults: flags['copy-handling-defaults'] }));
    }
    if (flags.from || flags['expected-source-head'] || flags['expected-target-head'] || flags['operation-id'] || flags.reason || flags['new-only'] || flags['acknowledge-exceptions'] || flags['copy-handling-defaults']) throw new Error('WORKFLOW_SOURCE_ARGUMENT_INVALID');
    if (args.action === 'export') {
      if (!args.value || !flags.out) throw new Error('WORKFLOW_EXPORT_ARGUMENT_REQUIRED: 指定流程代码和 --out');
      return this.present(await this.services.workflowExport(flags.cwd,args.value,developerEnvironment(flags.environment),flags.out));
    }
    if (args.action === 'import') {
      if (!args.value || flags.to !== 'source') throw new Error('WORKFLOW_IMPORT_ARGUMENT_REQUIRED: 指定导出文件和 --to source');
      if (flags.environment || flags.out || flags.write) throw new Error('WORKFLOW_IMPORT_ARGUMENT_INVALID');
      return this.present(await this.services.workflowImport(flags.cwd,args.value,flags['adopt-handling-defaults']));
    }
    if (flags.to || flags.out || flags['adopt-handling-defaults']) throw new Error('WORKFLOW_SOURCE_ARGUMENT_INVALID');
    if (args.action === 'plan-registration') {
      if (args.value) throw new Error('WORKFLOW_PLAN_ARGUMENT_INVALID');
      return this.present(await this.services.workflowPlanRegistration(flags.cwd,developerEnvironment(flags.environment),flags.write));
    }
    if (flags.write) throw new Error('WORKFLOW_STATUS_ARGUMENT_INVALID');
    return this.present(await this.services.workflowStatus(flags.cwd,developerEnvironment(flags.environment),args.value));
  }
}
