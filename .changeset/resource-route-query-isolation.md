---
"openxiangda-cli": patch
---

Reset generated list state when switching resources and ignore stale query fields so
client-side navigation cannot send a previous resource's sort or filter to the
Native Data API.
