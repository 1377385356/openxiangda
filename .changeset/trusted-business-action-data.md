---
"openxiangda-nest": minor
"openxiangda": minor
---

Add the request-scoped `OpenXiangdaBusinessDataApiService`. A declared
`OpenXiangdaOperation` now authorizes the caller once at App API ingress and
forwards immutable action proof to the platform's app-scoped trusted Data
channel while retaining the initiating user for records, files, and audit.
