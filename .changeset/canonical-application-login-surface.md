---
"openxiangda": minor
"openxiangda-cli": minor
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-skill-kit": patch
---

Add the canonical OpenXiangda 2.0 Application Login Surface. Applications
declare existing-user-only password, tenant SSO, and DingTalk methods plus
independent desktop and mobile authentication renderers, while the platform
owns one-time login transactions, normalized return targets, secure tokenless
browser sessions, CSRF, refresh rotation, authorization recovery, and logout.
Generated platform-auth manifests stay separate from protected application
routes, and the standard template, compiler, React runtime, CLI capsule, and
developer guidance publish the same fail-closed contract.
