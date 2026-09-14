---
'openxiangda-devkit-core': minor
'openxiangda-skill-kit': patch
---

模块视图的查询与分组选择放行 system 字段（GAP-MODULE-003）。

- `crud[].list` 的 `filterFields`/`searchableFields`/`sortableFields`/`defaultSort` 与 `sections.fields` 现在可以引用 `system: true` 字段：与低层 `data.resources` 的 system+filter 语义对齐（外键标识、归属快照等"系统维护、按它筛选"的字段，本缺口阻塞 40/74 资源的模块化迁移）。
- 展示与可写选择（`list.fields`/`form.fields`/`detail.fields`）维持拒绝 system 字段；hidden 字段在任何选择中仍然拒绝；未声明/拼写错误字段仍然 fail-closed。
- 投影输出不变：filter/searchable/sortable/section 按选择落到字段上；共享校验器字节不变。
