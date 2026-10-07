---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda": patch
---

Allow a model to declare an ownedRowLimit of up to 1000 across multiple subtables while keeping the existing default of 500 and the per-table limit of 500. Negotiate the aggregate capacity with the platform and preserve atomic edits, final-row revision checks and the 2 MiB request limit.
