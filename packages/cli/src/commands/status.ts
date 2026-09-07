import { Args, Flags } from '@oclif/core';
import { watchDeployment } from 'openxiangda-devkit-core';
import { OpenXiangdaCommand, workspaceFlags } from '../base.js';
export default class Status extends OpenXiangdaCommand {
  static summary = '查询 DeploymentRun 状态；默认最近一次部署';
  static args = { deploymentId: Args.string() };
  static flags = { ...workspaceFlags, watch: Flags.boolean({ summary: '持续反馈并等待原运行结束，最多 15 分钟；不会重新提交部署' }) };
  async run() {
    const { args, flags } = await this.parse(Status);
    return this.present(flags.watch ? await watchDeployment(this.services, {
      ...(flags.cwd ? { root: flags.cwd } : {}), ...(args.deploymentId ? { deploymentId: args.deploymentId } : {}),
      onProgress: event => this.presentOperationProgress(event),
    }) : await this.services.deploymentStatus(flags.cwd, args.deploymentId));
  }
}
