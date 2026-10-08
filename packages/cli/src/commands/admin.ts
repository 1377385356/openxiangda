import { Args, Flags } from "@oclif/core";
import { OpenXiangdaCommand, workspaceFlags } from "../base.js";
import { DEVELOPER_ENVIRONMENTS, developerEnvironment } from "openxiangda-devkit-core";

export default class Admin extends OpenXiangdaCommand {
  static summary = "只读查看当前应用管理能力和流程节点运行配置";
  static args = {
    action: Args.string({ required: true, options: ["context", "workflow"] }),
    workflowCode: Args.string({ summary: "workflow 操作需要指定流程代码" }),
  };
  static flags = {
    ...workspaceFlags,
    environment: Flags.string({ options: [...DEVELOPER_ENVIRONMENTS], default: "test", summary: "读取环境；默认测试环境" }),
  };
  async run() {
    const { args, flags } = await this.parse(Admin);
    const environment = developerEnvironment(flags.environment);
    if (args.action === "context") {
      if (args.workflowCode) throw new Error("ADMIN_CONTEXT_UNEXPECTED_WORKFLOW_CODE");
      return this.present(await this.services.administrationContext(flags.cwd, environment));
    }
    if (!args.workflowCode) throw new Error("WORKFLOW_CODE_REQUIRED: 请指定流程代码");
    return this.present(await this.services.workflowNodeConfigurations(flags.cwd, args.workflowCode, environment));
  }
}
