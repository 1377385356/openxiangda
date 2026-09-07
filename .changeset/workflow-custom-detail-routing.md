---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-nest": minor
"openxiangda": minor
"openxiangda-cli": patch
"openxiangda-skill-kit": patch
---

Add platform-owned Workflow detail routing. Applications can declare distinct
desktop and mobile `detailRouteCode` values, while Work Center surfaces,
Notification Hub delivery, DingTalk cards, and standard Workflow entry routes
resolve the active environment Contract Bundle to one authorized custom page.
Invalid or stale declarations fail closed, and omitted declarations retain the
standard Workflow detail experience.
