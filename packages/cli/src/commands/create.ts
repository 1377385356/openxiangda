import { Args, Flags } from "@oclif/core";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { normalizePlatformBaseUrl, OpenXiangdaDeveloperSession } from "openxiangda-devkit-core";
import {
  OPENXIANGDA_COMPILER_CONTRACT_VERSION,
  STUDIO_APPLICATION_AUTHORITY,
  STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION,
  STUDIO_WORKSPACE_PROTOCOL_VERSION,
  type StudioWorkspaceCompilerSummary,
  type StudioWorkspaceInitialization,
} from "openxiangda-contracts";
import { OpenXiangdaCommand, studioEventFlags } from "../base.js";
import {
  createWorkspace,
  ensureStudioWorkspaceBinding,
  isPlatformUuid,
  prepareWorkspace,
  readStudioWorkspaceBinding,
  readWorkspaceTemplateBinding,
  resolveWorkspaceTemplate,
  studioWorkspaceBindingDigest,
  studioWorkspaceInitializationDigest,
  type WorkspaceInstallOutput,
} from "../create-workspace.js";
import { resolveCliToolchainCapsule } from "../toolchain-capsule.js";

export default class Create extends OpenXiangdaCommand {
  static summary = "创建并绑定 React 应用，按业务需要启用后端";
  static args = {
    directory: Args.string({ required: true, summary: "应用目录" }),
  };
  static flags = {
    ...studioEventFlags,
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
    "studio-project-id": Flags.string({
      summary: "站点 Project UUID；启用站点权威的 Studio 初始化模式",
      helpValue: "<uuid>",
    }),
    "provisioning-run-id": Flags.string({
      summary: "站点 ProjectProvisioningRun UUID",
      helpValue: "<uuid>",
    }),
  };

