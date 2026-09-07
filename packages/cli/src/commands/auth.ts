import { Args, Flags } from '@oclif/core';
import { developerAuthorizationStatus } from 'openxiangda-devkit-core';
import { OpenXiangdaCommand } from '../base.js';

export default class Auth extends OpenXiangdaCommand {
  static summary = '只读核验指定平台的当前授权，不启动登录或刷新会话';
  static args = { action: Args.string({ required: true, options: ['status'] }) };
  static flags = { 'base-url': Flags.string({ required: true, summary: '明确指定目标平台地址' }) };

  async run() {
    const { flags } = await this.parse(Auth);
    return this.present(await developerAuthorizationStatus({ baseUrl: flags['base-url'] }));
  }
}
