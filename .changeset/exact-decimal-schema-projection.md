---
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
---

Project opt-in exact decimal fields as bounded JSON Schema strings in generated Action and resource schemas. Keep legacy decimal fields numeric, and leave financial min/max enforcement to the Native exact-decimal validator rather than applying numeric JSON Schema keywords to strings.
