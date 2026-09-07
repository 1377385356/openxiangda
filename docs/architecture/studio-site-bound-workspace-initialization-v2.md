# Studio 站点绑定工作区初始化 v2

状态：Accepted

## 问题证据与能力所有者

- 现有 `openxiangda create` 在生成工作区后无条件调用
  `POST /openxiangda-api/v2/applications/{appCode}/provision`。这个行为适合独立开发者，
  但不适合 Studio：Studio 的 `ProjectProvisioningRun` 已经在站点事务边界中创建并绑定
  Application；桌面 CLI 再次拥有“可创建远端 Application”的能力会产生第二个权威。
- 现有重试只核对工作区 `app.code`、显式名称和 `.openxiangda/template.json`。
  它没有持久化 site、Project、ProjectProvisioningRun，也没有最终 configuration、contract、
  AI Catalog 和 compiler contract 摘要，因此另一个 Project 可以误用同一目录，站点也无法
  核对首次提交究竟来自哪次初始化。
- 现有成功结果携带本机绝对 `root` 和 link 文件绝对路径。Studio 会把 CLI 事件上传到站点，
  因此这些本地路径不能进入 Studio 初始化回执。
- 客户站点 `ProjectProvisioningRun` 唯一拥有 Project/Application 组合创建与回读；
  `app_type` 是平台 Application 的规范键，对应 CLI 的唯一 `--app-code`。CLI 只拥有本地
  工作区物化、现有 OpenXiangda link 和编译摘要。Git Broker 唯一拥有仓库创建、凭据和
  repository binding；CLI 不接受仓库 URL、repo id 或 Git credential。

## 公开命令与 wire contract

普通模式保持现有行为，并继续幂等 provision：

```bash
openxiangda create <directory> --base-url <站点地址> [--app-code <app-type>] [--name <name>]
```

Studio 模式只由以下完整参数集启用，任一 Studio flag 单独出现都稳定失败：

```bash
openxiangda create <directory> --base-url <站点地址> \
  --app-code <platform-app-type> \
  --name <application-name> \
  --template-ref <builtin:application-or-materialized-file-ref> \
  --template-digest <sha256:digest> \
  --studio-project-id <project-uuid> \
  --provisioning-run-id <project-provisioning-run-uuid> \
  --json-events \
  --run-id <cli-execution-uuid>
```

三个 UUID 语义互不替代：`studio-project-id` 是永久 Project 身份，
`provisioning-run-id` 是站点创建 saga，`run-id` 只关联本次有序 JSONL 事件。
三者都必须是 RFC 4122 version 1-5 且 variant 为 `8`、`9`、`a` 或 `b` 的 UUID；
只有 `8-4-4-4-12` 外形但 version/variant 非法的字符串会在任何落盘前被拒绝。
Studio 模式绝不调用 application provision；最终结果固定包含
`applicationAuthority: "site-project-provisioning-run"` 和 `provision: null`。

JSONL 仍使用 `openxiangda.cli-event/v1`，事件字段固定为
`schemaVersion,eventId,runId,seq,type,timestamp,payload`，事件类型完整集合仍为：

- `command.started`
- `command.status`
- `command.completed`
- `command.failed`

终态 `payload.result` 使用 `openxiangda.cli-result/v2`。成功的 Studio create 另包含
`data.studioInitialization`，schema 为
`openxiangda.studio-workspace-initialization/v1`：

```ts
interface StudioWorkspaceInitializationV1 {
  schemaVersion: 'openxiangda.studio-workspace-initialization/v1';
  applicationAuthority: 'site-project-provisioning-run';
  siteBaseUrl: string; // HTTPS only; no credential/query/fragment
  projectId: string; // UUID
  provisioningRunId: string; // UUID
  appType: string; // exactly --app-code and platform app_type
  appName: string;
  workspace: { reused: boolean };
  cliVersion: string;
  protocolVersion: 'openxiangda.studio-workspace/v2';
  template: {
    schemaVersion: 'openxiangda.workspace-template-binding/v1';
    ref: string;
    digest: `sha256:${string}`;
  };
  compiler: {
    toolchainVersion: string;
    contractVersion: string;
    compilerContractVersion: string;
    configurationDigest: string;
    contractDigest: string;
    aiCatalogDigest: string;
  };
  bindingDigest: `sha256:${string}`;
  workspaceDigest: `sha256:${string}`;
}
```

