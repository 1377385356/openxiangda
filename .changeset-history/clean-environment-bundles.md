---
"openxiangda-compiler": minor
"openxiangda-devkit-core": minor
"openxiangda-cli": minor
"create-openxiangda": patch
---

Make event, timer, workflow activation, and workflow provider declarations environment-neutral so one immutable AppVersion can be promoted unchanged between environments. Require production to reuse a successful preproduction AppVersion, verify its Git upstream locally, and remove direct production package deployment from the CLI.
