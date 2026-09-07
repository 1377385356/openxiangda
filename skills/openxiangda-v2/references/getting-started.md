# 安装与开始开发

OpenXiangda 2.0 默认生成 React 应用和共享契约。普通 CRUD、标准审批和通知使用远端平台能力；只有真实服务端业务动作才按需增加 NestJS。本地无需启动平台、Docker 或 PostgreSQL。

## 准备 {#prerequisites}

准备平台地址、具有应用开发权限的账号、Node.js 24 和 pnpm 10.15.1。向平台维护者取得已验证的 OpenXiangda 2.0 精确版本，并核对平台能力是否支持。`openxiangda@latest` 可能属于 1.x；不能用它选择 2.0。

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

AppSpec 随开发持续维护：测试发布前补齐总纲、关联变更与验收计划，部署后记录真实业务结果，生产晋级核对该测试版本的验收报告。新应用业务实现前先完成[产品设计与确认基线](product-design.md)；研究、示例原型和技术检查可用于逐步完善设计。具体步骤见[全流程记录](appspec.md)。

## 连接开发 {#connected-development}

`dev` 监听本机回环地址，页面通过同源代理访问平台测试数据。浏览器不持久化平台凭据。终端和页面显示当前环境；只有生产环境时会持续提示生产数据风险。开发数据写入仍是远端真实写入，按任务范围操作。

纯 CRUD 修改优先使用标准模型、字段和页面；跨模型事务或外部副作用再选择后端。角色、行和字段权限在平台执行。详见[开发流程](development.md)、[模型与标准 CRUD](application-foundation.md)和[按需后端](backend.md)。

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

生产必须复用成功测试运行。部署状态、真实角色验收和回滚步骤见[应用交付](delivery.md)。纯前端发布不要求 Docker；启用后端后才需要官方镜像构建条件。

## 接入 MCP {#mcp}

MCP 使用相同的项目 CLI：

```bash
pnpm exec openxiangda --mcp-stdio --cwd <应用绝对路径>
```

先调用 `workspace_context`，再按任务读取 `docs_read` 和当前契约。配置示例与工具参数见[MCP 参考](mcp.md)。登录、创建和长期 dev 进程继续由 CLI/终端管理。

指定站点授权可用 `auth status --base-url <平台地址> --json` 或 MCP `authorization_status` 只读核验，无需工作区。状态为 `authorized` 才证明当前 access 被平台接受；`missing`/`platform_mismatch`/`refresh_required` 需处理会话，`unauthorized` 表示平台拒绝，`unavailable` 表示暂时无法核验，不能当成过期。查询不刷新、不打开浏览器、不修改绑定；应用管理权限需另行核验。
