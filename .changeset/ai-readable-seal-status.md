---
"openxiangda": minor
"openxiangda-cli": patch
"openxiangda-devkit-core": minor
"openxiangda-skill-kit": patch
---

Make `check --json` report and persist an explicit sealed-artifact status. AI
clients can now distinguish an older package on disk from the current unsealed
check and follow the exact check-or-deploy next command.
