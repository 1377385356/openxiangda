import { Args, Flags } from '@oclif/core';
import { OpenXiangdaCommand, workspaceFlags } from '../base.js';

export default class Source extends OpenXiangdaCommand {
  static summary = '配置应用源码仓库或提交推送代码';
  static args = { action: Args.string({ options: ['status', 'setup', 'push'], default: 'status' }) };
  static flags = {
    ...workspaceFlags,
    import: Flags.boolean({ summary: '将原 origin 保留为 external-source，改用平台仓库' }),
    message: Flags.string({ char: 'm', summary: '提交当前更改后推送；省略时只推送已有提交' }),
  };
  async run() {
    const { args, flags } = await this.parse(Source);
    if (args.action === 'setup') return this.present(await this.services.setupSource(flags.cwd, { importOrigin: flags.import, initialCommit: true }));
    if (args.action === 'push') return this.present(await this.services.pushSource(flags.cwd, flags.message));
    return this.present(await this.services.sourceStatus(flags.cwd));
  }
}
