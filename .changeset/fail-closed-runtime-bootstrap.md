---
"openxiangda-nest": patch
---

Reject application-supplied runtime identity, OAuth credentials, unknown module
options, and unknown bootstrap options. Runtime identity remains exclusively
platform-injected, and partial OAuth descriptors fail during startup.
