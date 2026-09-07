---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-cli": major
"openxiangda-mcp": major
"openxiangda-skill-kit": patch
"create-openxiangda": patch
---

Make `openxiangda deploy` build and push the official NestJS image through Docker Buildx using the platform-owned repository target, then seal only the immutable digest. Remove the public backend-image flag and environment variable, fail before platform writes when prerequisites are unavailable, and document the single-command delivery path.
