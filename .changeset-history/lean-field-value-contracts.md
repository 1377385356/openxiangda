---
"openxiangda-contracts": minor
"openxiangda-field-kit": patch
"create-openxiangda": patch
"openxiangda-skill-kit": patch
---

Move stable field value shapes into the dependency-free contracts package while
keeping Field Kit type re-exports. Generated application domain packages no
longer pull React, Ant Design, or mobile renderers into NestJS production
images, and the source boundary gate now rejects server-side UI dependencies.
