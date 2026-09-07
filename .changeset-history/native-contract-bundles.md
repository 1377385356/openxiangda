---
"openxiangda-contracts": minor
"openxiangda-compiler": minor
"openxiangda-devkit-core": minor
"openxiangda-nest": minor
"create-openxiangda": minor
---

Replace the alpha configuration source and flat bundle with the Native `native-1` config/contract bundle v3. Add explicit capability catalogs, App API operation and frontend route contracts, deterministic schema digests, closed-reference validation, environment-state rejection, generated contract constants, and the `OpenXiangdaOperation` Nest decorator. Seal generated application dependencies to the exact package versions from the same release set so new workspaces cannot silently start on stale SDK packages. This intentionally provides no automatic v2 conversion.
