---
"openxiangda-devkit-core": patch
"openxiangda-cli": patch
"openxiangda": patch
---

Classify Corepack and Buildx `ECONNRESET`, fetch, and TLS socket failures as
retryable network errors. A single AI-facing `openxiangda deploy` now retries
those failures up to three times with one stable candidate tag, while
deterministic build, authentication, and digest failures still fail once before
any platform artifact or DeploymentRun is created.
