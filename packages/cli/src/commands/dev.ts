import { Flags } from '@oclif/core';
import { OpenXiangdaCommand, studioWorkspaceFlags } from '../base.js';
export default class Dev extends OpenXiangdaCommand {
  static summary = '启动连接远端平台的本地 React 和已启用的后端';
  static flags = {
    ...studioWorkspaceFlags,
    'no-open': Flags.boolean({ summary: '就绪后不自动打开浏览器' }),
    'web-port': Flags.integer({
      summary: '固定本地 Web 端口（自动化验证使用）',
      min: 1,
      max: 65535,
      helpValue: '<port>',
    }),
  };
  async run() {
    const { flags } = await this.parse(Dev);
    this.beginStudioEvents('dev');
    return this.present(
      await this.services.dev(flags.cwd, {
        noOpen: flags['no-open'],
        ...(flags['web-port'] === undefined
          ? {}
          : { webPort: flags['web-port'] }),
        ...(this.jsonEnabled()
          ? {}
          : this.machineOutputEnabled()
            ? { onStatus: message => this.emitStudioStatus(message) }
            : { onStatus: message => this.log(message) }),
      })
    );
  }
}
