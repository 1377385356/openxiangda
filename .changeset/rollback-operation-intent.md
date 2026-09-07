---
"openxiangda": patch
"openxiangda-cli": patch
"openxiangda-devkit-core": patch
---

Give each rollback intent a unique UUID-scoped idempotency key while allowing callers to reuse an explicit operation ID for uncertain network replay. This prevents one terminal run from permanently blocking a later rollback to the same immutable AppVersion.
