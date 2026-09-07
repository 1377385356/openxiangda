---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-nest": minor
"openxiangda": minor
"openxiangda-skill-kit": patch
---

Remove the pre-release RoleSession identity-switching surface and add optional
Perspective declarations as read-only projections over the current user's full
application-role union. Standard React pages, Native Data API reads, Gateway
assertions, request-scoped Nest Data API calls, and the AI Skill now share the
same signed Perspective contract; writes and workflow operations continue to
use the caller's complete authorization union.
