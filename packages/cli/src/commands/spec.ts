import { Args, Flags } from "@oclif/core";
import type { AppSpecRisk } from "openxiangda-devkit-core";
import { OpenXiangdaCommand, workspaceFlags } from "../base.js";

const actions = [
  "init",
  "add-capability",
  "new",
  "context",
  "check",
  "close",
  "verify",
] as const;

export default class Spec extends OpenXiangdaCommand {
  static summary = "记录需求、设计、变更、验收与交接，按阶段检查交付条件";
  static args = {
    action: Args.string({ required: true, options: [...actions] }),
    target: Args.string({
      required: false,
      summary: "能力/变更 ID，或 context 的 ADR、DES-* 设计 selector",
    }),
  };
  static flags = {
    ...workspaceFlags,
    'history-offset': Flags.integer({ summary: '历史索引分页偏移，每页 50 条', min: 0, default: 0 }),
    deployment: Flags.string({ summary: 'verify 对应的成功测试运行 ID' }),
    evidence: Flags.string({ summary: 'verify 使用的 appspec/verification/*.json 报告路径' }),
    title: Flags.string({ summary: "能力或变更标题", helpValue: "<title>" }),
    risk: Flags.string({
      summary: "变更维护深度；默认 L1",
      options: ["L1", "L2", "L3"],
      helpValue: "<L1|L2|L3>",
    }),
    summary: Flags.string({
      summary: "问题摘要或关闭摘要",
      helpValue: "<text>",
    }),
    "current-spec": Flags.string({
      summary: "按实际结果记录当前规格已合并或不适用，不重复请求已有确认",
      options: ["merged", "not-applicable"],
      helpValue: "<merged|not-applicable>",
    }),
    capabilities: Flags.string({
      summary: "逗号分隔的 CAP-* 引用",
      helpValue: "<codes>",
    }),
    requirements: Flags.string({
      summary: "逗号分隔的 REQ-* 引用",
      helpValue: "<codes>",
    }),
    resources: Flags.string({
      summary: "逗号分隔的 2.0 Data Resource code",
      helpValue: "<codes>",
    }),
    actions: Flags.string({
      summary: "逗号分隔的 2.0 App API action code",
      helpValue: "<codes>",
    }),
  };

  async run() {
    const { args, flags } = await this.parse(Spec);
    const action = args.action as (typeof actions)[number];
    if (action === "init") return this.present(await this.services.appSpecInit(flags.cwd));
    if (action === "context") {
      return this.present(
        await this.services.appSpecContext(flags.cwd, args.target, flags['history-offset'])
      );
    }
    if (action === "check") {
      return this.present(await this.services.appSpecCheck(flags.cwd));
    }
    if (action === 'verify') return this.present(await this.services.appSpecVerify(flags.cwd, required(flags.deployment, 'APPSPEC_TEST_DEPLOYMENT_REQUIRED'), flags.evidence));
    const id = required(
      args.target,
      `APPSPEC_${action.toUpperCase().replaceAll("-", "_")}_ID_REQUIRED`
    );
    if (action === "add-capability") {
      return this.present(
        await this.services.appSpecAddCapability({
          ...(flags.cwd ? { root: flags.cwd } : {}),
          id,
          title: required(flags.title, "APPSPEC_TITLE_REQUIRED"),
          resources: csv(flags.resources),
          actions: csv(flags.actions),
        })
      );
    }
    if (action === "new") {
      return this.present(
        await this.services.appSpecNew({
          ...(flags.cwd ? { root: flags.cwd } : {}),
          id,
          title: required(flags.title, "APPSPEC_TITLE_REQUIRED"),
          ...(flags.risk ? { risk: flags.risk as AppSpecRisk } : {}),
          ...(flags.summary ? { summary: flags.summary } : {}),
          capabilities: csv(flags.capabilities),
          requirements: csv(flags.requirements),
          resources: csv(flags.resources),
          actions: csv(flags.actions),
        })
      );
    }
    if (action === "close") {
      return this.present(
        await this.services.appSpecClose({
          ...(flags.cwd ? { root: flags.cwd } : {}),
          id,
          ...(flags.summary ? { summary: flags.summary } : {}),
          ...(flags["current-spec"]
            ? {
                currentSpec: flags["current-spec"] as
                  | "merged"
                  | "not-applicable",
              }
            : {}),
        })
      );
    }
    throw new Error(`APPSPEC_ACTION_UNSUPPORTED: ${action}`);
  }
}

function csv(value: string | undefined) {
  return [
    ...new Set(
      String(value || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
    ),
  ];
}

function required(value: string | undefined, code: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(code);
  return normalized;
}
