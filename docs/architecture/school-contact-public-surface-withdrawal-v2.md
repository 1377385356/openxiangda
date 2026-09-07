# School-contact public surface withdrawal v2

> SUPERSEDED: 当前身份结论由
> [SDK、模板与 AI Skill 收敛决策](./package-skill-convergence-v2.md)统一定义为 current-user
> 角色并集且不使用 RoleSession；本文仅保留为 alpha 决策记录。

## Decision

- Problem evidence: the public Nest client requires application developers to pass a `roleSessionId`, while the platform grants tenant-wide `all` access when no school-contact scope capability is allowed. Both behaviors conflict with the CRUD north star.
- Capability owner: the platform organization center remains the only owner of school identities and relationships. OpenXiangda 2.0 does not create another store or authorization path.
- Stable invariants: application developers never select a RoleSession; interactive access uses the verified current-user role union; no allowed scope means none/403; React never calls platform relationship endpoints directly.
- Affected contracts: remove the RoleSession-bound school-contact methods, types and export from `openxiangda-nest`; remove the Skill reference and current guide; keep platform-owned directory data unchanged.
- Failure and concurrency: callers receive a compile-time missing API instead of silently using an unsafe runtime path. No database, queue, lock or mutable release state changes.
- Security and resource bounds: this is a fail-closed surface reduction. School-contact payloads, phone numbers and relationship records are not copied or logged.
- Rollback boundary: reverting this toolchain commit restores only the old SDK surface. Restoring it is forbidden until a new platform contract supplies current-user union and explicit fail-closed scopes.
- Falsifiable verification: the Nest package contains no school-contact exports or methods; the sole Skill and current README contain no school-contact/RoleSession guidance; package checks, Skill manifest validation, affected verification and packed distribution gates pass.
