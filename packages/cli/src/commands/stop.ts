import { Flags } from '@oclif/core';
import { OpenXiangdaCommand, workspaceFlags } from '../base.js';

export default class Stop extends OpenXiangdaCommand {
  static summary = '将应用环境缩容为零并保留数据和配置';
  static flags = {
    ...workspaceFlags,
    environment: Flags.string({
      options: ['test', 'production'],
      default: 'test',
    }),
  };

  async run() {
    const { flags } = await this.parse(Stop);
    const environment =
      flags.environment === 'production' ? 'production' : 'preproduction';
    return this.present(
      await this.services.stopEnvironment(flags.cwd, environment)
    );
  }
}

