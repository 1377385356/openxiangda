---
"openxiangda-contracts": minor
"openxiangda": patch
"openxiangda-cli": patch
---

Support conditional uniqueness for single-user references with exact stable identity values and boolean eq/ne activity predicates. Require data.unique-keys 1.1 only for the new forms while preserving existing rule requirements, strict declarations, scoped PostgreSQL enforcement and sanitized conflicts. Applications can enforce one active profile per platform user without copying identity or implementing a separate lock service.
