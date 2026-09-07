# ADR: Capability Contract Normalization

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：Accepted（2026-08-23）

## 1. 问题证据与能力所有者

instrument reference app 仪器黄金应用在补充 `instrumentCode` 的受保护字段能力后，部署
`0096f7bd-1e07-5201-b284-c65b5b28e76d` 于配置准备阶段失败，原始错误为
`NATIVE_CONTRACT_CLOSURE_MISMATCH`，JSON pointer 为
`/contracts/capabilities/17/name`。同一个共享 field-access capability code 在
`assetCode` 首次声明时生成名称 `仪器资源.assetCode.update`，字段顺序改变后又生成
`仪器资源.instrumentCode.update`。平台从 canonical config 重编译并拒绝闭包差异；其
fail-closed 行为是正确的。

根因在 `devkit-core` compiler：`compileApplicationSources` 已生成
normalized configuration/canonical bytes，却把原始 `OpenXiangdaAppConfig` 传给
`compileContractBundle`。`compileCapabilities` 因而依赖源对象的资源/字段迭代顺序。

能力所有者是 `packages/devkit-core` 的纯 compiler；平台 server、平台 closure
verifier、Data API 和应用页面不是本轮修改对象。工具链必须生成一个平台能从同一
normalized config 确定性重建的 contract。

## 2. 决定与稳定不变量

1. Contract capability 编译的权威输入是 `normalizeConfiguration(config)` 的
   结果，或行为完全等价的规范化 capability projection；不得直接以 raw config 的
   插入顺序、对象键顺序或 instrument reference app 字段重排作为语义。
2. capability identity 的稳定主键是完整 capability `code`；同一个 code 在一份
   contract 中最多出现一次。`name`、`kind`、`source` 仍是闭包语义，不得静默删除、
   降级或从 contract 中省略。
3. capability owner 先按既有 catalog invariant 校验，而不是用覆盖优先级修复冲突：
   平台保留 code 不允许应用显式声明，违反时返回
   `APP_CONFIG_AUTHZ_PLATFORM_CAPABILITY_RESERVED`；explicit 与 resource-derived
   code 不得复用，不同 resource 也不得复用同一个 code，后两类返回
   `APP_CONFIG_CAPABILITY_OWNER_CONFLICT`。同一 resource 内的多个 field policy 可以
   共享自定义 code；若共享 code 恰为该 resource operation code，则 resource owner
   保持既有定义并优先于 field-derived candidate。多个 field policy 共享同一自定义
   code 时，canonical owner 取规范化 `(resourceCode, fieldCode, operation)` 最小
   tuple，不取源声明首项。
4. normalized configuration 的资源与 field-policy key 按稳定 code/复合 key 读取，
   但 capability operation 顺序精确保持平台 verifier 合同：resource 使用
   `read/create/update/delete`，field policy 使用 `read/create/update`；同一操作内
   capability code 再按稳定顺序处理。canonical serialize→parse 不改变 capability
   projection。
5. 此修复只改变 compiler 的 artifact 生成确定性；不改变 capability code、kind、
   source 的业务语义，不放宽平台闭包校验，不引入第二权限源或兼容层。

## 3. 受影响合同、失败与并发行为

- 受影响合同：`openxiangda.config-bundle/v3` 与
  `openxiangda.contract-bundle/v3` 的 capability projection、contract digest、
  生成 TypeScript capability catalog，以及 compiler package 的公开输出。
- 同一 normalized configuration input 必须得到逐字节相同的 config/contract bytes、
  digest 和 generated TypeScript。当前 `normalizeDataResource` 保留
  `schema.fields` 的声明顺序，因此仅交换字段声明可以合法改变 normalized config
  的 schema 数组、configDigest 以及包含该 digest 的整体 contract bytes；这不属于
  本主题要改变的 schema 顺序语义。即使如此，只要共享 capability 的规范化 projection
  语义相同，capability entry/name/kind/source 与平台式 closure 结果必须保持一致。
- canonical 配置不可解析、capability code 跨来源冲突、超过预算或无法形成稳定
  owner 时，compiler fail closed；不会生成一个平台无法重建的近似 contract。
- 本轮不改变部署并发/幂等语义。平台继续以 artifact bytes 独立重编译并拒绝闭包
  不一致；compiler 只保证客户端产物与该算法的 canonical 输入一致。

## 4. 安全与资源边界

- `authz.capabilities` 的既有上限 2000 保持不变；本轮不提高上限、不新增未声明的
  capability。投影构造使用 bounded arrays/maps，不能因共享 field policy 重复项
  无界增长。
- code/name/kind/source 只从受校验的声明、资源元数据或平台 catalog 派生；不执行
  应用 JavaScript，不读取 Secret、环境标识、当前 Head、租户运行态或业务数据。
- 错误继续只暴露稳定 code/path/有界标识；不得回显 capability description、配置
  全文或 Secret。
- resource capability 被字段复用时，resource-derived owner 优先于 field-derived
  owner 的既有语义必须保留；显式 capability 与 resource/platform catalog 的冲突、
  以及跨 resource 复用仍由既有配置校验拒绝，不由 compiler 覆盖。

## 5. blast radius、回滚与发布边界

- 只改 `tools/openxiangda-v2` 中 devkit-core compiler、相关测试、架构文档和该包
  Changeset；不改 platform server、instrument reference app 工作区、旧 1.x 应用、其他租户数据或生产
  环境。
- 1.x 不读取 native-2 v3 artifacts；因此 1.x、其他租户和生产运行时零影响。未执行
  deploy、promotion、数据库迁移、OCI 构建或 npm publish。
- 回滚单元是本轮 compiler/package commit 与 Changeset。回滚前先停止消费本轮生成
  的未发布 package；不用回滚任何业务数据或平台 Head。平台 closure verifier 和
  已有成功 AppVersion 不改动。
- Changesets 只记录受影响 publishable package，版本和发布选择交给仓库既有
  Changesets 流程；本轮不手工指定发布版本。

## 6. 可证伪验证

必须同时满足：

1. compiler 单测构造同一共享 field capability code，分别以
   `instrumentCode`/`assetCode` 两种字段顺序声明；两次 capability entries 的
   code/name/kind/source 完全一致，并与平台式 closure 一致。测试不把因
   `schema.fields` 声明顺序而变化的 configDigest 或整体 contract bytes 当作失败。
2. 对 normalized configuration 做 `canonicalJson` 后再 `JSON.parse`，作为独立
   输入编译 capability projection；结果与直接编译 normalized configuration 完全
   一致。
3. 保留并通过 resource capability 被同一 resource 的多个字段复用时 resource owner
   优先的既有测试；同时保留 explicit/resource 与跨 resource 复用的
   `APP_CONFIG_CAPABILITY_OWNER_CONFLICT`，以及平台保留 code 的
   `APP_CONFIG_AUTHZ_PLATFORM_CAPABILITY_RESERVED` fail-closed 测试。
4. 用客户端生成的 contract bytes 运行与平台同算法的闭包回归：platform-style
   canonical recompile 与客户端 capability entries 逐项相等，且不会再产生
   `NATIVE_CONTRACT_CLOSURE_MISMATCH` 的 name 漂移。
5. 先运行 devkit-core/compiler 相关测试与类型/构建检查，再运行
   `pnpm verify:affected`。若 affected 检测为零任务或失败，必须记录原始结果并补
   足真实相关 package 检查，不得将零任务或单元测试替代为整体通过。
