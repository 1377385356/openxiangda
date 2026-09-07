---
"openxiangda-devkit-core": minor
"openxiangda": minor
"openxiangda-cli": patch
"openxiangda-skill-kit": patch
---

Move generated resource CRUD into the stable desktop and mobile admin
namespaces, pass the compiled route catalog through all generated navigation,
and keep each desktop generated page inside exactly one platform-owned Shell.
Configuration now fails closed on canonical route-shape conflicts, including
dynamic parameter aliases, while independent user portals can retain ordinary
root paths. Refresh the official template and packaged frontend Skill with the
single-router, single-Shell composition contract.
