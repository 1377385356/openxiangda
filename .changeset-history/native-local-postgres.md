---
"openxiangda-devkit-core": minor
"create-openxiangda": minor
---

Move the Native local platform kernel out of application frontend source and
ship it as an independently versioned toolchain package. Make `openxiangda dev`
own a workspace-labelled, resource-limited, digest-pinned PostgreSQL container,
inject a declaration-only local manifest, preserve Data API records and
idempotency receipts across restarts, and reserve destructive volume recreation
for the explicit `--reset` path.
