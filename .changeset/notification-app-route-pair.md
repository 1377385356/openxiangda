---
"openxiangda": minor
"openxiangda-cli": patch
"openxiangda-contracts": major
"openxiangda-devkit-core": minor
"openxiangda-nest": minor
"openxiangda-skill-kit": patch
---

Replace single-code application notification navigation with a canonical
desktop/mobile route-code pair. The platform validates both generated routes
against the active application contract, returns distinct Todo paths, and
selects the mobile path for DingTalk delivery while retaining one logical
message and one idempotency key.
