# 生成式用户标准面：我的记录 + 提交（2026-09-13）

状态：用户确认立项（方向 A），当日实施。

## 问题证据

简单 CRUD 应用（如 supplies-demo-20260913）开箱的用户端体验是空白：管理端有完整生成式 CRUD，
普通用户（app-user）登录后落在 `/home` 开发者指引占位页；且 `defaultRouteCode` 只允许指向 user
路由、标准生成页都在 admin 面，用户端唯一出路是自写 React 页面。用户 2026-09-13 会话确认按
"生成式用户标准面"方案解决。

## 决策

- CRUD 视图新增 `user` 选择（布尔或 `{ home?, listLabel?, submitLabel? }`）：声明即生成两个
  user surface 标准页——"我的记录"列表（默认按 `created_by = 当前用户` 过滤）与"提交"表单页，
  复用标准字段渲染与 `GeneratedResourceFormPage`，桌面/移动双端。
- 路由清单新增 `resource-records` / `resource-submit` 两种 kind，entry 携带 `resourceCode`；
  能力接线：列表要求资源 read，提交要求 create。
- 首页接线：启用 user 面且 `home !== false`（多资源时显式 `home: true` 优先，否则首个启用资源）
  时，清单 rootEntry 指向"我的记录"；运行时登录回跳解析在贡献路由未命中时回退 rootEntry。
  不改写应用声明的 defaultRouteCode，占位 `/home` 保留为普通路由。

## 所有权与不变量

- 平台仍是数据/授权唯一所有者；生成页只做展示过滤，"仅本人可见"不是授权边界——行级只读隔离
  仍由 dataPolicies 声明承担（文档明示）。
- `created_by` 过滤通过查询契约的显式 `createdBy` 参数表达，不放宽任意系统字段过滤；
  服务端仍要求资源 read 能力。
- 能力判定沿用清单路由 capability；无能力的用户看到标准 403 面。

## 影响与回滚

影响：contracts（kind+resourceCode）、devkit-core（声明/校验/清单编译）、openxiangda 运行时
（两个标准组件+清单校验+登录回退）。纯增量契约，旧应用零变化；回滚即回退本批提交。

## 可证伪验收

1. 声明 `user: true` 后契约清单含 `user:<code>:records|submit` 双端路由，能力分别为 read/create。
2. rootEntry 指向我的记录；登录普通用户回跳落在该页。
3. 列表仅显示当前用户创建的记录（实测 created_by 过滤生效）；提交页成功后回列表。
4. 无 read 能力的角色访问列表得到 403 标准面。
5. 未声明 user 面的应用契约摘要除编译器版本外不变（行为零漂移）。
