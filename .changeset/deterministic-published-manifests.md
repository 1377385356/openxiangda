---
"openxiangda-cli": patch
"openxiangda-devkit-core": patch
"openxiangda-mcp": patch
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
---

Pin internal registry dependencies exactly in publishable manifests so repeated
packs from one source commit produce the same immutable package bytes.
