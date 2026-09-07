---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-nest": minor
"openxiangda-skill-kit": patch
"openxiangda": minor
---

Add the platform-owned business notification sender for authorized Named
Actions and active signed event deliveries. The SDK no longer requires ordinary
users or date-trigger consumers to own the global Notification Hub management
permission; the platform retains initiating user/action or event-delivery
audit, resolves event recipients from immutable projections, and converges
retries through eventId, idempotencyKey, messageKey, and sourceSequence. Also
retire managed legacy 2.0 sibling Skills when installing the canonical AI Skill.
