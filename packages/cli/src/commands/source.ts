import { Args, Flags } from '@oclif/core';
import { OpenXiangdaCommand, workspaceFlags } from '../base.js';

export default class Source extends OpenXiangdaCommand {
  static summary = '配置应用源码仓库或提交推送代码';
  static args = {
    action: Args.string({ options: ['status', 'setup', 'push', 'resolve', 'clone'], default: 'status' }),
    repository: Args.string(), directory: Args.string(),
  };
  static flags = {
    ...workspaceFlags,
    'base-url': Flags.string({ summary: '解析或克隆时明确指定平台地址' }),
    branch: Flags.string({ summary: '克隆分支；省略时使用仓库实际默认分支' }),
    import: Flags.boolean({ summary: '将原 origin 保留为 external-source，改用平台仓库' }),
    message: Flags.string({ char: 'm', summary: '提交当前更改后推送；省略时只推送已有提交' }),
  };
  async run() {
    const { args, flags } = await this.parse(Source);
    if (['resolve', 'clone'].includes(args.action)) {
      if (!flags['base-url'] || !args.repository || (args.action === 'clone' && !args.directory))
        throw new Error('APPLICATION_SOURCE_ARGUMENTS_REQUIRED: source resolve <仓库URL> 或 source clone <仓库URL> <目录>，并提供 --base-url <平台>');
      return this.present(await this.services.sourceFromUrl({ baseUrl: flags['base-url'], repository: args.repository,
        ...(args.action === 'clone' && args.directory ? { directory: args.directory } : {}),
        ...(flags.branch ? { branch: flags.branch } : {}) }));
    }
    if (args.action === 'setup') return this.present(await this.services.setupSource(flags.cwd, { importOrigin: flags.import, initialCommit: true }));
    if (args.action === 'push') return this.present(await this.services.pushSource(flags.cwd, flags.message));
    return this.present(await this.services.sourceStatus(flags.cwd));
  }
}
