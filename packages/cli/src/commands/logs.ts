import { Args } from '@oclif/core';
import { OpenXiangdaCommand, studioWorkspaceFlags } from '../base.js';
export default class Logs extends OpenXiangdaCommand {
  static summary = '查询部署检查点和关联日志；默认最近一次部署';
  static args = { deploymentId: Args.string() };
  static flags = studioWorkspaceFlags;
  async run() {
    const { args, flags } = await this.parse(Logs);
    this.beginStudioEvents('logs');
    return this.present(
      await this.services.deploymentLogs(flags.cwd, args.deploymentId)
    );
  }
}
