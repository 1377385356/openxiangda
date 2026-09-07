---
"openxiangda-contracts": minor
"openxiangda-devkit-core": patch
"openxiangda-cli": patch
"openxiangda": patch
"openxiangda-mcp": patch
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
---

Publish the standalone OpenXiangda Studio discovery capability contract without
adding fields to the closed PlatformCapabilities v3 envelope. Existing CLI
check and deploy clients remain byte-shape compatible, while the dedicated
Studio endpoint is strictly bounded and partial or secret-bearing responses
fail closed.
