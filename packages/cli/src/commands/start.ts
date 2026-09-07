import { Flags } from '@oclif/core';
import { OpenXiangdaCommand, workspaceFlags } from '../base.js';

export default class Start extends OpenXiangdaCommand {
  static summary = '从当前不可变 Head 启动应用环境';
  static flags = {
    ...workspaceFlags,
    environment: Flags.string({
      options: ['test', 'production'],
      default: 'test',
    }),
  };

  async run() {
    const { flags } = await this.parse(Start);
    const environment =
      flags.environment === 'production' ? 'production' : 'preproduction';
    return this.present(
      await this.services.startEnvironment(flags.cwd, environment)
    );
  }
}

