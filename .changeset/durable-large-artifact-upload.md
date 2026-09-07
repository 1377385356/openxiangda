---
"openxiangda-devkit-core": patch
"openxiangda-mcp": patch
"openxiangda-cli": patch
"openxiangda": patch
---

Give bounded Application v2 artifact uploads a dedicated 30-minute response
header wait while preserving the platform's 50 MiB limit, content-addressed
deduplication, and create-after-upload DeploymentRun boundary. Interrupted
uploads now return a stable retryable error without exposing credentials or
artifact content.
