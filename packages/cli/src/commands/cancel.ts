import { Args } from '@oclif/core';
import { OpenXiangdaCommand, workspaceFlags } from '../base.js';

export default class Cancel extends OpenXiangdaCommand {
  static summary = '幂等取消尚未提交激活的 DeploymentRun';
  static args = { deploymentId: Args.string({ required: true }) };
  static flags = workspaceFlags;

  async run() {
    const { args, flags } = await this.parse(Cancel);
    return this.present(
      await this.services.cancel(flags.cwd, args.deploymentId)
    );
  }
}

