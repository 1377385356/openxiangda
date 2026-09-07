---
"openxiangda": patch
---

Keep total Web asset and JavaScript gzip sizes as build metrics while enforcing
the fixed performance budget only on initial JavaScript, so independently lazy
application modules can grow without weakening fail-closed build checks.
