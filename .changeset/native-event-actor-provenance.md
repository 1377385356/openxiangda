---
"openxiangda-contracts": patch
---

Accept the existing platform audit provenance on signed Native data events with
strict, bounded nested schemas. Named business actions and sealed data repairs
no longer fail event receipt validation because of their initiating-user and
action metadata. Signature, environment, body limits and receipt ownership are
unchanged; unknown or secret-shaped actor fields remain rejected.
