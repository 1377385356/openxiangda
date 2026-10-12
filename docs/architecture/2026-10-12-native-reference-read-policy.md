# Native 单引用当前父范围读取

状态：隔离候选已实现，PLT-052。SDK 与平台配套后才可启用；此记录不证明 npm 发行、学校部署或业务验收。

旧业务订单和日志保存文本仪器编号及负责人快照。负责人移除、学院调整后，复制的范围不再反映当前父记录；浏览器筛选也不能承担授权。现有 parentRead 只绑定唯一正式子表和 UUID 外键，不覆盖独立业务记录的 resource-ref.single。

平台拥有当前成员、字段能力、Perspective、行策略及存储关系。新增只读 referenceRead 声明 resourceCode、referenceFieldCode、readFields。引用字段必须是指向目标的 Native resource-ref.single，值只取其 resourceCode/value UUID，标签与 snapshot 均不作身份。readFields 为显式、非空、有界、无重复的父读取投影，包含父授权依赖字段；相应字段能力须属于处理当前子行的同一个有效成员。

每个资源的继承叶必须指向同一个父资源。包含 parentRead/referenceRead 的依赖图无环、最多两条边。原 parentRead 多层 parentRead 拒绝规则保持；正式 referenceRead 能力明确支持一次子表到订单、一次订单到仪器的混合链。编译器拒绝未知键、文本或多值引用、错 target、写策略、孤立策略、缺字段、缺授权投影、多个父、环和超过两层。

运行时在同租户、应用、当前环境、Head、AppVersion、authz/scope 版本和当前登录会话下重新核验根请求。父/子资源读取能力、引用字段能力、父投影字段能力和所有父行策略使用同一个 membership UUID；不同成员不能拼接。每层保留当前 Perspective。普通用户的 authenticated publicRead 投影不能借此获得私有子行。匿名、服务、工作流和 mutation returning 不继承；平台内部专用主体沿其已有边界。

SQL 通过新 expand/auto/downtime=false 迁移增加独立 source_kind、密封引用列和只读帮助函数，再用前驱摘要与执行元数据守卫扩展现有 evaluator，保留 OID、owner、ACL、已有 rule.operation 和 parentRead 分支。不改历史 SQL、不现场注入函数。运行时重新验证当前 Native 引用绑定、当前图有界及实际父行，数据/声明异常拒绝。

引用写入仍需要独立 create/update 能力与字段授权。平台不修订应用状态机，不把 manage 补足写能力。应用需从原快照精确 UUID 映射关联，重复/孤立条目隔离，原文本与归档保留；关键业务动作按实际仪器 UUID 写引用并复核 actor/revision，不复制负责人作为永久授权。

验收：ESM/CJS 公开导出、声明/编译/打包和精确 capability requirement；实际 PostgreSQL RLS 覆盖当前负责人第二项、移除/学院变化、兼任 OR、同成员闭包、私有字段、Perspective、root/parent 不同字段、混合两层、环/第三层/关系撤销、错租户/环境/版本、失效成员、mutation returning、原 parentRead 与 manage 操作不回归、幂等/OID/ACL/owner/前驱漂移。部署后需学校真实角色与三端订单/日志/成本回读，单元测试和 Pod Ready 不代替。

回退：先回到不含 referenceRead 的正式 Head，停用新声明。新 SQL 扩展列保留；如需恢复 evaluator，走后续正式迁移且验证当前配套。保留原 UUID、流水、revision、归档和运行回执，未知请求沿原键恢复。

## 2026-10-12 隔离验证记录

真实 PostgreSQL 的 `openxiangda_data_api` RLS 角色完成 51 项断言，使用仓库原历史 kernel 函数与正式 parentRead、rule.operation、referenceRead SQL 迁移。新增验收覆盖完整有效的三边依赖拒绝、两边恢复、完整有效的循环和多父拒绝、公开父自身可读但私有子/孙不可读、当前成员撤销、父/子资源读取能力撤销、根私有字段能力、严格范围投影健康及版本一致。仪器负责人和学院变化、同成员不能拼接、Perspective、租户/环境/Head/AppVersion、匿名/服务/mutation、精确当前父不存在、投影缺字段、原 manage 行为与原 parentRead 保留均已断言。迁移重放保留 evaluator 的 OID/owner/ACL，前驱与执行元数据漂移拒绝；临时数据库在退出时删除。学校写入为 0。

服务端 callback normalize、materializer、两项引用密封列的持久化防漂移及原 parentRead 四套 Jest 共 44 项通过，迁移规则校验 301 项通过。类型检查使用本候选真实编译后的 contracts 声明路径；原 server vendor 仍是 2.78.0，未替换 vendor/lock，也没有把本候选伪装为已发行包。独立临时 tsconfig 仅把当前无声明的废弃 `@types/bull` stub 从自动扫描项剔除，保留全部实际声明；这是候选兼容证据，正式配套封包仍需按官方 tarball 验证。scoped lint 为 0 errors，保留原 materializer 三个 unused-destructure warnings。

证据由 `/home/yuxing/.cache/zjnu-validator-pairing-20261012/reference-read-real-pg.json`、`reference-read-server-targeted-jest-final.log`、`reference-read-server-types-final.log`、`reference-read-migration-rules.log` 和 `reference-read-server-lint-last.log` 固定；完整机器回执随此主题在 `docs/verification/native-reference-read-policy-20261012.json` 保存。先保留原失败日志，使用要求的 Node 24 和固定 pnpm 10.15.1 进行 SDK 验证，不修改全局 Node 或 Corepack 默认，也不跳过失败检查。

SDK `pnpm verify:affected` 已通过，24 个 task 成功，其中 23 项缓存沿原同输入成功结果复用；真实 CLI login/create/dev/check/deploy/status/logs/rollback 也通过。Node 24.20.0、pnpm 10.15.1、既有 pnpm store/npm cache 和代理均为本任务进程参数。受影响 devkit 包测试为 567 pass、2 skip、0 fail，跳过项未计为通过；专项 referenceRead+parentRead 的 contracts ESM/CJS 58 项及 devkit 4 项无跳过。`pnpm docs:generate:from-build` 通过，开发资料正文与 Skill 引用仍由原生成器保持一致。正式 npm 发行、官方 tarball 配套、学校部署及学校真实角色验收尚未执行。
