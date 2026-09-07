# openxiangda-contracts

维护 OpenXiangda 2.0 的 TypeScript 与 JSON Schema 协议，包括应用声明、Data API、当前用户的角色与能力并集、AppPackage、部署结果及 Studio 工作区事件。

应用使用根包 `openxiangda/core` 等公开子路径。平台与工具链维护者在此修改共享协议，并验证调用双方及包版本组合；不要在应用中复制身份、权限或部署状态协议。

平台维护者与 Devkit 使用 `openxiangda-contracts/native-compiler` 共享完整配置、字段和策略的纯校验规则。该 Node 子入口同时提供 ESM/CJS，构建生成同一实现摘要；不访问数据库、网络或凭据。服务端通过已有数据与密钥服务执行只读环境预检和最终并发校验。应用开发者直接运行 `openxiangda check/deploy`，无需调用这些维护者接口。
