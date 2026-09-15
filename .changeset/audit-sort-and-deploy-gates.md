---
'openxiangda-contracts': minor
'openxiangda-devkit-core': minor
'openxiangda': minor
'openxiangda-cli': patch
'openxiangda-skill-kit': minor
---

平台审计列排序与部署 Workflow Head 预检（决策记录：docs/architecture/audit-sort-and-deployment-gates-v2.md）。

- `list.defaultSort.field` 与视图级 `sortableFields` 现在可以引用平台审计列（`created_at`/`updated_at`/`created_by`/`updated_by`/`id`/`revision`），无需也无法在资源 fields 中声明：与 Data API `order` 已接受的系统列对齐，"按真实创建时间倒序"直接写 `defaultSort: { field: 'created_at', order: 'desc' }`，不再复制业务时间字段。`searchableFields`/`filterFields` 与展示/可写选择维持只认已声明字段，未知字段仍 fail-closed。
- `openxiangda-contracts` 新增 `DATA_SYSTEM_SORT_FIELD_CODES` / `isDataSystemSortField`；命名视图 defaultSort 校验接受系统列。
- 标准 Admin 列表内置"创建时间/更新时间"列可点击排序并进入排序面板；defaultSort 为系统列时直接生效。
- `openxiangda deploy` 与 `deploy --dry-run` 在构建前只读比对源码 `workflows.activations` 与环境 Head：版本低于已激活版本报 `DEPLOY_WORKFLOW_ACTIVATION_VERSION_REGRESSION`（拒绝部署），源码缺失已激活流程报 `DEPLOY_WORKFLOW_ACTIVATION_ABSENT`（warning，本次部署会停用），目录查询不可用报 `WORKFLOW_HEAD_PREFLIGHT_UNAVAILABLE`（拒绝盲部署）。
- `docs/backend.md` 补充事务内跨操作 id 引用（`{ operationIndex, field: 'id' }`）的正式示例与约束。
