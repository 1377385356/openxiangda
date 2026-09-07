---
"openxiangda-admin": minor
"create-openxiangda": patch
"openxiangda-skill-kit": patch
---

Extract the standard data page's identity-scoped query lifecycle into a reusable Data Workbench controller, reject stale reads across query and role changes, configure the Admin design system's Chinese locale globally, and verify generated applications continue to send search and sorting to the server. Fresh apps now derive the reference App API capability from their generated app code instead of retaining the template identity, and local timer concurrency verification claims an explicit schedule snapshot so consecutive manual advances are not mistaken for duplicate delivery.
