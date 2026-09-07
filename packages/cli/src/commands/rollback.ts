import { Flags } from '@oclif/core';
import { OpenXiangdaCommand, studioWorkspaceFlags } from '../base.js';
export default class Rollback extends OpenXiangdaCommand {
  static summary = '以历史 AppVersion 创建回滚部署';
  static flags = {
    ...studioWorkspaceFlags,
    environment: Flags.string({ options: ['test', 'production'], default: 'test' }),
    to: Flags.string({ required: true, summary: '目标 AppVersion ID' }),
    'operation-id': Flags.string({
      summary: '回滚操作 ID；网络不确定时使用同一值精确重放',
    }),
  };
  async run() {
    const { flags } = await this.parse(Rollback);
    this.beginStudioEvents('rollback');
    const environment = flags.environment === 'production' ? 'production' : 'preproduction';
    return this.present(
      await this.services.rollback(flags.cwd, environment, flags.to, {
        ...(flags['operation-id'] ? { operationId: flags['operation-id'] } : {}),
      })
    );
  }
}
