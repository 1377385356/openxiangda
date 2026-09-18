import { Args, Flags } from '@oclif/core';
import { OpenXiangdaCommand, workspaceFlags } from '../base.js';

export default class Link extends OpenXiangdaCommand {
  static summary = '查看工作区平台绑定，或显式换绑到其他站点';
  static args = {
    action: Args.string({ options: ['status', 'rebind'], default: 'status' }),
  };
  static flags = {
    ...workspaceFlags,
    'base-url': Flags.string({
      summary: '换绑目标平台 service 基地址；仅 rebind 动作需要',
      helpValue: '<platform>',
    }),
  };
  async run() {
    const { args, flags } = await this.parse(Link);
    if (args.action === 'rebind') {
      if (!flags['base-url']) {
        throw new Error(
          'OPENXIANGDA_LINK_TARGET_REQUIRED: link rebind 需要 --base-url <平台地址>'
        );
      }
      return this.present(
        await this.services.rebindLink(flags.cwd, { baseUrl: flags['base-url'] })
      );
    }
    return this.present(await this.services.linkStatus(flags.cwd));
  }
}
