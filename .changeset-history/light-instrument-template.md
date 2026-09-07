---
"create-openxiangda": minor
"openxiangda-devkit-core": patch
"openxiangda-contracts": minor
"openxiangda-nest": minor
---

Replace the default application with the Vite, React Router, Refine Core, and
Ant Design instrument CRUD golden module, and exclude all generated frontend
trees from new workspaces. Local-SDK create now packs only the dependency
closure actually used by the application instead of injecting every historical
2.0 package.

Ensure malformed connected-development grants are revoked before startup fails.

Accept the frozen no-RoleSession gateway `role_union` principal and let the
Nest guard authorize verified role/capability unions while keeping the legacy
RoleSession path and `CurrentRoleSession` semantics unchanged.
