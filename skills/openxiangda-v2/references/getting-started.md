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
