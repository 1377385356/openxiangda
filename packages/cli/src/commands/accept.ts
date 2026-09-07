import { Flags } from "@oclif/core";
import { OpenXiangdaCommand, workspaceFlags } from "../base.js";

export default class Accept extends OpenXiangdaCommand {
  static summary = "手动准备真实预发身份验收；不属于发布门禁";
  static flags = {
    ...workspaceFlags,
    plan: Flags.string({
      required: true,
      summary: "预发身份验收计划 JSON 文件",
      helpValue: "<file>",
    }),
  };

  async run() {
    const { flags } = await this.parse(Accept);
    return this.present(
      await this.services.accept({
        ...(flags.cwd ? { root: flags.cwd } : {}),
        planPath: flags.plan,
      })
    );
  }
}
