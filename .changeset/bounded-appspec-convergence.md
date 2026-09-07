---
"openxiangda": minor
"openxiangda-cli": minor
"openxiangda-devkit-core": minor
"openxiangda-mcp": minor
"openxiangda-skill-kit": patch
---

Tighten the optional AppSpec workflow without adding a release gate: require an
explicit current-spec convergence choice only when closing a change, keep
unmerged durable requirement and acceptance IDs active, reject untouched L2/L3
placeholders during explicit AppSpec checks, and expose a bounded context v2
index with archived selectors plus separate workspace and selection digests.
