---
"openxiangda-devkit-core": minor
"create-openxiangda": minor
---

Run React, NestJS and the local platform as separate supervised processes. Add
a workspace runtime OAuth2 client whose raw credential is injected only into
NestJS, persist OAuth metadata and encrypted application Secrets in the local
PostgreSQL control store, authorize application-principal Data API access by
scope and field policy, and route local App API traffic through a
RoleSession-verifying platform gateway that replaces browser credentials with a
short-lived loopback identity.
