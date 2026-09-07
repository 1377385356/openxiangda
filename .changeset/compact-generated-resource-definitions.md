---
"openxiangda-devkit-core": patch
"openxiangda": patch
---

Emit each generated resource Surface once and let runtime resource definitions
reference the canonical `resourceSurfaces` entry. This removes duplicated page
contracts from multi-resource Web bundles without raising the build budget.
