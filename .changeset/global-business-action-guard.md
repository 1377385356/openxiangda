---
"openxiangda-nest": patch
"openxiangda": patch
---

Register the business-action authorization guard globally after Gateway
transport verification so every `OpenXiangdaOperation` capability is enforced
before its controller runs.
