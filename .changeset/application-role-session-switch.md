---
"openxiangda-contracts": patch
"openxiangda-cli": patch
"openxiangda-skill-kit": patch
---

Replace the incorrect current-user union/focused-role browser contract with application-local single-role switching backed by the platform-owned RoleSession context. Generated applications now replace their identity epoch after a role switch and automatically bind Data, Directory, managed-file, and App API requests to the active opaque RoleSession.
