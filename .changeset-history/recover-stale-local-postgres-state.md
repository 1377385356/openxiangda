---
"openxiangda-devkit-core": patch
---

Allow `openxiangda dev reset --data` to discard a malformed local PostgreSQL
credential after its Docker container is already gone, while preserving the
existing workspace, runtime, credential-digest, and volume ownership checks for
every Docker resource that still exists. Extend the packed PostgreSQL lifecycle
gate with explicit workflow idempotency and single-use preparation assertions,
concurrent CAS error verification, and stale event-worker lease fencing.
