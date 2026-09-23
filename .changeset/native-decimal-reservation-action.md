---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
---

Introduce a bounded immutable Named Action declaration and BusinessProcess request contract for Native exact-decimal reservations and terminal transitions. Both compilers validate the same resource field mapping and status values, preserve the declaration in the sealed configuration, and require the new platform capability. The request bounds the parent, child operation, idempotency key, currency, and positive NUMERIC(18,2) amount. Runtime activation remains gated on the platform transaction implementation.
