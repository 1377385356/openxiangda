# 应用自建待办/消息中心的合同收尾 v2

状态：2026-09-15 执行；对应「应用自建 UI，平台拥有数据」的既定分层。

## 问题证据

标准待办中心/消息中心的数据合同（workflow work-center 查询、Notification Hub
todos 收件箱、交互回执）已通过 `openxiangda/core` 公开导出，应用可在自有
user 路由上完全自建两中心的 UI。但仍有两个缺口让"自建"路径不完整：
`openxiangda-nest` 的 `workflowWorkCenter` 只暴露 `status: pending|completed`，
无法取 created/cc 视图（浏览器端早已支持 `view`）；`docs/frontend.md` 没有把
自建路径、路由禁改边界和 Nest 客户端用法写成指南，应用开发者无从发现这些
公开合同。

## 能力归属与决策

- 数据所有权不变：Workflow Kernel 唯一拥有 created/pending/handled/cc 事实，
  Notification Hub 唯一拥有收件箱与回执；本轮不新增端点、不新增第二份数据。
- `OpenXiangdaPlatformClient.workflowWorkCenter` 增加可选 `view`
  （`WorkflowWorkCenterView`）：传入时发送 `view`，未传入时保留原 `status`
  兼容发送；服务端本就以 view 优先、status 兼容映射，行为无歧义。
- `docs/frontend.md` 新增「自建待办与消息中心 UI」：示例、回执语义与
  「不得接管标准路由」「收件箱只读当前用户」「合同外字段不得伪造」边界；
  并明确渲染器替换钩子目前仅覆盖用户面 frame 与 applicationTodoCenter，
  Workflow 待办中心无替换钩子，完全不同呈现走自建路由。

## 稳定不变量

1. 既有 `status` 调用方零变化；`view` 为纯可选加参。
2. 平台 Server、public contracts、浏览器运行时均不变。
3. 路由禁改与权限边界继续由既有清单校验与服务端鉴权执行。

## 失败、并发和资源边界

`view` 值由 TypeScript 联合类型约束；服务端对非法值维持既有
`OPENXIANGDA_WORKFLOW_VIEW_INVALID` 式失败，不引入新错误面。

## 受影响合同和回滚

影响 `openxiangda-nest` 客户端一个方法与文档；回滚恢复上一版
`openxiangda-nest` 即可。Changeset：`openxiangda-nest` patch。

## 本轮验证结果

- `openxiangda-nest` check/test 通过（见 turbo verify:affected 输出）。
- `scripts/sync-developer-guidance.mjs` 无生成物漂移；`node --test
  scripts/test/*.test.mjs` 全部通过。
