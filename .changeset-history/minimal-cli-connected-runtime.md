---
"openxiangda-cli": major
"openxiangda-devkit-core": major
"create-openxiangda": major
"openxiangda-skill-kit": major
"openxiangda-contracts": patch
"openxiangda-mcp": patch
---

Replace the pre-release developer surface with the eight-command OpenXiangda 2.0 loop: `create`, `dev`, `check`, `deploy`, `status`, `logs`, `rollback`, and `login`.

Remove the local platform/PostgreSQL runtime, the secondary creator and skill-kit bins, all legacy public command topics, and user/dev/JIT Oclif plugin injection. Creation now installs, links, and provisions a workspace; connected development remains loopback-only and revokes its remote session on shutdown; test deployment is the default and production remains explicit.
