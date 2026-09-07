---
"openxiangda-cli": minor
"openxiangda-compiler": minor
"openxiangda-devkit-core": minor
"openxiangda-nest": minor
"openxiangda-skill-kit": patch
"create-openxiangda": minor
---

Make local application events declaration-driven and durable. Generate typed
subscription codes and workspace-scoped signing credentials, write Data API
changes and event outbox records in one PostgreSQL transaction, dispatch signed
CloudEvents to the real NestJS backend with leased `SKIP LOCKED` claims, and
persist platform receipts so application restarts suppress duplicate side
effects. Classify retryable responses, honor `Retry-After`, fence stale workers,
preserve paused deliveries, dead-letter deterministic failures, and deduplicate
manual replay by operation key. Run browser acceptance through the official
`openxiangda dev --ui-only` lifecycle and extend the fresh packed-application
PostgreSQL gate across pause, resume, delivery, replay, restart, and reset.
