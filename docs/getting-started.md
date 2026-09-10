# 安装与开始开发

OpenXiangda 2.0 默认生成 React 应用和共享契约。普通 CRUD、标准审批和通知使用远端平台能力；只有真实服务端业务动作才按需增加 NestJS。本地无需启动平台、Docker 或 PostgreSQL。

## 准备 {#prerequisites}

准备平台地址、具有应用开发权限的账号、Node.js 24 和 pnpm 10.15.1。`openxiangda@latest` 与 `openxiangda@stable-v2` 指向 V2 稳定版，`openxiangda@legacy-v1` 指向 V1 维护版。安装后核对实际精确版本和目标平台能力；项目依赖与锁文件决定应用使用的工具链。

<a id="upgrade"></a>

## CLI、Skill、MCP 安装与升级 {#upgrade}

全局统一入口适合新用户和原 V1 用户安装；Node.js 需要 24 或更高版本：

```bash
npm install -g openxiangda@latest --registry=https://registry.npmjs.org
openxiangda version --json
```

`openxiangda` 根包已经依赖配套 CLI、MCP 和 Skill 资料，无需逐个全局安装 `openxiangda-cli`、`openxiangda-mcp` 或 `openxiangda-skill-kit`。全局入口根据当前目录识别代际，进入已有项目时优先使用该项目锁定的引擎；更新全局入口不升级项目依赖。

### 原 V1 用户

建议评估升级到 OpenXiangda 2.0。新应用优先使用 V2；已有应用先核实能力覆盖、迁移成本及数据、在途流程、权限的验收与回滚方案。在已安装新版全局入口后，进入原项目运行：

```bash
openxiangda version --json
openxiangda migrate assess --to v2 --json
```

这里使用全局 `openxiangda`，不要用会优先调用旧项目 V1 CLI 的 `pnpm exec openxiangda` 或 `npx openxiangda` 来执行迁移评估。评估只读取本地源码指针，不读取远端数据、不自动转换应用。原项目仍按 V1 维护；同代更新通过 `legacy-v1` 获取维护版，不把 V2 包直接替换进 V1 项目。

### 更新入口与项目

```bash
# 更新全局统一入口
openxiangda update check --target launcher --json
openxiangda update install --target launcher

# 在项目目录，更新本项目同代依赖与锁文件
openxiangda update check --target workspace --json
openxiangda update install --target workspace
openxiangda version --json
```

更新完成后审查依赖、锁文件差异并运行项目检查与业务验收。统一入口不会后台自动升级工具或转换项目。V1 独立 CLI 的 `update install` 会尝试刷新 V1 Skill（可用 `--no-skills` 跳过）；统一入口的更新完成后按下面命令显式刷新 Skill。

### 安装或刷新 Skill

在项目目录刷新匹配该项目版本的技能，并更新 V2 项目的 AGENTS 平台区块：

```bash
openxiangda skill install --workspace . --force
```

安装到用户级 Codex 或其他 AI 工具可用 `skill install --agent codex|claude|qoder|dual --force`（实际执行时选一个值），或 `--destination <Skill根目录>`。在 V1 项目内会安装 V1 技能与统一入口技能；要先安装 V2 用户级技能，使用 `openxiangda skill install --cwd <不属于任何应用的空目录> --force`。支持协作的自动准备与 `--skip-support` 见下文。

创建 V2 应用会准备匹配版本的项目指引。后续更新依赖后再次刷新技能；不要把不同代际或旧版本的技能正文复制进新项目。

### 接入及更新 MCP

