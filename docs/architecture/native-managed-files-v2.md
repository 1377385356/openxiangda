# Native 托管文件闭环

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

## 决策记录

| 维度 | 决策 |
| --- | --- |
| 问题证据 | Devkit、Nest SDK 与本地平台已经使用 `/native/data/**`，但 reference-environment 的真实 `files/uploads/initiate` 返回 404；平台能力发现仍声明 `data.managed-files`，Field Kit 因而在运行时才失败。 |
| 能力所有者 | Platform Server Native Data API 唯一拥有文件元数据、绑定、下载授权和对象存储访问；Platform Storage 拥有签名与对象操作；Field Kit 只拥有稳定附件值适配和 UI。 |
| 稳定不变量 | 业务字段继续保存既有 `name/url/size/type/provider/fileId/...` 稳定附件项；`DataFileRef` 只用于 initiate/complete 传输。2.0 只调用 Native 路径，不回退旧 `/data/**`。 |
| 受影响合同 | 既有 initiate、complete、delete、content 客户端方法获得真实 Native 服务端实现；Field Kit 保存的受保护 URL 改为 Native 路径；能力名与 DTO 不变。 |
| 失败与并发 | 上传绑定创建时的 Environment Head；Head 改变后未绑定文件拒绝完成/绑定。业务创建、更新、受限事务和文件绑定同事务提交；重复完成幂等，并发绑定只有一个记录成功。 |
| 安全与资源 | 用户请求必须携带当前 RoleSession；应用身份上传/删除要求 `data:write`、下载要求 `data:read`。服务端校验字段权限、数据权限、大小、数量和类型；未绑定/孤立对象由有界租约清理。 |
| 回滚边界 | 工具包只修正 2.0 Native URL 和本地同构实现；无 1.x 代码。平台表独立于旧文件表，回滚包不会改变旧应用数据。 |
| 可证伪验证 | 包测试逐字节断言所有文件 URL 为 Native；本地真实 PostgreSQL 完成上传、绑定、下载和清理；reference-environment 使用同一 AppVersion 验证 OAuth2/RoleSession、Data、文件与 Workflow 全链路。 |

Platform Server 的持久化与运行边界详见根编排仓库
`docs/architecture/2026-08-16-openxiangda-native-managed-files.md`。本仓库不得用旧
Data API fallback 掩盖平台未就绪，也不得把对象存储凭据暴露给应用代码。
