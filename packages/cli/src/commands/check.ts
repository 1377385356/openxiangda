import { Flags } from '@oclif/core';
import { OpenXiangdaCommand, studioWorkspaceFlags } from '../base.js';
import { checkApplication, DEVELOPER_ENVIRONMENTS } from 'openxiangda-devkit-core';

export default class Check extends OpenXiangdaCommand {
  static summary = '针对目标平台确定性检查完整应用';
  static flags = {
    ...studioWorkspaceFlags,
    local: Flags.boolean({ summary: '只执行本地完整校验与构建，不验证目标平台；适用于 CI 和候选包验证', default: false }),
    environment: Flags.string({
      options: [...DEVELOPER_ENVIRONMENTS],
      default: 'test',
      summary: '兼容性预检目标；默认为 test',
    }),
  };

  async run() {
    const { flags } = await this.parse(Check);
    this.beginStudioEvents('check');
    return this.present(await checkApplication(this.services, {
      onProgress: event => this.presentOperationProgress(event),
      ...(flags.cwd ? { root: flags.cwd } : {}), environment: flags.environment, local: flags.local,
    }));
  }
}
