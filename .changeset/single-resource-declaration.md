---
"openxiangda-cli": major
"openxiangda-contracts": major
"openxiangda-devkit-core": major
"openxiangda-mcp": major
"openxiangda-skill-kit": major
---

Replace the removed storage, Surface, and field-policy triple declaration with
one application resource and field declaration. The compiler now derives the
strict platform schema, standard CRUD Surface, generated capabilities, and
operation-specific field access from that single source. Reject pre-release
dual declarations instead of recognizing or migrating them.
