# School-contact head-teacher contract v2 (superseded)

> SUPERSEDED：该 RoleSession-bound client 已从公开 Nest SDK 撤下，等待
> current-user union 与 fail-closed 数据权限合同后重新设计。

- Problem evidence: DingTalk returns head-teacher status only as `teacher` membership `feature.is_adviser`; the platform stores it but the Native school-contact API currently exposes only guardian/student relations and the three broad platform identities.
- Capability owner: the platform organization service remains the sole owner of synchronized membership facts and `platformRoleCodes`. A 2.0 application reads them through the typed NestJS platform client and exposes its own App API; React never calls the platform endpoint directly.
- Stable invariants: `SCHOOL_HEAD_TEACHER` is additive to `SCHOOL_TEACHER`; it means the user heads at least one current class and cannot identify which class. Exact class membership comes from `querySchoolContactTeachers` and `isHeadTeacher`. No application-local copy or fourth DingTalk source role is introduced.
- Affected contracts: `openxiangda-nest` adds typed teacher/class query, record and page contracts plus `querySchoolContactTeachers`. Skills, docs and the standard template explain the global-role versus class-relation boundary. Existing guardian/student APIs are unchanged.
- Failure and concurrency: the client is a bounded read using the verified authorization and RoleSession. It adds no retry, cache, queue, mutable state or browser credential exposure; platform sync retains its existing complete-snapshot transaction and tenant lock.
- Security and resource bounds: the platform enforces tenant, app, RoleSession and all/self/class scope. Responses contain platform user ID, DingTalk userid, name and nullable mobile; applications return only fields needed by their App API and must not log full responses. Page size remains capped at 100.
- Rollback boundary: the Nest method, docs and template are independently removable. The additive platform identity and migration may remain after an SDK rollback. Existing 1.x applications and other 2.0 methods ignore the new contract.
- Falsifiable verification: typed tests must prove the exact `/school-contact/teachers` request, RoleSession headers and boolean serialization; package checks and `pnpm verify:affected` pass; Skills validation names both `SCHOOL_HEAD_TEACHER` and `teachers.list`/`querySchoolContactTeachers` without suggesting browser direct access.
