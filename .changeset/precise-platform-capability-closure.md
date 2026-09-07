---
"openxiangda": minor
"openxiangda-cli": minor
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-mcp": minor
"openxiangda-skill-kit": patch
---

Replace the alpha AppPackage string capability list with a compiler-derived,
sorted closure of capability code, exact contract version and deterministic
declaration usage digest. Remove application and build-time append paths, make
platform feature contracts closed and version-exact, and reject the deleted
AppPackage/config shapes before build or deployment writes.

Close the Workflow launch trust boundary around exact revision-bound data
references, closed fact schemas, provider request v2.1 and complete desired
activation sets. Add the canonical `workflow-instance` event delivery ordering
without an alias.

Derive Directory, managed-file, Notification Hub, durable process and fresh
Workflow command requirements from normalized platform-access and Workflow
declarations. Generated Workflow contracts and TypeScript now expose the exact
subject projection plus the compiler-owned standard process operation code.
