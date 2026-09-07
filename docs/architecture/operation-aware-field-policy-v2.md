# ADR: 字段权限按 create / update 区分

状态：Accepted
日期：2026-08-21
上游决策：`sy-lowcode-main/docs/architecture/openxiangda-2.0-operation-aware-field-policy.md`

## 问题与能力所有者

仪器黄金矩阵要求学院管理员创建时填写 `collegeId`，更新时却不能迁移学院；统一
`fieldPolicies.write` 无法表达。校级管理员依赖 `college:*` 也与 Native SQL 的精确
维度匹配不一致。字段、操作和行范围仍由平台 Native Data API 权威执行；应用只声明
策略，前端只做体验保护。

## 决定与稳定不变量

- `DataFieldPolicy` additive 增加 `create`、`update`，canonical 保留
  `{ read, create, update, write, mask }`。
- create/update 按键存在优先；显式 `[]` 是拒绝；缺键才 fallback legacy `write`。
- 公开 access 中 `write` 是保守旧视图 `effectiveCreate && effectiveUpdate`，避免旧客户端
  开放服务端会拒绝的操作。
- `AppDataPolicy.unrestrictedRoleCodes` 只跳过该策略的行谓词；资源、字段、Head、revision
  和业务校验不跳过。
- 更新表单必须从 payload 删除无 update 权限字段，不能只 disabled。
- 删除仍只检查资源 delete 能力和行范围，不增加字段策略。

## 受影响合同与边界

本切片修改 contracts/schema、compiler canonical bundle/capability closure、仍发布的
Admin/User 通用 Data UI，以及仪器模板。平台 SQL/RLS 由独立平台提交实现；本仓不改
平台、CLI 命令面、DataQuery OR、事务、导入、Workflow、OAuth 或 1.x。

仪器模板声明：school_admin 五字段 create/update 且 unrestricted；college_admin
五字段 create、更新允许除 `collegeId` 外四字段；instrument_admin 五字段 update
显式拒绝。学院行范围继续用 `collegeId`，仪器管理员继续用
`instrumentAdminIds contains current_user`。

## 失败、资源与回滚

无字段能力时 UI 删除 payload 字段，平台仍以 403 为权威；409 revision 行为不变。
不增加状态存储、影子字段或表达式解释器。回滚须先撤回使用新键的环境 Head，再恢复
本提交前 package 组合；业务数据无需回滚，旧 `{ write: [...] }` 声明继续有效。

## 可证伪验证

1. contracts 覆盖 legacy write fallback、显式空数组和 canonical digest 稳定；
2. compiler 将 create/update/unrestrictedRoleCodes 纳入 bundle 和 capability closure；
3. school/college/instrument 黄金矩阵由模板静态与 UI payload 测试覆盖；
4. Admin/User 公共 Data UI 不再只读取 write；
5. template check/test/build/e2e、source-artifact create 和 `verify:affected` 通过。