MCP 服务随项目根包一起安装，AI 客户端的 stdio 连接仍需配置一次。使用[项目路径配置示例](./reference/mcp.md#连接项目)，由客户端启动项目锁定版本的 `openxiangda --mcp-stdio`。CLI 更新不会自动修改客户端配置，也不会重启已有 MCP 进程；项目依赖升级后在客户端重启 MCP，然后读取 `workspace_context` 核对版本。长期开发进程使用 CLI 终端管理。

## 安装与创建 {#create}

以下命令的版本占位符由随包资料替换为该根包的精确版本。网站源码阅读者应先确认要使用的发行版本。

```bash
pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ skill install --force
pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ auth status --base-url <平台地址> --json
pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ login --base-url https://platform.example.com
pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ create my-app --base-url https://platform.example.com
cd my-app
pnpm openxiangda context --json
pnpm openxiangda dev
```

将两处示例平台地址替换为同一个目标地址。`create` 先核对目标与当前登录平台，再创建本地目录、安装依赖并初始化远端应用；新应用不会自动沿用文件中最后登录的站点。CI 使用原有成对的 `OPENXIANGDA_BASE_URL` 和 `OPENXIANGDA_TOKEN` 时，可以由该显式地址指定目标。

初始化中断后重试同一命令；已有目录会核对原平台绑定，不能通过 `create` 改绑到其他站点。地址不一致时先检查目标并登录正确的平台，不修改 link 文件绕过检查，也不要使用内部 provision 接口另建应用。创建操作应在用户要求创建应用的范围内执行。

进入项目后使用 `pnpm openxiangda`，由项目依赖和锁文件决定版本。查看使用资料运行 `pnpm openxiangda docs`；查看单一主题运行 `pnpm openxiangda docs frontend`。安装到其他 AI 工具时使用 `skill install --destination <Skill根目录>`。

### 内部支持协作

统一入口在成功创建应用、V1 workspace init/skill bootstrap 和 skill install 后检查 DWS。缺失时安装审核过的官方稳定版和完整 multi 技能（包括 shared、misc/profile 等跨技能引用），复用可用版本；不会自动登录、加入群或发送消息。支持接入结果独立于应用创建，JSON 创建结果保持原结构，接入进度写 stderr。

```bash
pnpm openxiangda support status --json
pnpm openxiangda support bootstrap
pnpm openxiangda support login
pnpm openxiangda support join
```

首次 OAuth 由用户完成，SSH 使用 `support login --device`。支持侧保存 DWS 精确 profile 指针，多账号可传 `--profile <corpId:userId>`；不修改 DWS 或平台默认账号。通道来自外置配置，`join` 原样打开邀请链接，由用户在钉钉完成加入，再执行 `status` 回读。群可访问、成员身份与组织限制分别报告；钉钉负责真实权限判断，不凭链接推定。

等待授权、入群、网络或安装权限时可以继续独立开发。离线/CI 创建和技能安装可加 `--skip-support`，之后运行 `support bootstrap` 恢复。完整官方技能由 DWS 自身安装/备份；自动接入使用 DWS 的 all 目标检测宿主，应用技能安装的 --agent 只决定应用技能位置。`support bootstrap --force --agent <DWS目标宿主>` 可显式指定 DWS 宿主并刷新。`support --help` 查看命令，支持命令无需应用依赖已安装；独立 V1 引擎没有这些分发命令，应使用新版统一入口，保留原 V1 项目版本。

本地接入指针位于 `${XDG_CONFIG_HOME:-~/.config}/openxiangda/support.json`，只保存 profile 和技能安装回执，不保存 Token。普通支持咨询与持续讨论遵循安装的 `openxiangda-support` 技能及用户授权；后台唤醒须有真实宿主监听或定时任务。

## 项目结构 {#workspace}

```text
apps/web                 页面与应用入口
packages/contracts       平台编译器生成的契约
modules                  业务模型、页面选择和模块声明
openxiangda.config.ts    应用装配、导航、权限和按需能力
appspec                  需求、架构、变更和验收记录
AGENTS.md                平台约定与项目自有说明
```

以实际模板输出为准。资源与页面通过模块声明组合，不创建 `platform/data`。`apps/server` 仅在启用后端时初始化；后续保留用户业务代码。

AppSpec 随开发持续维护：测试发布前补齐总纲、关联变更与验收计划，部署后记录真实业务结果，生产晋级核对该测试版本的验收报告。新应用业务实现前先完成[产品设计与确认基线](./product-design.md)；研究、示例原型和技术检查可用于逐步完善设计。具体步骤见[全流程记录](./appspec.md)。

## 连接开发 {#connected-development}

`dev` 监听本机回环地址，页面通过同源代理访问平台测试数据。浏览器不持久化平台凭据。终端和页面显示当前环境；只有生产环境时会持续提示生产数据风险。开发数据写入仍是远端真实写入，按任务范围操作。

前端启动使用根目录 `dev:web`。声明了后端的应用同时运行配置的 `backend.root` 包内的 `dev`，无需增加根目录 `dev:server`；纯前端应用只启动 Web 和代理。已有前端测试版本后，可以启用本地 Nest 联调，不必先构建或发布后端镜像。平台返回的活动应用版本和开发会话绑定本次联调，环境版本变化导致会话不一致时，停止后重新运行 `dev`。

纯 CRUD 修改优先使用标准模型、字段和页面；跨模型事务或外部副作用再选择后端。角色、行和字段权限在平台执行。详见[开发流程](./development.md)、[模型与标准 CRUD](./application-foundation.md)和[按需后端](./backend.md)。

## 应用源码

平台启用源码托管后，`create` 自动建立应用私有仓库、配置长期 Git 凭据并推送首次提交。
应用管理员自动拥有对应仓库管理员权限；无需注册另一套账号。凭据存入系统凭据管理器，
macOS 使用 Keychain，Windows 使用 Git Credential Manager，Linux 使用已安装的
Git Credential Manager 或 libsecret。新电脑首次使用需重新执行源码配置。

```bash
pnpm openxiangda source status
pnpm openxiangda source setup
pnpm openxiangda source push -m "完成本轮应用开发"
```

创建或推送中断后，在原目录重试。已有外部仓库使用 `source setup --import`，原 `origin`
保留为 `external-source`；当前分支的历史随推送保留，不执行强推，也不自动合并冲突。
其他分支、标签和 Git LFS 对象需按实际迁移范围另外推送。`source push` 省略 `-m` 时只推送
已有提交；带 `-m` 时提交当前所有未忽略更改。源码入口位于平台应用运营的“应用源码”。

| 当前场景 | 执行方式 |
| --- | --- |
| 新应用 | 正常执行 `create`，平台启用后自动建仓、配置凭据和首次推送 |
| 已有项目首次交接给另一个 AI | 先读 `context --json` 和 `source status`，沿用项目绑定与版本 |
| 换电脑或初始化中断 | 在应用目录执行 `pnpm openxiangda source setup`；已有提交及未提交修改会保留 |
| 从个人远端迁入 | 明确迁入后运行 `source setup --import`，原远端保留为 `external-source` |
| 本轮修改完成 | 检查差异后运行 `source push -m "AppSpec: <本轮变更ID> 变更说明"`；多个任务共享目录时先精确提交本轮文件，再不带 `-m` 推送 |
| 准备部署 | 先把本轮提交合入并推送远端默认分支，再从干净且同步的主分支执行 `deploy` |

新仓库默认使用 `main`；导入时，尚无默认分支的空仓库会采用当前分支（例如 `master`）。
已有远端默认分支不会因在任务分支运行 setup 而改变。源码操作使用 CLI/终端；
MCP 的 `docs_read` 可以读取本说明，当前没有独立的源码操作 MCP 工具。

| 错误或状态 | 处理 |
| --- | --- |
| `enabled: false` | 平台尚未启用托管，沿用当前工作区；由平台管理员配置后再接入 |
| `APPLICATION_SOURCE_ORIGIN_CONFLICT` | 核实平台绑定和现有 origin；仅在明确迁入时使用 `--import` |
| `APPLICATION_SOURCE_CREDENTIAL_HELPER_REQUIRED` / `APPLICATION_SOURCE_CREDENTIAL_NOT_STORED` | 安装或解锁系统凭据管理器，再重试 setup；不把密码写入 URL、项目或明文凭据文件 |
| 403 / 应用管理权限不足 | 核对当前平台账号及应用管理员资格；由已有应用管理员添加权限 |
| `APPLICATION_SOURCE_PROVIDER_UNAVAILABLE` / `APPLICATION_SOURCE_PROVIDER_FAILED` | 保留原应用和目录，待 Git 服务恢复后重试同一操作 |
| 推送被拒绝或主线已前进 | 先 fetch 并查看差异，按项目规则合并解决冲突后重试，不强推覆盖 |
| `APPLICATION_SOURCE_COMMIT_NOT_PUSHED` | 在绑定仓库推送原提交，核对 source status 和远端 SHA 后重试部署 |

应用创建人和新增应用管理员拥有对应仓库管理权限，不需要另行维护 Git 角色。
本期不自动同步权限撤销或删除。不要向应用开发者索要 Forgejo 平台管理员 Token；
个人凭据由已登录的平台账号获取，配置成功后可长期复用。

### 从平台和仓库 URL 获取源码

无需本地工作区，使用本 Skill 随包精确版本或已安装的对应 CLI：

```bash
pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ auth status --base-url <平台> --json
pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ source resolve <仓库URL> --base-url <平台> --json
pnpm dlx openxiangda@__OPENXIANGDA_VERSION__ source clone <仓库URL> <新目录> --base-url <平台> --json
```

登录缺失或站点不匹配时，先按该平台执行 login。resolve 根据平台已经登记的绑定返回
`appCode/name/repository`，不猜应用代码；clone 使用当前账号配置长期凭据后检出源码，
返回 `root/baseUrl/appCode/repository/branch/commit`。`--branch <分支>` 可指定分支，
省略时使用 Forgejo 实际默认分支。目标目录必须不存在；失败时保留目录供检查。
克隆不会加载应用配置、安装依赖、执行应用脚本或递归拉取子模块，并禁用 checkout hooks
和全局过滤器；需要 LFS 内容时在审查后单独处理。

既有 `PLATFORM_ADMIN` 平台管理员映射为共享 Forgejo 管理员，可完整管理已有及以后创建的
全部仓库，不受应用创建人或应用成员登记限制。平台应用管理员保持对应仓库管理权限。
该规则没有新增平台角色，也不扩展普通应用成员的权限。

正式 API 均位于平台 `/service/openxiangda-api/v2` 下，使用现有登录态：

| API | 请求及响应 data |
| --- | --- |
| `GET /application-source/resolve?repository=<编码后的仓库URL>` | 接受平台登记的 cloneUrl 或 webUrl，返回 `{ appCode, name, repository }`；不返回凭据 |
| `POST /application-source/credential` | JSON `{ "repository": "仓库URL" }`，返回 `{ appCode, repository, username, password, name, email }`，响应 `Cache-Control: no-store` |
| `POST /application-source/administrators/reconcile` | 仅平台管理员；同步已有 PLATFORM_ADMIN 到 Git，返回 `{ synchronized }`，不返回凭据 |

使用 CLI 时无需自行调用凭据 API；支持工具不得记录其响应或另建身份体系。
未登记的外部仓库先在原工作区执行 `source setup --import`，再使用平台返回的仓库 URL。

## 检查与交付 {#delivery}

只检查时运行 `pnpm openxiangda check`。需要部署测试环境时直接运行 `pnpm openxiangda deploy`，它已包含检查、测试和构建；无需再连续重复运行全部脚本。

生产必须复用成功测试运行。部署状态、真实角色验收和回滚步骤见[应用交付](./delivery.md)。纯前端发布不要求 Docker；启用后端后才需要官方镜像构建条件。

## 接入 MCP {#mcp}

MCP 使用相同的项目 CLI：

```bash
pnpm exec openxiangda --mcp-stdio --cwd <应用绝对路径>
```

先调用 `workspace_context`，再按任务读取 `docs_read` 和当前契约。配置示例与工具参数见[MCP 参考](./reference/mcp.md)。登录、创建和长期 dev 进程继续由 CLI/终端管理。

指定站点授权可用 `auth status --base-url <平台地址> --json` 或 MCP `authorization_status` 只读核验，无需工作区。状态为 `authorized` 才证明当前 access 被平台接受；`missing`/`platform_mismatch`/`refresh_required` 需处理会话，`unauthorized` 表示平台拒绝，`unavailable` 表示暂时无法核验，不能当成过期。查询不刷新、不打开浏览器、不修改绑定；应用管理权限需另行核验。
