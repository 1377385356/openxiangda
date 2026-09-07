import { OpenXiangdaCommand, workspaceFlags } from '../base.js';

export default class Context extends OpenXiangdaCommand {
  static summary = '只读查看当前工作区、工具链版本与平台绑定';
  static flags = workspaceFlags;
  async run() {
    const { flags } = await this.parse(Context);
    return this.present(await this.services.workspaceContext(flags.cwd));
  }
}