`workspaceDigest` 对除自身和本次调用态 `workspace.reused` 之外的完整稳定 initialization
事实做按键排序 canonical JSON SHA-256；因此同一绑定的首次成功和结果不确定后的同参回读
得到同一摘要。`reused` 只用于本次本地 UX，不能进入 Project checkpoint 的 CAS 比较。
`cliVersion` 是实际执行的 `openxiangda-cli` 包版本，compiler 内另保留 toolchain
版本，`protocolVersion` 固定为 capability v2。站点
`workspace_initialized` checkpoint 必须原样提交这三个字段，不能用本地目录或 Git commit
替代。

Studio 成功事件中的 `workspace` 不输出绝对 root，link 摘要不输出本地 link path，next action
只使用 `<workspace>` 占位符。调用方已拥有执行目录，不得把事件重新扩充为包含用户名的 Mac
路径后上传。

## 本地绑定与幂等状态机

CLI 在依赖安装前原子写入 `.openxiangda/studio-binding.json`，权限为 `0600`。该文件不含
token、Cookie、Git URL、repo id、credential 或 Application UUID，只包含站点和初始化事实：

```text
absent -> prepared(compiler=null) -> compiled(compiler=exact digests)
```

- `absent`：模板摘要验证成功并完成文件物化后写入 prepared；因此包安装失败仍可安全重试。
- `prepared`：重试必须逐字段匹配 HTTPS site、Project UUID、ProvisioningRun UUID、appType、
  appName 和 template ref/digest。任一差异返回 `STUDIO_WORKSPACE_BINDING_MISMATCH`，不会安装、
  link 或写平台。
- `compiled`：重新安装与生成后，三个 compiler digest 及三个协议版本必须完全相同；不同则
  返回 `STUDIO_WORKSPACE_COMPILER_DRIFT`，绝不覆盖第一次初始化证据。
- JSON 文件键集合、状态与 compiler/null 组合均严格校验；未知字段或损坏 JSON 返回
  `STUDIO_WORKSPACE_BINDING_INVALID`。
- `bindingDigest` 对按键排序的 canonical JSON 计算，调用方可把摘要交给站点 checkpoint；
  本地绝对路径不参与摘要。

模板仍只接受 `builtin:application` 或调用方已物化的 `file:`/本地目录。CLI 不解析 Studio
模板 catalog、签名或 Git commit；站点和 Git Broker 先完成这些权威检查，CLI 只在复制前
校验固定内容 digest。

## 失败、并发、安全与回滚

- Studio Local Runtime 在调用 CLI 前必须已经持有 ProjectProvisioningRun/设备执行租约，
  每个目标工作树只有一个 writer。CLI 的 prepared/compiled 文件采用同目录临时文件加原子
  rename，读者不会看到半写 JSON；跨设备并发仍由站点 lease 和每 run 独立 worktree 拦截。
- 所有 Studio UUID 在任何本地文件或平台动作前校验。site 必须是 HTTPS，且 URL 不允许
  username、password、query 或 fragment。HTTP 开发站点不能启用 Studio 权威模式。
- template digest 不匹配时不创建目标；安装失败保留 prepared；编译漂移保留第一次 compiled；
  不确定远端结果不存在，因为 Studio 模式没有 Application 或 Git 远端写入。
- Studio binding 是初始化证据，不是 repository/application 权威。删除本地工作树可以从站点
  Project 和 Forgejo 重建；不得把 binding 上传后反向覆盖 Project 数据。
- 回滚单位为 contracts/devkit-core/CLI/root package 的同一 release train。回滚不会删除站点
  Project、Application、Forgejo 仓库或已提交源码；旧 CLI 看不懂 v2 capability 时必须阻止
  Studio 新任务，而不是退回普通 provision 模式。

## 可证伪验收

1. contracts 测试固定 capability v2、UUID/HTTPS、无 root 的初始化 schema 和 Git Broker 权威声明。
2. CLI 单测证明 binding `0600`、prepared/compiled、稳定 digest、Project 漂移和 compiler 漂移。
3. source CLI 黑盒以 HTTPS 站点语义创建并重复执行；远端 fetch stub 只允许 whoami，任何
   provision 或其他远端请求立即失败，从而证明 Studio 模式没有 Application 创建副作用。
4. 黑盒证明同参重试成功、换 Project 在安装前失败、stdout 仍是纯 JSONL，结果不包含临时
   根目录、link path、repository 或 token。
5. `workspace_context` 和 MCP 同时声明 `openxiangda.studio-workspace/v2`、所需 flags、binding/
   initialization schema、`applicationKey=appType` 和 `repositoryAuthority=site-git-broker`。
6. `pnpm verify:affected` 覆盖 contracts、devkit-core、CLI、MCP 与根包依赖图。
