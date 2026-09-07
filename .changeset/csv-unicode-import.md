---
"openxiangda": patch
---

Decode UTF-8 CSV explicitly before field parsing so Chinese headers and values import correctly with or without a BOM. Preserve raw text and reject undecodable input.
