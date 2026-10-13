import { Args, Flags } from '@oclif/core';
import { watchDeployment } from 'openxiangda-devkit-core';
import { OpenXiangdaCommand, workspaceFlags } from '../base.js';
export default class Status extends OpenXiangdaCommand {
  static summary = '查询 DeploymentRun 状态；默认最近一次部署';
  static args = { deploymentId: Args.string() };
  static flags = { ...workspaceFlags, 'workflow-exceptions': Flags.boolean({ summary: '只读查看指定失败 Run 冻结候选的流程例外；不会确认或重试', exclusive: ['watch'] }), watch: Flags.boolean({ summary: '持续反馈并等待原运行结束，最多 15 分钟；不会重新提交部署' }) };
  async run() {
    const { args, flags } = await this.parse(Status);
    if (flags['workflow-exceptions']) {
      if (!args.deploymentId) throw new Error('DEPLOYMENT_ID_REQUIRED: 指定原 DeploymentRun ID');
      return this.present(await this.services.deploymentWorkflowPreview(flags.cwd, args.deploymentId));
    }
    return this.present(flags.watch ? await watchDeployment(this.services, {
      ...(flags.cwd ? { root: flags.cwd } : {}), ...(args.deploymentId ? { deploymentId: args.deploymentId } : {}),
      onProgress: event => this.presentOperationProgress(event),
    }) : await this.services.deploymentStatus(flags.cwd, args.deploymentId));
  }
}
