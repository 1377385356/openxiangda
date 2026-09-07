---
"openxiangda-admin": minor
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-nest": minor
"openxiangda-skill-kit": minor
"openxiangda-workflow": minor
"create-openxiangda": minor
---

Move Workflow Kernel v2 completely onto the Native RoleSession and RoleSubject
model. Persist environment, membership revision, initiator, participant,
delegation, assignee, and operation snapshots; expose RoleSubject keys through
the SDK and Admin protocol; and verify the packaged toolchain with a fresh
PostgreSQL-backed application across restart, concurrency, delegation,
add-sign, transfer, return, withdrawal, and administrator termination.
