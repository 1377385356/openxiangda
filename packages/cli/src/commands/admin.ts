import { Args, Flags } from "@oclif/core";
import { OpenXiangdaCommand, workspaceFlags } from "../base.js";
import { DEVELOPER_ENVIRONMENTS, developerEnvironment } from "openxiangda-devkit-core";
import { openSync, readSync, closeSync } from 'node:fs';

export default class Admin extends OpenXiangdaCommand {
  static summary = "查看应用管理或自助操作契约，按明确环境执行事件、密钥和通知操作";
  static args = {
    action: Args.string({ required: true, options: ["context", "workflow", "operations", "execute"] }),
    workflowCode: Args.string({ summary: "workflow 的流程代码，或 execute 的目录操作名" }),
  };
  static flags = {
    ...workspaceFlags,
    environment: Flags.string({ options: [...DEVELOPER_ENVIRONMENTS], summary: "读取默认 test；execute 必须明确指定 test 或 production" }),
    input: Flags.string({ summary: "execute 必填：目录 input 契约的 JSON 文件，或 - 从标准输入读取；最多 32 KiB，无密钥明文" }),
  };
  async run() {
    const { args, flags } = await this.parse(Admin);
    if (args.action === 'execute') {
      if (!args.workflowCode || !flags.environment || !flags.input) throw new Error('APPLICATION_OPERATION_ARGUMENT_REQUIRED: 指定操作名、--environment 和 --input；先读 admin operations --json');
      return this.present(await this.services.applicationOperation(flags.cwd, { operation: args.workflowCode, environment: flags.environment, input: readOperationInput(flags.input) }));
    }
    if (flags.input) throw new Error('APPLICATION_OPERATION_INPUT_UNEXPECTED: --input 仅用于 execute');
    if (args.action === 'operations') {
      if (args.workflowCode || flags.environment) throw new Error('APPLICATION_OPERATION_CATALOG_ARGUMENT_INVALID: operations 是本地操作目录，不接受操作名或环境');
      return this.present(await this.services.applicationOperations(flags.cwd));
    }
    const environment = developerEnvironment(flags.environment);
    if (args.action === "context") {
      if (args.workflowCode) throw new Error("ADMIN_CONTEXT_UNEXPECTED_WORKFLOW_CODE");
      return this.present(await this.services.administrationContext(flags.cwd, environment));
    }
    if (!args.workflowCode) throw new Error("WORKFLOW_CODE_REQUIRED: 请指定流程代码");
    return this.present(await this.services.workflowNodeConfigurations(flags.cwd, args.workflowCode, environment));
  }
}

/** 有界读取，避免无界 JSON 文件或标准输入进入内存。 */
export function readOperationInput(path: string) {
  const fd = path === '-' ? 0 : openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(32769);
    let size = 0;
    while (size < buffer.length) {
      const read = readSync(fd, buffer, size, buffer.length - size, null);
      if (read === 0) break;
      size += read;
    }
    if (size > 32768) throw new Error('APPLICATION_OPERATION_INPUT_TOO_LARGE: 输入最多 32 KiB');
    try { return JSON.parse(buffer.subarray(0, size).toString('utf8')) as unknown; }
    catch { throw new Error('APPLICATION_OPERATION_INPUT_INVALID: 输入必须为目录 input 契约的 JSON 对象'); }
  } finally { if (path !== '-') closeSync(fd); }
}
