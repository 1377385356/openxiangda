---
"openxiangda-contracts": patch
---

Require each locked record assertion to bind exactly one mutation of the same
resource record, so platform authorization, row locking and bounded business
invariants share one explicit transaction boundary.
