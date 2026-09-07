---
"openxiangda": minor
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-skill-kit": patch
---

Add explicit event-subscription platform access for standard business
notifications. The compiler now preserves the declaration in the immutable
configuration and contract bundles and derives the exact Notification Hub v2
capability requirement for signed event handlers, without forcing unrelated
event consumers to depend on Notification Hub.
