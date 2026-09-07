# ADR: Keep the Skill kit package below the application-tooling boundary

> **SUPERSEDED:** The seven-Skill distribution described below was replaced by
> [the exact one-Skill budget](./public-package-and-skill-budget-v2.md). This file
> remains only as historical package-size evidence.

Status: Accepted on 2026-08-21

## Evidence and owner

The validated `openxiangda-skill-kit@2.0.0-alpha.43` tarball is 33,074,521
bytes. Its generated package directory contains about 46 MiB of copied docs,
including retired Umi, approval, Workflow and high-fidelity design screenshots,
while the seven current CRUD-first Skills occupy about 60 KiB and do not link
to those docs.

`openxiangda-skill-kit` owns validation and installation of the current Skills.
The VitePress site owns product documentation and design evidence. A package
install must not copy the documentation site into every AI client merely to
make the Skill resolver consider its packaged Skills valid.

## Decision and invariants

- Publish only `dist/`, `skills/` and `README.md` from the Skill kit.
- Packaged Skills are valid when the `skills/` directory exists; a sibling
  `docs/` directory is not required.
- Keep optional reference copying in the library for an explicitly supplied
  custom Skills root, but the official distribution ships no shared docs.
- The packed Skill kit must contain no `docs/` tree and must remain at or below
  512 KiB compressed. The release tarball check owns this bound.
- Current Skills remain short CRUD, authorization, connected-development and
  delivery instructions. Historical architecture and screenshots stay in the
  documentation repository only.

## Failure, resource, and rollback boundary

Packing fails before publication if the package includes docs or exceeds the
size bound. The change touches no platform runtime, tenant data, 1.x package,
application contract or deployed environment. Rollback restores this one
package commit, but doing so would deliberately restore the measured package
bloat.

## Falsifiable verification

1. `pnpm --filter openxiangda-skill-kit pack` produces a tarball no larger than
   512 KiB with no `package/docs/` entry.
2. The tarball contains all seven Skills, their agent metadata, `dist/` and the
   package README.
3. Skill validation and installation tests pass with and without an optional
   custom docs directory.
4. Packed-distribution and full release verification reject a future copied
   docs tree or oversized Skill kit before registry publication.
