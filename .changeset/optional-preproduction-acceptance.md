---
"openxiangda": minor
"openxiangda-cli": minor
"openxiangda-devkit-core": minor
"openxiangda-skill-kit": patch
---

Add the explicit `openxiangda accept --plan <file>` command for optional,
expiring real-identity acceptance in preproduction. The command is never
invoked by check or deploy and never participates in a release gate.
