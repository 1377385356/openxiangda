---
"openxiangda-devkit-core": minor
---

feat(dev): connected dev proxy forwards declared backend operation paths — bare applicationApiPath() calls without runtime mount metadata now reach the local backend when the path exactly matches a backend.operations[] declaration (PL-09; config-driven exact match, no prefix wildcard, no authz meta injection)
