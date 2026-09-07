---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-nest": minor
"openxiangda-admin": minor
"openxiangda-testing": patch
"create-openxiangda": minor
---

Bind every user and application Principal, RoleSession, Data API event, App API request and Workflow operation to one trusted `environmentKey`. Generated NestJS backends reject valid tokens issued for another application deployment, the Admin runtime establishes and switches identities for its active environment, and new applications consume the platform-injected `OPENXIANGDA_ENVIRONMENT_KEY` contract.
