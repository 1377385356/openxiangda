---
"openxiangda-compiler": minor
"openxiangda-devkit-core": minor
"openxiangda-cli": patch
"openxiangda-mcp": patch
"openxiangda-skill-kit": patch
---

Require the indivisible `data.native-golden-crud` platform capability for every application with Native Data Resources. Compiler output now seals the requirement automatically, while CLI and MCP deployment fail before local builds, image pushes, artifact uploads, or DeploymentRun creation unless the platform reports the capability as fully available.
