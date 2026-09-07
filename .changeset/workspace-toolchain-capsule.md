---
"openxiangda-cli": patch
"openxiangda-devkit-core": patch
"openxiangda-skill-kit": patch
---

Fail closed when an application workspace's OpenXiangda package declarations do
not match the exact versions owned by the current CLI template capsule, and keep
the CLI bootstrap coordinate carried by Skill Kit in the same release unit.
