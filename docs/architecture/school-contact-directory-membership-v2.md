# School-contact directory membership contract (superseded)

> SUPERSEDED：平台目录字段可以保留，但 RoleSession-bound SDK 与默认 all
> 数据范围不进入当前 OpenXiangda 2.0 CRUD 发布面。

- Problem evidence: the platform now flattens synchronized school members directly into class departments, supports manual class identities, and exposes head-teacher relationships in both teacher-to-classes and class-to-teachers directions. The existing typed client did not describe nullable manual DingTalk IDs, relationship provenance, or the two new fields.
- Capability owner: the platform organization center remains the sole owner of tenant users, school classes, identities, head-teacher assignments, synchronization state and guardian/student relations. The NestJS client only consumes that contract.
- Stable invariants: no browser direct access, no application-local relationship master, no inference of family relations from class membership, no inference of exact managed classes from the global role, and no cross-tenant access. Synchronized and manual data share the same read contract.
- Affected contracts: `openxiangda-nest` school-contact types add nullable `dingtalkUserId`, `source`, `teacher.managedClasses` and `class.headTeachers`. The v2 Skill and documentation explain their use. Existing method paths, query filters and authorization remain unchanged.
- Failure and concurrency: platform snapshot reads remain paginated and return the last successful sync metadata. Apps treat disabled/stale sync as a freshness state, not as proof that a relationship never existed.
- Security and resource bounds: verified current-user authorization is forwarded by the NestJS client; callers never accept tenant, role or scope from browser input, never log full relationship payloads and keep page size bounded.
- Rollback: all additions are optional/read-compatible response fields. Reverting this toolchain commit restores the older type surface without mutating platform relationship data.
- Falsifiable verification: `openxiangda-nest` typecheck/tests and repository `pnpm verify:affected` pass; Skills validation resolves the new reference; docs explicitly cover default all scope, manual source, nullable identifiers and both head-teacher directions.
