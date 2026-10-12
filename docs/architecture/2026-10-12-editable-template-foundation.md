# 可编辑模板与访客应用：实现决策记录

状态：实施中。方案由 Claude 原会话 5072bc85-80f0-43dd-91d6-df630b5d0c20 的第 06 份交付设计确定；本记录承接 Unit 1。用户已授权设计后直接开发、测试、验证。

## 问题证据与所有者

用户遇到两套后台跳转、SDK 页面不能自行修改、冷启动慢、登录页面简单。现有 SDK 支持替换 admin shell、PC/移动 frame、登录 surface，starter 没有提供独立源码；GeneratedResourceCrud 将列表控制和布局封闭在一起。CLI 只提供 builtin:application。

工具链拥有模板选择、物化和公共资源边界，物化后的布局和页面由应用拥有。平台独占身份、权限、数据、环境和部署状态。本轮源码写入位置为 Mac 主仓库 tools/openxiangda-v2，master，基线 84cb2a11。重型验证优先 WSL 独立验证目录，不改变其他任务的服务或源码。

## 不变量与合同

保留 SDK 唯一路由及外层权限校验、单个 admin shell、SDK 登录行为。新增 resourcePages 按 resource/view/mode 选择应用组件，未声明时使用 SDK 默认页。openxiangda/resource 提供列表控制器及可重新组合的块，SDK 默认页使用同一边界；detail/form 先导出已有块。模板只导入公开入口。

CLI 新增 scenario/style/admin/pc/mobile/login/with/without 组合与 template list，WorkspaceTemplateBinding 新增可选 components 摘要。不改 builtin:application，不增加 frontend.areas，不复制权限或偏好存储。访客默认 recipe 为原生 CRUD，无 Nest/workflow；assistant 由后续单元启用。

## 失败、并发与安全边界

未知选择、冲突、缺少依赖在写入目标目录及远端副作用前失败。非空目录沿用现有拒绝/恢复合同。模板仅本地，保持 2000 文件/20 MiB 上限和符号链接拒绝。先在临时目录组合、校验、计算摘要，finally 清理。组件异常归现有页面边界；控制器和服务器保留读取、动作、字段权限。

仅修改 V2，现有应用保留 SDK fallback，1.x 不变。不部署生产，不发布 npm。提交和发布单元仅包含本模板主题。

## 回滚和可证伪验证

入口、contribution、模板均为加法，回退无需数据库迁移。验证未知选择无目标目录写入；可复现组合和组件摘要；访客配置编译/check；无私有导入；默认与复制列表共用控制器；过滤、偏好、批选、导出；单个源码 shell；桌面及 390px 邀请→到访→状态回读；无后台能力用户不可进入。实际远端和角色验收独立记录，本地通过不替代。公开包附 Changeset，运行 pnpm verify:affected。

## 后续独立主题

2 确认守卫与只读核对；3 源码 agent 和原生 view/form；4 应用 facade、SDK、assistant UI；5 A2UI；6 采购 workflow/operation；7 引擎/model adapter；8 项目和活动。按 Claude 顺序实施，未验证助手不能称为可用。

## 本轮实现与证据

已实现四类可编辑外壳，每类两个布局，两个主题；visitor/crud 场景、可选 public-entry；统一资源路由与抽屉渲染扩展；可组合桌面/移动列表；PC/移动任务页源码。自定义用户任务页通过应用源码 ApplicationFrame 组合同一套外壳，标准平台页面继续使用现有 standardUserSurfaces；保持 SDK 路由行为。

已运行 13 项创建/组合测试、32 项贡献/公开入口/物化应用测试；三个实际生成的应用组合通过 TypeScript 与私有导入负例；八项浏览器夹具检查通过，包括单个后台、源码抽屉、自定义列/布局、查询、批选、偏好、导出、390px 与无权拒绝。浏览器使用合成 API 响应，并非平台真实角色验收。

真实连接开发验证尚缺目标测试平台与可用开发者会话：本机默认 OpenXiangdaDeveloperSession.load() 返回空。没有创建远端应用，没有写入业务数据，没有进行 npm 或生产发布。完整开发门禁将以本轮主干提交在 WSL 上执行，结果另行补记。
