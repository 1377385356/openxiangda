---
"openxiangda": patch
"openxiangda-cli": patch
"openxiangda-devkit-core": patch
"openxiangda-skill-kit": patch
---

Generate the public documentation and installed Skill command tables from the
executable command registry, recursively validate every nested Skill reference,
and consolidate backend, frontend, and workflow/events guidance under the one
installable `openxiangda-v2` Skill. The template agent contract now uses the
same current-user role union and public schema-composition helpers, and the
source build safely handles diagnostics without a path.
