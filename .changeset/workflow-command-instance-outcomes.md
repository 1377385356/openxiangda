---
"openxiangda-contracts": patch
"openxiangda-cli": patch
"openxiangda": patch
---

Use the Workflow instance's authoritative approved and rejected statuses in atomic business command transition guards. The previous completed status belongs to tasks and prevented final approval and rejection from committing.
