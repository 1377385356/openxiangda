# Application v2 制品收据规范分类与断线去重

日期：2026-09-16
状态：实施中（待验证、发布与站点回读）

## 问题证据与所有权

单机 SZGH 测试站点已从 `alpha_open` 切换到 `native_open/native-2`，但应用从干净主线部署三轮均在完整制品 POST 中因 `UND_ERR_SOCKET`/`ECONNRESET` 中断，前端制品约 34.7 MB；未创建新 DeploymentRun 或 Native Head。只读数据库证实配置、数据契约和前端摘要已经由平台存入 `app_delivery_artifacts`，仍被客户端重新上传。Devkit `uploadOrReuse` 比较 `stored.kind === input.kind`；平台 `OpenXiangdaApplicationV2Service.artifactKind` 持久化规范分类：`frontend=runtime`、`backend=backend`、`config/contracts=configuration`、`manifest=package-manifest`。平台 Delivery Service/数据库是唯一制品和收据所有者；Devkit 不建立第二份状态或跳过封存/激活。

## 不变量、合同及失败边界

- 修改仅在 OpenXiangda v2 Devkit 的制品收据核对，不改变上传 API、AppPackage、物理分类或服务器 schema。1.x 分发与维护包保持不变；其他租户已有制品能按同一规范分类复用，尚未上传制品照常上传。
- 去重必须同时匹配应用作用域内 GET 收据的精确 digest、平台规范 kind、Content-Type 和字节长度；`verifySealedAppPackage` 仍先核对本地原始字节、摘要、组件链接和配置/契约一致性。缺收据或字段不匹配不可伪造成功；服务器提交 DeploymentRun 和 Native prepare 仍再核验已存制品。
- 客户端保持逐项顺序上传且一条部署命令只产生一个平台运行。网络失败、重传竞态或并发部署结果未知时，先用 `status` 和 Head 回读；只有无运行且 CLI 明确给出可重试的制品上传错误才恢复相同主线候选。不要重试旧的 `APPLICATION_V2_CONFIGURATION_BUNDLE_REQUIRED` 永久失败运行。

## 安全、资源与回滚

收据通过原有登录态和应用管理权限查询，不读取 Secret 内容；本地发布包不写生产凭据。命中收据可避免经客户 VPN 再上传约 34.7 MB 的同一内容，减少额外 K3s/MinIO 写入；不增加代理、外部存储或并发传输。客户端修复可单独回退至旧 Devkit，代价是恢复冗余上传，不修改 Native Head 或已成功制品；若 npm 版本已发布，必须以新 patch 版前向修复，不能覆盖 registry 不可变字节。生产晋级仍复用已测 AppVersion，不因本修复直接晋级。

## 可证伪验收

1. 使用平台规范 kind 的真实形态收据测试 frontend/backend/config/contracts/manifest 的精确匹配，重复 `submitAppPackage` 不重复上传；错误 kind、digest、Content-Type 或字节长度触发正式上传，篡改本地 bytes 仍被封存校验拒绝。
2. 在 `master` 完成 Devkit 受影响门禁、Changeset 与发布验证；应用从已发布版本和同步主线执行官方测试部署，回执展示已存制品 reused，而不是再次向平台传输 34.7 MB。
3. 独立回读新 DeploymentRun、AppVersion、Native Head、K3s 工作负载和公开入口；失败时保留错误码、operationId 及原候选，不将本地测试当成业务验收或真实 CAS/HR/通知完成。
