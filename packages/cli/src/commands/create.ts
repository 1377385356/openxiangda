import { Args, Flags } from "@oclif/core";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { normalizePlatformBaseUrl, OpenXiangdaDeveloperSession, workspaceSessionPath } from "openxiangda-devkit-core";
import { OpenXiangdaCommand, cliEventFlags } from "../base.js";
import {
  createWorkspace,
  isSessionOnlyWorkspace,
  prepareWorkspace,
  readWorkspaceTemplateBinding,
  resolveWorkspaceTemplate,
  type WorkspaceInstallOutput,
} from "../create-workspace.js";
import { resolveCliToolchainCapsule } from "../toolchain-capsule.js";

export default class Create extends OpenXiangdaCommand {
  static summary = "创建并绑定 React 应用，按业务需要启用后端";
  static args = {
    directory: Args.string({ required: true, summary: "应用目录" }),
  };
  static flags = {
    ...cliEventFlags,
    "base-url": Flags.string({
      summary: "新应用的目标平台；已有工作区必须与原绑定一致",
      helpValue: "<platform>",
    }),
    "app-code": Flags.string({
      summary: "显式应用代码；默认从目录名推导",
      helpValue: "<kebab-case>",
    }),
    name: Flags.string({ summary: "显式应用名称；默认使用目录名" }),
    "template-ref": Flags.string({
      summary: "builtin:application 或已物化的本地模板目录",
      helpValue: "<ref>",
    }),
    "template-digest": Flags.string({
      summary: "模板内容摘要 sha256:<64位小写十六进制>",
      helpValue: "<sha256:digest>",
      dependsOn: ["template-ref"],
    }),
  };

  async run() {
    const { args, flags } = await this.parse(Create);
    this.beginCliEvents("create");
    const root = resolve(args.directory);
    const directoryName = basename(root);
    const appCode = flags["app-code"] || deriveAppCode(directoryName);
    const name = flags.name || directoryName;
    if (Boolean(flags["template-ref"]) !== Boolean(flags["template-digest"])) {
      throw new Error(
        "TEMPLATE_REF_DIGEST_PAIR_REQUIRED: --template-ref 与 --template-digest 必须一起提供"
      );
    }
    const templateInput = flags["template-ref"]
      ? {
          templateRef: flags["template-ref"],
          templateDigest: flags["template-digest"]!,
        }
      : {};
    const baseUrl = resolveCreatePlatform(
      root,
      appCode,
      flags["base-url"] || process.env.OPENXIANGDA_BASE_URL
    );
    const retryCommand = renderCreateRetryCommand(root, {
      baseUrl,
      ...(flags["app-code"] ? { appCode } : {}),
      ...(flags.name ? { name } : {}),
      ...templateInput,
    });
    const installOutput: WorkspaceInstallOutput = this.machineOutputEnabled()
      ? "capture"
      : "inherit";

    this.emitCliStatus("正在验证目标平台开发者会话", { stage: "identity", baseUrl });
    // 目标目录尚不存在时（首次创建），按既有的工作区发现规则向上继承会话；
    // sessionWorkspaceRoot 会在 .git 边界停住，不会跨仓借用账号。
    const session =
      (await OpenXiangdaDeveloperSession.load({ sessionPath: workspaceSessionPath(root) })) ??
      (await OpenXiangdaDeveloperSession.load());
    if (!session) {
      throw new Error(
        `OPENXIANGDA_AUTH_REQUIRED: 未找到可用的平台登录态：先运行 openxiangda login --base-url '${baseUrl.replaceAll("'", `'"'"'`)}'（或在目标目录/父目录完成登录）`
      );
    }
    session.assertPlatform(baseUrl);
    await session.whoami();

    const reusable = existsSync(root) && readdirSync(root).length > 0 && !isSessionOnlyWorkspace(root);
    this.emitCliStatus(
      reusable ? "正在恢复已有工作区" : "正在生成应用工作区",
      { stage: "workspace", reusable }
    );
    const workspace = reusable
      ? await this.reuseWorkspace(root, appCode, name, installOutput, {
          explicitName: Boolean(flags.name),
          ...templateInput,
        })
      : await createWorkspace({
          directory: root,
          appCode,
          name,
          installOutput,
          ...templateInput,
        });
    this.emitCliStatus("正在绑定平台应用", { stage: "link" });
    const link = await this.services.linkApplication(root, {
      baseUrl: session.baseUrl,
    });
    if (!link.ok) return this.present({ ...link, operation: "create" });
    this.emitCliStatus("正在幂等初始化平台应用", { stage: "provision" });
    const provision = await this.services.provisionApplication(root);
    if (!provision.ok) {
      return this.present({
        ...provision,
        operation: "create",
        nextActions: [
          {
            code: "create.retry",
            label: "重试幂等初始化",
            command: retryCommand,
          },
        ],
      });
    }

    const source = provision.data?.sourceRepository
      ? await this.services.setupSource(root, { initialCommit: true })
      : undefined;
    return this.present({
      ok: true,
      operation: "create",
      workspace: { appCode, name, root },
      data: {
        workspace,
        ...(source ? { source: source.data } : {}),
        link: link.data,
        provision: provision.data,
      },
      diagnostics: [],
      nextActions: [
        {
          code: "dev",
          label: "启动连接开发",
          command: `openxiangda dev --cwd ${root}`,
        },
      ],
    });
  }

