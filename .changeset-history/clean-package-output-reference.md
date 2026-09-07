---
"create-openxiangda": patch
"openxiangda-admin": patch
"openxiangda-cli": patch
"openxiangda-compiler": patch
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
"openxiangda-field-kit": patch
"openxiangda-mcp": patch
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
"openxiangda-testing": patch
"openxiangda-workflow": patch
---

Give every public package a scoped release build that prunes orphan outputs before packing, so removed source files cannot survive in release tarballs without racing parallel consumers. Record the independent reference application as a same-generation consumer of the greenfield application template.
