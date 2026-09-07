---
"openxiangda-cli": major
"openxiangda-devkit-core": major
"openxiangda-mcp": major
"openxiangda-skill-kit": major
---

Collapse the OpenXiangda 2.0 release train from thirteen historical packages to
six developer-owned packages and from seven installable Skills to one. The CLI
now owns workspace creation and the only process entry, Devkit owns compilation
and current-user permission fixtures, MCP runs through `openxiangda --mcp-stdio`,
and the Skill kit installs one transactional `openxiangda-v2` Skill without
touching user or third-party Skills.
