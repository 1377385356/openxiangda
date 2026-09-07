---
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
"openxiangda-nest": patch
"openxiangda": patch
---

Delete the pre-release RoleSession-bound Workflow Kernel client surface and align Workflow v2 contracts, event facts, DevKit, and Nest SDK with the platform-owned current-user role union. Workflow clients now use the canonical task, instance Surface, timeline, assignment explanation, delegation, and work-center routes without transmitting a RoleSession.