  private async reuseWorkspace(
    root: string,
    appCode: string,
    name: string,
    installOutput: WorkspaceInstallOutput,
    options: {
      explicitName: boolean;
      templateRef?: string;
      templateDigest?: string;
    }
  ) {
    const context = await this.services.workspaceContext(root);
    if (context.workspace.appCode !== appCode) {
      throw new Error(
        `TARGET_DIRECTORY_APP_MISMATCH: 目录应用代码 ${context.workspace.appCode} 与推导值 ${appCode} 不一致`
      );
    }
    if (
      options.explicitName &&
      context.workspace.name &&
      context.workspace.name !== name
    ) {
      throw new Error(
        `TARGET_DIRECTORY_NAME_MISMATCH: 目录应用名称 ${context.workspace.name} 与显式名称 ${name} 不一致`
      );
    }
    const storedTemplate = readWorkspaceTemplateBinding(root);
    let requestedTemplate: ReturnType<typeof resolveWorkspaceTemplate> | null =
      null;
    if (options.templateRef && options.templateDigest) {
      requestedTemplate = resolveWorkspaceTemplate({
        templateRef: options.templateRef,
        templateDigest: options.templateDigest,
      });
      if (!storedTemplate) {
        throw new Error(
          "WORKSPACE_TEMPLATE_BINDING_REQUIRED: 已有工作区缺少可验证的模板绑定"
        );
      }
      if (
        storedTemplate.ref !== requestedTemplate.binding.ref ||
        storedTemplate.digest !== requestedTemplate.binding.digest
      ) {
        throw new Error(
          "WORKSPACE_TEMPLATE_BINDING_MISMATCH: 已有工作区与请求模板不一致"
        );
      }
    }
    await prepareWorkspace(root, {
      installOutput,
      ...(requestedTemplate
        ? {
            toolchainCapsule: resolveCliToolchainCapsule(
              requestedTemplate.root
            ),
          }
        : {}),
    });
    return {
      root,
      appCode,
      name: context.workspace.name || name,
      installed: true,
      generated: true,
      reused: true,
      template: storedTemplate,
    };
  }
}

function resolveCreatePlatform(
  root: string,
  appType: string,
  requestedBaseUrl: string | undefined
) {
  const requested = requestedBaseUrl
    ? normalizePlatformBaseUrl(requestedBaseUrl)
    : undefined;
  const path = join(root, ".openxiangda", "link.json");
  if (!existsSync(path)) {
    if (requested) return requested;
    throw Object.assign(
      new Error("OPENXIANGDA_CREATE_PLATFORM_REQUIRED: 新建应用必须通过 --base-url <平台地址> 指定目标；先登录同一平台，不能沿用旧登录态猜测站点"),
      { code: "OPENXIANGDA_CREATE_PLATFORM_REQUIRED", retryable: false, data: { pointer: "/baseUrl" } }
    );
  }
  let link: unknown;
  try {
    link = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw localLinkError("已有 OpenXiangda link 不是有效 JSON");
  }
  if (!link || typeof link !== "object" || Array.isArray(link)) {
    throw localLinkError("已有 OpenXiangda link 结构无效");
  }
  const value = link as Record<string, unknown>;
  if (
    value.schemaVersion !== 2 ||
    value.appCode !== appType ||
    typeof value.baseUrl !== "string" || !value.baseUrl
  ) {
    throw localLinkError("已有 OpenXiangda link 与本次应用身份不一致");
  }
  const linked = normalizePlatformBaseUrl(value.baseUrl);
  if (requested && requested !== linked) {
    throw localLinkError(`已有工作区绑定 ${linked}，与请求目标 ${requested} 不一致；create 不能重绑到其他站点`);
  }
  return linked;
}

function localLinkError(message: string) {
  const code = "OPENXIANGDA_WORKSPACE_LINK_MISMATCH";
  return Object.assign(
    new Error(`${code}: ${message}`),
    {
      code,
      retryable: false,
      data: { pointer: "/link" },
    }
  );
}

function deriveAppCode(directoryName: string) {
  const code = directoryName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "");
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(code)) {
    throw new Error(
      "APP_CODE_INVALID: 目录名必须能推导出以英文字母开头的 kebab-case 应用代码"
    );
  }
  return code;
}

function renderCreateRetryCommand(
  root: string,
  input: {
    baseUrl: string;
    appCode?: string;
    name?: string;
    templateRef?: string;
    templateDigest?: string;
  }
) {
  const parts = ["openxiangda", "create", shellArgument(root), "--base-url", shellArgument(input.baseUrl)];
  if (input.appCode) parts.push("--app-code", shellArgument(input.appCode));
  if (input.name) parts.push("--name", shellArgument(input.name));
  if (input.templateRef) {
    parts.push("--template-ref", shellArgument(input.templateRef));
  }
  if (input.templateDigest) {
    parts.push("--template-digest", shellArgument(input.templateDigest));
  }
  return parts.join(" ");
}

function shellArgument(value: string) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}
