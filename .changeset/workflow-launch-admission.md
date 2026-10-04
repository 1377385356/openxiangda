---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-cli": patch
"openxiangda": patch
---

Add optional Workflow launchPreflight.requiredApprovalNodes for synchronous, bounded native participant admission inside the BusinessProcess data transaction. Both compilers validate approval references/providers and require workflow.launch-preflight only for explicit declarations. Actual task entry continues to resolve current participants.
