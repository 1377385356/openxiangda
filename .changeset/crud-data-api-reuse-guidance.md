---
"openxiangda-devkit-core": minor
"openxiangda": minor
"openxiangda-cli": patch
"openxiangda-skill-kit": patch
---

Close the CRUD Data API reuse loop: document the positive data-access path (`createNativeResourceClient`, `transactNativeData`, server-side aggregation) in the developer guidance, add a Nest enablement decision table, and reject application controller routes that are not bound to a declared `@OpenXiangdaOperation(appOperations.<code>)` operation during check and dev.
