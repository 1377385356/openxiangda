# ADR: Reference application follows the current CRUD template

Status: Accepted on 2026-08-21

## Evidence and owner

The persistent reference repository still contains the retired Umi, purchase
approval, RoleSession, local-platform, Docker/PostgreSQL, workflow, and event
paths. After the CRUD release versions were materialized, package alignment
failed because the reference application depends on the deleted
`openxiangda-local-platform`. Updating version strings would preserve the wrong
product and could make a release gate appear green without testing the public
golden path.

The OpenXiangda 2.0 release verifier owns candidate package and reference
application validation. The official Vite/Refine instrument template owns the
reference application's source shape. The reference repository owns only a
persistent, reviewable instance of that template.

## Decision and invariants

- Recreate the reference repository from the current instrument template with
  app code `openxiangda-v2-reference-app`; do not migrate old alpha behavior.
- The reference contains Web, Nest, generated contracts, instrument data and
  authz declarations only. It has no domain package, local platform, local
  database, workflow, event, RoleSession, Umi, or second CLI lifecycle.
- Candidate verification installs immutable source tarballs through a one-time
  local registry and runs the same `openxiangda check` used by a fresh app.
- The reference package manifests must pin every consumed OpenXiangda package
  to the exact materialized candidate version.
- Live platform deployment remains a separate release gate; browser fixtures
  must not be reported as deployed-platform evidence.

## Failure, resource, and rollback boundary

Candidate installation or checking fails closed before registry publication.
The one-time registry binds loopback and is removed after verification. The
reference reset is a single destructive alpha commit in its own repository;
rollback restores that Git commit as a whole. It does not modify 1.x, tenant
data, platform environments, or an active AppVersion.

## Falsifiable verification

1. Reference source matches the generated template shape and budget.
2. No tracked file or dependency mentions the deleted local platform,
   RoleSession, Umi, purchase approval, workflow, or event path.
3. `release:plan` accepts the exact reference package pins.
4. `verify:release` installs candidate tarballs in a fresh copy and passes
   `openxiangda check` without using public-registry fallback bytes.
