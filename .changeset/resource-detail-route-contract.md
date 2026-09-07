---
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
"openxiangda-cli": patch
"openxiangda-mcp": patch
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
"openxiangda": patch
---

Add an explicit desktop/mobile business-record detail route mapping to Native
resource declarations. The compiler seals only bounded authenticated user
routes with the resource read capability, generated SDK definitions expose the
mapping, and Workflow surfaces can resolve the active contract without guessing
paths from resource codes. Document the declaration and fail-closed behavior in
the shipped Skill and application template.
