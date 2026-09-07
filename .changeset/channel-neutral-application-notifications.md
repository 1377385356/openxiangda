---
"openxiangda-contracts": patch
"openxiangda-nest": patch
---

Add the channel-neutral `application-send/v2` notification contract and a
request-scoped Nest SDK method. The verified platform context now owns tenant,
application and environment scope while applications provide templates,
variables, recipients, canonical detail targets, monotonic states and
idempotency keys for create, update and close delivery convergence.
