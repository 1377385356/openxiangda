---
"openxiangda-contracts": minor
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
---

Add bounded read-only `record-exists` and `record-match` transaction guards so
business actions can require visible records across resources without forcing
an unrelated mutation or bypassing current-user read authorization.
