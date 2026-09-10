# 设计能力验收样例

从仓库根执行 `pnpm design:preview`，打开本机输出的地址。先运行 `pnpm --filter openxiangda... build` 生成组件 CSS。`pnpm design:check` 自动启动独立本机服务并检查 PC/移动任务、状态、字段与弹层，结束后关闭服务。

设计与原型源码在 appspec/design；tokens.css 是数值来源，main.tsx 的小型派生适配供示例使用。此场景只证明设计流程与真实字段组件能衔接，本地示例数组、状态演练、模拟拒绝不构成业务 API 或权限实现。不要把它作为默认应用模型。

本目录是可检查的维护样例，未取得用户对具体视觉的确认，也不表示已发布或部署。浏览器验证结果见 verification.md。
