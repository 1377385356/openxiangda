---
"openxiangda-devkit-core": patch
"create-openxiangda": patch
---

Build generated application workspace packages as real JavaScript packages before development, checks, tests, and production packaging. Resolve current TypeScript sources only inside the OpenXiangda declaration compiler so sealed configuration never depends on stale build output while Node and Kubernetes runtimes remain free of TypeScript loaders.
