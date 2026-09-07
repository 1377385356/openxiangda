---
"openxiangda": patch
"openxiangda-cli": patch
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
---

Establish `openxiangda` as the only application-facing 2.0 package, expose the
curated config, core, field, React, NestJS, and testing subpaths, and ship the
matching AI Skill from the same exact package version. Move platform-owned
React fields, CRUD rendering, shell, runtime, and data-client behavior out of
generated applications, and replace the retired RoleSession browser contract
with the current logged-in user's authoritative application-role union.
