---
"openxiangda-contracts": minor
"openxiangda-devkit-core": patch
"openxiangda": minor
---

Expand bounded owned subtable editing to 100 rows per table and 400 rows per parent. Preserve complete replacement intents, parent/child CAS and one atomic transaction, with 1000 operations and a 2 MiB request ceiling. Align workflow task values and drafts with a 1 MiB bound while retaining independent definition, field and file limits.

Review: follows the root bounded-owned-subtable architecture decision; no new identity or authorization owner, no batch partial commit, no administrator field permissions. Server runtime and additive RLS migration must be deployed before applications declare larger tables. Local synthetic verification only; no npm publication in this work.
