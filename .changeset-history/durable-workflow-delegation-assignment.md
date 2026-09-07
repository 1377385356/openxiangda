---
"openxiangda-contracts": minor
"openxiangda-workflow": minor
"openxiangda-admin": patch
"create-openxiangda": patch
"openxiangda-skill-kit": patch
---

Make long-term Workflow delegation an effective assignment policy rather than
display-only configuration. Reject overlapping rules, show delegated assignees
during deterministic preview, freeze the delegation rule and validity window
into each task participant, route pending work to the delegate RoleAssignment,
preserve existing task ownership when a rule is revoked, and validate the
behavior through a distinct local user identity and real PostgreSQL restarts.
