---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-nest": minor
"openxiangda-admin": minor
"openxiangda-skill-kit": patch
---

Add exact server pagination to the Workflow Kernel work center with bounded `total`, `limit`, and `offset` metadata. Bind every page to the active RoleSession and role assignment, reject stale page responses in Admin, use deterministic local ordering, and document the standard low-to-medium-density workflow list surface.
