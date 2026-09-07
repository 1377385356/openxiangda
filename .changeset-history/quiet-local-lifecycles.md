---
"openxiangda-devkit-core": minor
"openxiangda-cli": minor
"openxiangda-skill-kit": patch
"create-openxiangda": patch
---

Add workspace-scoped local development status, safe foreground shutdown, and
explicit data reset commands. Require Docker for full local development without
requiring a native PostgreSQL installation, fail Doctor when the daemon is
unavailable, preserve volumes by default, and verify process, container, volume,
and credential ownership before any destructive reset.
