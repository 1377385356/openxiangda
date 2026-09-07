# 应用待办中心全宽列表 Surface v2

状态：accepted for implementation on 2026-08-30。

## 问题证据

当前 `ApplicationTodoCenterPage` 在桌面端维护 `selectedId`，加载后自动选中首条
消息，并把列表与 `.oxa-todo-preview-card` 组成固定双栏。Todo 合同只返回列表摘要、
动态字段和规范导航目标，并没有可嵌入业务详情的 Surface 或详情读取 API；右侧预览
因此既重复业务信息，也不能承载完整 Workflow 或应用详情能力。

现有查询只支持 `view`、`keyword`、`unread`、`limit` 和 `offset`。合同没有优先级、
到期时间、任务类型、来源筛选、排序、批量审批或跨页选择语义。设计稿中的这些元素
不能由浏览器猜测或伪造。

## 能力归属与决策

- Notification Hub 与应用 Todo 服务继续拥有当前用户收件箱、统计、分页、未读状态和
  `read/click` 交互回执。
- `openxiangda/react` 拥有平台默认待办页面。本轮把桌面端改为全宽 Ant Design Table，
  移动端继续使用独立触屏卡片列表。
- Workflow Kernel 或应用业务页继续拥有完整详情与操作。待办页只消费平台已经解析的
  `desktopPath/mobilePath`；内部目标使用现有 SPA 导航，外部目标使用现有外部导航。
- 默认页不再维护选中项或常驻详情。详情抽屉只有在未来能够承载同一规范详情路由时才
  可作为可选容器，不能建立第二个 Todo 详情 API。

## 稳定不变量

1. 三个视图精确对应 `pending`、`informational`、`completed`；统计只展示合同已有的
   待处理、消息、未读和已完成。
2. 搜索只提交有界标题/摘要关键词；“仅看未读”只映射到已有 `unread=true`。
3. 表格只展示 `title`、`summary`、`sourceLabel`、有界动态 `fields`、真实
   `updatedAt`、`state/interactionState` 和规范导航。不存在的发起人、当前节点、
   截止时间、优先级或本月统计不得被平台推断。
4. “查看详情”是唯一行级主入口。目标不可用时记录仍然可见，但入口禁用；click 回执
   失败不阻断目标页面自己的读取与权限判断。
5. 桌面和移动端选择各自的规范路径，不拼接身份、角色、token、业务记录或 taskId。
6. 页面不执行 Workflow approve/reject/return 等命令，不实现批量处理，也不缓存全量
   消息或跨页聚合。

## 失败、并发和资源边界

- 单次列表读取沿用服务端上限，本页桌面 12 条、移动 10 条；动态字段在桌面裁剪到前
  3 项、移动裁剪到前 8 项，完整信息由详情页负责。
- 快速切换视图、关键词、未读条件或页码时使用请求序号淘汰旧响应，旧查询不能覆盖新
  查询。刷新保留已加载数据并使用局部 loading。
- 查询失败保留旧数据并在列表区域提供错误和重试；首次失败不伪装为空列表。
- 动态字段值只转为安全文本，不执行 HTML；对象值使用有界 JSON 文本表示。
- 认证、租户与当前用户范围继续由已有平台服务处理。本轮不新增权限模型、数据库、
  migration、后台轮询或第二份消息状态。

## 受影响合同和回滚

受影响范围仅为 `openxiangda` React runtime 的 Todo 页面、通用样式、模板浏览器测试、
架构文档与配套 facade/CLI 版本胶囊。平台 Server、public contracts、应用声明和数据
均不变化，OpenXiangda 1.x 不读取该组件。

回滚时恢复上一组匹配的 `openxiangda` 与 `openxiangda-cli` 版本即可；没有数据迁移
或业务状态修复。由于上一版会恢复常驻预览，本设计稿和测试必须与代码同版本回滚。

## 可证伪验收

1. `/todos` 作为桌面用户 Surface 显示全宽语义表格，不存在 `.oxa-todo-preview-card` 或固定详情列；
   `/m/todos` 保持独立单列卡片。
2. 桌面和移动端“查看详情”分别进入返回的 `desktopPath` 与 `mobilePath`，且 click
   回执失败时仍可导航；不可用目标不能导航。
3. 切换“仅看未读”后请求包含 `unread=true`，关闭后不包含；关键词、视图和页码变化
   都重置到正确服务端页。
4. 加载、保留数据刷新、首次失败、重试、无数据和有筛选无结果均有稳定可读状态。
5. 表格状态包含文本而不只依赖颜色，动态字段有界，搜索和开关拥有可读名称，详情
   入口可由键盘触发。
6. focused browser E2E、`openxiangda` check/test、Ant Design lint 与
   `pnpm verify:affected` 通过；发布候选同时刷新 facade 与 CLI 模板胶囊。
