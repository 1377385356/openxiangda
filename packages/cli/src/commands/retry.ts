import { Args } from '@oclif/core';
import { OpenXiangdaCommand, workspaceFlags } from '../base.js';

export default class Retry extends OpenXiangdaCommand {
  static summary = '显式重试一个 retryable 的失败 DeploymentRun';
  static args = { deploymentId: Args.string({ required: true }) };
  static flags = workspaceFlags;

  async run() {
    const { args, flags } = await this.parse(Retry);
    return this.present(
      await this.services.retry(flags.cwd, args.deploymentId)
    );
  }
}

