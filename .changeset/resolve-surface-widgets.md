---
"openxiangda-contracts": major
"openxiangda-devkit-core": major
"openxiangda-cli": patch
"openxiangda-skill-kit": patch
---

Make compiled resource Surfaces complete and deterministic. The compiler now
resolves every authored storage type and reference to its standard field widget,
while preserving explicit presentation overrides, and generated Surface fields
can no longer omit their widget for application renderers to guess.