  async run() {
    const { args, flags } = await this.parse(Create);
    this.beginStudioEvents("create");
    const root = resolve(args.directory);
    const directoryName = basename(root);
    const appCode = flags["app-code"] || deriveAppCode(directoryName);
    const name = flags.name || directoryName;
    const studioMode = Boolean(
      flags["studio-project-id"] || flags["provisioning-run-id"]
    );
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
    if (studioMode) {
      assertStudioCreateInput({
        appCode: flags["app-code"],
        name: flags.name,
        templateRef: flags["template-ref"],
        templateDigest: flags["template-digest"],
        projectId: flags["studio-project-id"],
        provisioningRunId: flags["provisioning-run-id"],
        jsonEvents: flags["json-events"],
        runId: flags["run-id"],
      });
    }
    const baseUrl = resolveCreatePlatform(
      root,
      appCode,
      flags["base-url"] || process.env.OPENXIANGDA_BASE_URL,
      studioMode
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

    this.emitStudioStatus("正在验证目标平台开发者会话", { stage: "identity", baseUrl });
    const session = await OpenXiangdaDeveloperSession.load();
    if (!session) {
      throw new Error(
        "OPENXIANGDA_AUTH_REQUIRED: 先运行 openxiangda login --base-url <platform>"
      );
    }
    session.assertPlatform(baseUrl);
    if (studioMode) assertStudioSiteBaseUrl(baseUrl);
    await session.whoami();

    const reusable = existsSync(root) && readdirSync(root).length > 0;
    this.emitStudioStatus(
      reusable ? "正在恢复已有工作区" : "正在生成应用工作区",
      { stage: "workspace", reusable }
    );
    let workspace;
    if (studioMode) {
      const resolvedTemplate = resolveWorkspaceTemplate(templateInput);
      if (reusable) {
        const storedBinding = readStudioWorkspaceBinding(root);
        if (!storedBinding) {
          throw Object.assign(
            new Error(
              "STUDIO_WORKSPACE_BINDING_REQUIRED: 非空目录必须已有同一 Studio 初始化绑定"
            ),
            {
              code: "STUDIO_WORKSPACE_BINDING_REQUIRED",
              retryable: false,
              data: { pointer: "/studioBinding" },
            }
          );
        }
        ensureStudioWorkspaceBinding(root, {
          siteBaseUrl: session.baseUrl,
          projectId: flags["studio-project-id"]!,
          provisioningRunId: flags["provisioning-run-id"]!,
          appType: appCode,
          appName: name,
          template: resolvedTemplate.binding,
        });
        if (storedBinding.compiler) {
          ensureStudioWorkspaceBinding(root, {
            siteBaseUrl: session.baseUrl,
            projectId: flags["studio-project-id"]!,
            provisioningRunId: flags["provisioning-run-id"]!,
            appType: appCode,
            appName: name,
            template: resolvedTemplate.binding,
            compiler: await this.studioCompilerSummary(root),
          });
        }
        workspace = await this.reuseWorkspace(
          root,
          appCode,
          name,
          installOutput,
          { explicitName: true, ...templateInput }
        );
      } else {
        const prepared = await createWorkspace({
          directory: root,
          appCode,
          name,
          install: false,
          installOutput,
          ...templateInput,
        });
        ensureStudioWorkspaceBinding(root, {
          siteBaseUrl: session.baseUrl,
          projectId: flags["studio-project-id"]!,
          provisioningRunId: flags["provisioning-run-id"]!,
          appType: appCode,
          appName: name,
          template: prepared.template,
        });
        await prepareWorkspace(root, {
          installOutput,
          toolchainCapsule: resolveCliToolchainCapsule(resolvedTemplate.root),
        });
        workspace = {
          ...prepared,
          installed: true,
          generated: true,
          generationDeferred: false,
        };
      }
    } else {
      workspace = reusable
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
    }
    this.emitStudioStatus("正在绑定平台应用", { stage: "link" });
    const link = await this.services.linkApplication(root, {
      baseUrl: session.baseUrl,
    });
    if (!link.ok) return this.present({ ...link, operation: "create" });
    if (studioMode) {
      this.emitStudioStatus("正在生成可核对的工作区摘要", {
        stage: "compiler-summary",
      });
      const compiler = await this.studioCompilerSummary(root);
      const binding = ensureStudioWorkspaceBinding(root, {
        siteBaseUrl: session.baseUrl,
        projectId: flags["studio-project-id"]!,
        provisioningRunId: flags["provisioning-run-id"]!,
        appType: appCode,
        appName: name,
        template: workspace.template!,
        compiler,
      });
      const initializationFacts: Omit<
        StudioWorkspaceInitialization,
        "workspaceDigest"
      > = {
        schemaVersion: STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION,
        applicationAuthority: STUDIO_APPLICATION_AUTHORITY,
        siteBaseUrl: binding.siteBaseUrl,
        projectId: binding.projectId,
        provisioningRunId: binding.provisioningRunId,
        appType: binding.appType,
        appName: binding.appName,
        workspace: {
          reused: "reused" in workspace && workspace.reused === true,
        },
        cliVersion: this.config.version,
        protocolVersion: STUDIO_WORKSPACE_PROTOCOL_VERSION,
        template: binding.template,
        compiler,
        bindingDigest: studioWorkspaceBindingDigest(binding),
      };
      const initialization: StudioWorkspaceInitialization = {
        ...initializationFacts,
        workspaceDigest:
          studioWorkspaceInitializationDigest(initializationFacts),
      };
      if (!link.data) {
        throw new Error("STUDIO_LINK_RESULT_MISSING: 平台绑定结果缺少 data");
      }
      const { path: _localLinkPath, ...linkSummary } = link.data;
      return this.present({
        ok: true,
        operation: "create",
        workspace: { appCode, name, root },
        data: {
          workspace: {
            appType: appCode,
            appName: name,
            installed: workspace.installed,
            generated: workspace.generated,
            reused: "reused" in workspace && workspace.reused === true,
            template: binding.template,
            compiler,
          },
          link: linkSummary,
          provision: null,
          studioInitialization: initialization,
        },
        diagnostics: [],
        nextActions: [
          {
            code: "dev",
            label: "启动连接开发",
            command: "openxiangda dev --cwd <workspace>",
          },
        ],
      });
    }
    this.emitStudioStatus("正在幂等初始化平台应用", { stage: "provision" });
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

  private async studioCompilerSummary(
    root: string
  ): Promise<StudioWorkspaceCompilerSummary> {
    const [context, description] = await Promise.all([
      this.services.workspaceContext(root),
      this.services.contractDescribe(root),
    ]);
    if (!context.ok || !context.data) {
      throw devkitResultError("STUDIO_WORKSPACE_CONTEXT_FAILED", context);
    }
    if (!description.ok || !description.data) {
      throw devkitResultError("STUDIO_COMPILER_SUMMARY_FAILED", description);
    }
    return {
      toolchainVersion: context.data.toolchain.version,
      contractVersion: context.data.toolchain.contractVersion,
      compilerContractVersion: OPENXIANGDA_COMPILER_CONTRACT_VERSION,
      configurationDigest: description.data.configDigest,
      contractDigest: description.data.contractDigest,
      aiCatalogDigest: description.data.aiCatalogDigest,
    };
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
  requestedBaseUrl: string | undefined,
  studioMode: boolean
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
    throw localLinkError("已有 OpenXiangda link 不是有效 JSON", studioMode);
  }
  if (!link || typeof link !== "object" || Array.isArray(link)) {
    throw localLinkError("已有 OpenXiangda link 结构无效", studioMode);
  }
  const value = link as Record<string, unknown>;
  if (
    value.schemaVersion !== 2 ||
    value.appCode !== appType ||
    typeof value.baseUrl !== "string" || !value.baseUrl
  ) {
    throw localLinkError("已有 OpenXiangda link 与本次应用身份不一致", studioMode);
  }
  const linked = normalizePlatformBaseUrl(value.baseUrl);
  if (requested && requested !== linked) {
    throw localLinkError(`已有工作区绑定 ${linked}，与请求目标 ${requested} 不一致；create 不能重绑到其他站点`, studioMode);
  }
  return linked;
}

function localLinkError(message: string, studioMode: boolean) {
  const code = studioMode ? "STUDIO_WORKSPACE_LINK_MISMATCH" : "OPENXIANGDA_WORKSPACE_LINK_MISMATCH";
  return Object.assign(
    new Error(`${code}: ${message}`),
    {
      code,
      retryable: false,
      data: { pointer: "/link" },
    }
  );
}

function devkitResultError(
  fallbackCode: string,
  result: {
    diagnostics: Array<{
      code: string;
      message: string;
      retryable: boolean;
      path?: string;
    }>;
  }
) {
  const diagnostic = result.diagnostics.find(item => item.code) || {
    code: fallbackCode,
    message: fallbackCode,
    retryable: false,
  };
  return Object.assign(
    new Error(`${diagnostic.code}: ${diagnostic.message}`),
    {
      code: diagnostic.code,
      retryable: diagnostic.retryable,
      data: { ...(diagnostic.path ? { pointer: diagnostic.path } : {}) },
    }
  );
}

function assertStudioCreateInput(input: {
  appCode: string | undefined;
  name: string | undefined;
  templateRef: string | undefined;
  templateDigest: string | undefined;
  projectId: string | undefined;
  provisioningRunId: string | undefined;
  jsonEvents: boolean;
  runId: string | undefined;
}) {
  const missing = [
    ["--app-code", input.appCode],
    ["--name", input.name],
    ["--template-ref", input.templateRef],
    ["--template-digest", input.templateDigest],
    ["--studio-project-id", input.projectId],
    ["--provisioning-run-id", input.provisioningRunId],
    ["--json-events", input.jsonEvents],
    ["--run-id", input.runId],
  ]
    .filter(([, value]) => !value)
    .map(([flag]) => flag);
  if (missing.length > 0) {
    throw Object.assign(
      new Error(
        `STUDIO_CREATE_FLAGS_REQUIRED: Studio 初始化缺少 ${missing.join(", ")}`
      ),
      {
        code: "STUDIO_CREATE_FLAGS_REQUIRED",
        retryable: false,
        data: { pointer: "/flags", missing },
      }
    );
  }
  for (const [pointer, value] of [
    ["/studioProjectId", input.projectId],
    ["/provisioningRunId", input.provisioningRunId],
    ["/runId", input.runId],
  ] as const) {
    if (!isPlatformUuid(value)) {
      throw Object.assign(
        new Error(`STUDIO_CREATE_UUID_INVALID: ${pointer} 必须是平台 UUID`),
        {
          code: "STUDIO_CREATE_UUID_INVALID",
          retryable: false,
          data: { pointer },
        }
      );
    }
  }
}

function assertStudioSiteBaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    ) {
      return;
    }
  } catch {
    // The stable error below owns malformed and insecure site URLs.
  }
  throw Object.assign(
    new Error(
      "STUDIO_SITE_BASE_URL_INVALID: Studio 站点必须使用无 credential、query 或 fragment 的 HTTPS 地址"
    ),
    {
      code: "STUDIO_SITE_BASE_URL_INVALID",
      retryable: false,
      data: { pointer: "/siteBaseUrl" },
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
