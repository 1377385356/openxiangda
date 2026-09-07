import { Flags } from "@oclif/core";
import { OpenXiangdaCommand, studioWorkspaceFlags } from "../base.js";
import { deployApplication, DEVELOPER_ENVIRONMENTS } from 'openxiangda-devkit-core';
export default class Deploy extends OpenXiangdaCommand {
  static summary = "部署到测试环境，或显式复用测试版本部署生产";
  static flags = {
    ...studioWorkspaceFlags,
    environment: Flags.string({
      options: [...DEVELOPER_ENVIRONMENTS],
      default: "test",
      summary: "目标环境；默认为 test",
    }),
    strategy: Flags.string({ options: ['rolling', 'maintenance-replace'], summary: '仅 TEST；maintenance-replace 明确允许停机，失败时由平台恢复旧后端' }),
    from: Flags.string({
      summary: "生产部署复用的成功测试 DeploymentRun ID",
      dependsOn: ["environment"],
    }),
    "environment-id": Flags.string({ summary: '测试环境 ID；通常由绑定自动确定' }),
    "idempotency-key": Flags.string({ summary: '测试部署幂等键；省略时从不可变包摘要派生' }),
    "dry-run": Flags.boolean({ summary: '只读预览部署或生产晋级，不构建、不上传、不提交' }),
    wait: Flags.boolean({ default: true, allowNo: true, summary: '默认持续反馈并等待平台完成，最多 15 分钟；--no-wait 只提交' }),
  };
  async run() {
    const { flags } = await this.parse(Deploy);
    this.beginStudioEvents("deploy");
    return this.present(
      await deployApplication(this.services, {
        onProgress: event => this.presentOperationProgress(event),
        ...(flags.cwd ? { root: flags.cwd } : {}),
        environment: flags.environment,
        ...(flags.strategy ? { deploymentStrategy: flags.strategy as 'rolling' | 'maintenance-replace' } : {}),
        ...(flags.from ? { from: flags.from } : {}),
        dryRun: flags['dry-run'],
        wait: flags.wait,
        ...(flags["environment-id"]
          ? { environmentId: flags["environment-id"] }
          : {}),
        ...(flags["idempotency-key"]
          ? { idempotencyKey: flags["idempotency-key"] }
          : {}),
      })
    );
  }
}
