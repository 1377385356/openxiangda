---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda": minor
"openxiangda-skill-kit": patch
---

Add bounded operation-time guards for create/update datetime windows and advertise
Data API 1.1.0. Dynamic guards share the platform's post-lock acceptance time;
successful transaction replay preserves the original evaluatedAt receipt.
