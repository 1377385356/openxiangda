# School-contact default access v2 (superseded)

> SUPERSEDED：无显式允许规则必须是 none/403，不能回退为 all。

## Decision

- Problem evidence: the product contract says an authenticated application user defaults to the unrestricted tenant-local school-contact scope, while `OpenXiangdaSchoolContactV2Service.resolveAccess` currently denies a valid Principal when its active RoleSession has no explicit school-contact capability.
- Capability owner: the platform school-contact service owns relation data-scope resolution. The Native authorization kernel remains the owner of Principal and RoleSession verification and is not bypassed or duplicated.
- Stable invariants: platform identity codes remain descriptive claims rather than switchable application roles; tenant, application, environment, Principal, RoleSession, pagination, and query enforcement remain server-verified.
- Contract: a verified non-guest Principal with no explicit school-contact scope defaults to `all`. Explicit `read`, `class:read`, and `self:read` resolve in the order `all > class > self`, allowing an application role to narrow the default. Invalid or missing Principal/RoleSession continues to fail before data access.
- Failure and concurrency: authorization errors propagate unchanged; access resolution is read-only and introduces no cache, retry, queue, lock, or cross-request state.
- Security and resource bounds: the default applies only after the existing v2 authentication and RoleSession boundary and never relaxes tenant/application isolation. The broader authenticated-user visibility is the explicitly accepted product policy.
- Affected contracts: the typed NestJS school-contact client and response types do not change. Only the default scope selected by the platform service changes.
- Rollback: code and documentation rollback only; there is no migration or persisted authorization rewrite.
- Falsifiable verification: tests prove default `all`, explicit `class`/`self`, widest-capability precedence, and fail-closed missing Principal evidence; `pnpm verify:affected` must pass.
