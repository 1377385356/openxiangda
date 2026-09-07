# Native CRUD 黄金能力门槛

状态：2026-08-21 已实施。根仓 `openxiangda-2.0-native-golden-crud-capability.md` 是跨仓权威；本文记录 v2 工具链半边。

## 不变量

- compiler 对任何包含 Native Data Resource 的 AppPackage 自动加入 `data.native-golden-crud`。应用声明没有关闭、替换或降级入口；无 Native Data Resource 的包不误加。
- `requiredPlatformCapabilities` 由 compiler 生成并按 code 排序、去重；每项携带精确 contractVersion 与能力相关声明的 usageDigest，并整体进入 AppPackage digest。应用改名不影响该平台语义 key。
- `openxiangda deploy` 在 workspace check、Docker/Buildx、push、artifact upload 和 DeploymentRun 前，用当前 config 推导同一 required capability 集合并预检平台 capabilities。
- 每个 required capability 都只有 `status: "available"` 且 contractVersion 精确相等才可通过；缺失、`preview`、`planned` 或版本不符均在写入前拒绝。
- 失败 remediation 固定为“先升级平台再重试 openxiangda deploy”，不建议 RoleSession、Function CRUD、手改 manifest 或回退应用。

## 验证

compiler 测试覆盖自动加入、无 Data Resource 不加入和 digest 稳定；Devkit 测试覆盖 required capability 的 missing/preview/planned/版本不符拒绝；CLI 黑盒证明拒绝发生在零 Buildx、零 artifact upload、零 DeploymentRun，并证明 fresh app 最终 AppPackage 包含结构化 exact key。
