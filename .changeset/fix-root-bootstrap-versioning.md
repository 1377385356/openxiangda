---
---

Teach prerelease version materialization that the canonical AI Skill keeps the
root-package version token in source and receives its exact `openxiangda`
version only during root-package prepack.
Refresh the workspace lockfile after Changesets updates exact internal package
versions so release verification never observes stale dependency specifiers.
