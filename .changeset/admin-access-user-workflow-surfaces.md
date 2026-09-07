---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda": minor
"openxiangda-cli": patch
"openxiangda-skill-kit": patch
---

Add the compiler-owned `frontend.admin.access` boundary and enforce it before
the React admin Shell or any admin page mounts. Move Todo and standard Workflow
desktop routes to authenticated user Surfaces, remove the pre-release admin
aliases, and generate the same immutable access expression for portal shortcut
visibility.
