# 普通 CRUD 复用 Data API 的引导与门禁

状态：2026-09-13 用户确认实施。本轮只处理"AI/开发者绕过平台 Data API、用 Nest 重写增删改查"这一主题；相邻的应用规格结构化产物另行处理。

## 问题证据

规则本身已在北极星 §10、根 SKILL、工作区 AGENTS、development、backend、frontend 六处声明，但真实使用中 AI 仍倾向自写 Nest 接口实现数据增删改查，导致重复实现校验、权限与事务并产生缺陷。引导材料存在三个可验证缺口：

1. 正面路径零文档：浏览器端消费标准 Data API 的实际入口
   `createNativeResourceClient`、`transactNativeData`、`batchAggregateNativeResources`
   在全部 Skill 参考与随包资料中出现次数为 0；而 `backend.md` 有 162 行、12 段代码与完整
   扩展示例。模型倾向模仿被描述最详细的集成面。
2. 只有禁令没有决策表：没有任何材料告诉 AI 在"想写后端接口"的决策点，平台已有哪些
   声明式替代（幂等、事务守卫、聚合、导入导出、标准页面），以及何种需求才真正需要 Nest。
3. 门禁为零：devkit 对应用 `apps/server/src` 的唯一检查是显式 `@Inject`；
   包装 `OpenXiangdaDataApiService` 的 CRUD controller 可以通过 check/dev，违规无反馈。

## 能力所有者与不变量

- 平台仍是身份、授权、数据、事务与部署的唯一所有者；本轮不新增平台接口、不建立第二事实源。
- 不变量：应用自写的每个 HTTP 路由必须是已声明、带能力门禁的业务动作
  （`openxiangda.config.ts` 声明 operation + capability `kind: 'backend'`，
  controller 方法以 `@OpenXiangdaOperation(appOperations.<code>)` 绑定编译产物）；
  普通 CRUD 只经浏览器 Data API 或标准 CRUD 页面执行。
- 引导材料与门禁属于工具链（devkit-core + 根包资料）所有者职责，不进入平台服务端。

## 影响的契约

- 文档正源：`docs/development.md`（Nest 决策表）、`docs/frontend.md`（正面数据访问）、
  `docs/backend.md`（入口交叉引用）；Skill 参考与根包资料由同步器从同一正源生成。
- 工作区 AGENTS 模板（`packages/cli/template/AGENTS.md`）补一行决策指向。
- devkit 新增源码级检查 `OPENXIANGDA_NEST_CONTROLLER_OPERATION_REQUIRED` 与
  `OPENXIANGDA_NEST_OPERATION_CONTRACT_MUST_BE_DECLARED`，挂入既有 check/dev 诊断管线；
  不改变 CLI 命令面、编译产物或运行时行为。
- 生成后端模板无 controller，示例 `submit.controller.ts` 已合规；现有应用若无自写
  controller 则本轮门禁零影响。

## 失败/并发与安全边界

- 检查是静态 AST 判定，不执行应用代码；误报面限于应用自写 controller，
  平台基础设施 controller 位于 `openxiangda/nest` 包内，不在扫描范围。
- 门禁 fail closed：未绑定已声明 operation 的路由在 check/dev 直接 error，
  不提供旁路开关；补救路径是删除自写 CRUD 或按 backend.md 正式声明 operation。
- 运行时授权行为不变；本轮不放宽任何能力。

## 回滚边界

文档与模板改动可独立回退；devkit 检查可按提交回退，二者互不依赖。
不涉及数据库迁移、发包组合变更或平台部署。

## 可证伪验收

- 含未绑定 operation 的 `@Controller` 应用运行 `check` 必须失败，错误码指向补救指引；
  绑定 `appOperations.*` 的示例应用 check 必须通过。
- 全部 Skill 参考与根包资料中可检索到 `createNativeResourceClient` 用法与 Nest 决策表；
  `scripts/sync-developer-guidance.mjs --check` 通过。
- `pnpm verify:affected` 通过；不宣称真实浏览器或生产验收。
