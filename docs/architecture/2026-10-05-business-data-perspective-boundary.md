# 具名业务 Data API 与读取 Perspective 的边界

状态：已决策，待实现与真实 HTTP 验收。架构主题仅为 Nest 具名业务 Data API 的下游身份上下文。

## 问题证据

管理页面选择读取 Perspective 后调用已经授权的 POST operation。Gateway 合法地验证并保留该视角，Nest `OpenXiangdaBusinessDataApiService` 却将它继续发送到 Native Data。Native 将固定 operation 的 invocation 验证为受信业务主体，再执行用户读取投影，因主体类型不同返回 `403 OPENXIANGDA_PERSPECTIVE_USER_REQUIRED`。原计划查询在写入前被拒绝。

普通 `OpenXiangdaDataApiService` 继承 Perspective 是正确的：应用自定义读取必须沿用页面收窄后的读取范围。不能统一删除浏览器 application API 的 header，不能放宽 Native 对服务主体的拒绝。

## 所有者与不变量

- 平台拥有当前用户角色并集、环境、固定 operation/capability、invocation/Connected Dev 证明、Native 数据与事务。应用不复制授权事实。
- Perspective 只收窄用户读取；不决定写入、流程或业务动作授权。
- Nest 业务 facade 从已经验证的请求派生下游上下文副本，将其 `perspectiveCode` 置为 null。普通 Data API、原 request、CurrentPerspective 和通用业务上下文 helper 保持原值。
- operation code/capability、关联 requestId、开发证明、环境、CAS、当前成员/actor-authority guards 与幂等请求体保持原值。不得用调用方提供的动作字段替换固定元数据。
- 业务 action 内部查询属于其声明和事务校验范围，不成为浏览器任意跨范围读取；响应仍按固定 operation 的 schema 投影。

## 契约和影响范围

不改变 wire schema、声明、资源、权限或公开方法签名。只修改 V2 Nest 业务 Data API 的 downstream Perspective；V1、普通用户 Data API、后台读取视角和 Native 拒绝路径不变。其他 V2 应用使用同一 facade 的具名动作可独立消费 patch 版本。低层 PlatformClient 仍可传入 Perspective，以便显式错误调用由 Native 拒绝。

## 失败、并发与资源边界

派生上下文不写回 request，不引入跨请求状态、缓存、额外请求或重试。403/409、超时和未知结果继续传播原诊断。先查询原键/原计划及业务记录，再恢复原意图；不换键掩盖失败。prepare 不产生业务效果，commit 仍事务内核验当前授权、记录 revision 与占用。

## 回滚边界

SDK patch 可独立回退，无数据库迁移。原失败请求和回执保留。应用通过完整同源七包的官方本机 exporter 消费，不手改依赖内部代码或 validator 摘要；不进行 npm 或学校生产发布。

## 可证伪验收

1. 使用真实 PlatformClient 的 fetch 边界，带管理 Perspective 的业务 query/transaction 不发 Perspective；固定 action、关联请求、开发证明、环境和完整 guards/CAS/原键保持。
2. 同一原 request 上的普通 Data API 仍发送读取 Perspective，原上下文未被变更。
3. 缺 operation、非用户/开发主体、未声明 actor-authority 仍在下游请求前拒绝；平台范围拒绝原样传播且仅一次请求。
4. 原始低层业务请求若显式带 Perspective，仍能得到平台拒绝，不移除服务端检查。
5. 按 Changeset、受影响门禁、主线 lineage、正式版本物化和完整 exporter 安装验证。实际测试发布后，从后台原页面以原键恢复申请；独立回读 subject/准备记录/原流程，合法范围成功和越界拒绝分别记录。
