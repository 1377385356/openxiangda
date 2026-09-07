# Notification Skill Public Entry v2

## Problem evidence

The alpha.27 backend Skill imports
`OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2` and
`OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2` from `openxiangda/contracts`.
The published root manifest does not export that subpath. The constants exist
only in the physical `openxiangda-contracts` capsule, so an application that
follows the Skill receives `ERR_PACKAGE_PATH_NOT_EXPORTED` before its Nest
source can compile or run.

## Owner and invariant

- The `openxiangda` root facade owns every application-facing import path.
- Physical capsules remain implementation dependencies and are never imported
  by application code.
- Notification send schema constants belong beside the corresponding
  `OpenXiangdaBusinessNotificationService` facade under `openxiangda/nest`.
- `openxiangda/contracts` remains deliberately unavailable; this change does
  not expose the complete physical contract surface or create another package
  boundary.

## Public contract

`openxiangda/nest` additionally exports these two stable constants:

- `OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2`
- `OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2`

The existing `./nest` package export and generated `dist/nest.d.ts` are the
only runtime and type entrypoints. The canonical Skill imports the service and
constants from that one subpath.

## Failure and rollback boundary

The change is an additive root-facade export and has no platform, data,
authorization, concurrency, or tenant effect. Rollback removes the two facade
re-exports and restores the prior Skill text. The physical contracts capsule,
Nest implementation package, platform server, stable 1.x applications, and
existing alpha.27 runtime behavior remain unchanged.

## Falsifiable acceptance

1. Source and built declarations expose both constants from
   `openxiangda/nest` with their exact v2 literal values.
2. The Skill contains no `openxiangda/contracts` import and its notification
   example imports only from `openxiangda/nest`.
3. An independently packed and installed root tarball can import both
   constants from `openxiangda/nest`.
4. The same packed installation rejects `openxiangda/contracts` with
   `ERR_PACKAGE_PATH_NOT_EXPORTED`.
5. The Skill manifest and affected release gates pass from a clean worktree.
