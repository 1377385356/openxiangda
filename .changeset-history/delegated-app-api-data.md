---
"create-openxiangda": patch
"openxiangda-nest": patch
---

Make generated user-facing App APIs preserve the verified RoleSession when they call Data API, while keeping workload OAuth2 data access exclusive to requestless Worker and Scheduler code.
