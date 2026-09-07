---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-cli": minor
"openxiangda-mcp": patch
"openxiangda": minor
---

Add the fail-closed Studio site-bound workspace initialization contract. The
existing create command can now bind an already provisioned site Application
without creating remote application or Git authority, persist and re-read the
ProjectProvisioningRun/template/compiler facts, reject retry drift, and return
a path-free canonical workspace digest through ordered JSONL events.
