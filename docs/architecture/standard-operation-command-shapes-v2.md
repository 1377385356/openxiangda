# Standard Operation Command Shapes v2

## Problem evidence

The final low-capability-model black-box run produced a complete visitor
application whose tests, browser acceptance and MCP contract all passed, but
whose build failed because it interpreted `duplicateFields` as a list of field
names. The SDK actually expected a map from each duplicate-key field to the
submitted value. The TypeScript failure was correct, but the public parameter
name and Skill left two plausible meanings for the same word. Earlier attempts
in the same run also used the non-existent storage type `number` and referenced
a custom backend capability without declaring it in the application catalog.

These are developer-contract defects: a low-capability client following the
public path must receive one precise command shape and diagnostics at the
application declaration, not discover derived or stringly contracts late in a
release build.

## Ownership and stable invariants

- `openxiangda-devkit-core` owns validation of application-authored resource
  and field declarations. Diagnostics name the authored path and never make a
  generated schema look like a second source of truth.
- `openxiangda-nest` owns the standard operation command types and runtime
  validation. The platform Data transaction remains the only owner of duplicate
  detection, business locks and the resulting mutation.
- `openxiangda.config.ts` remains the only owner of custom capability
  declarations. An operation and every role that invokes it reference the same
  explicitly declared backend capability.
- The Skill owns the canonical public example. It must show actual submitted
  values, idempotency and status handling rather than an abbreviated sketch.

## Breaking decision

`VisitorReservationOperationInput.duplicateFields` is deleted. Its only
replacement is `duplicateMatch: Record<string, unknown>`. The value is a
non-array object whose keys are declared resource field codes and whose values
come from the immutable submitted command. Empty objects, arrays and other
values fail before a platform request. No alias, migration or runtime fallback
is provided.

Application resource fields accept only the ten native storage types:
`string`, `text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `uuid`,
`json` and `file`. The declaration validator rejects another spelling at
`data.resources[i].fields[j].type` before materializing the strict platform
schema.

Every custom operation capability must appear once in `authz.capabilities`
with `kind: 'backend'`; the operation and intended roles consume that code.
Generated resource CRUD capabilities remain compiler-owned and are never
redeclared.

## Failure, concurrency and security bounds

- The visitor helper performs no mutable pre-read. It derives equality filters
  and a bounded hashed business lock from the same `duplicateMatch` object, then
  sends the guard and create operation in one idempotent platform transaction.
- Duplicate matching must contain at least one field and cannot be an array.
  Submitted values never appear in lock keys or logs.
- Invalid source types and undeclared capability references fail local `check`
  before build or deployment writes.
- Existing alpha callers intentionally stop compiling. OpenXiangda 2.0 has no
  historical application compatibility boundary.

## Resource and rollback boundary

This topic changes only Devkit declaration diagnostics, the Nest standard
visitor operation, public guidance and their package versions. It does not
change platform storage or deployed application data. Rollback is the prior
package train and source commit; no mixed old/new command shape is accepted.

## Falsifiable verification

1. `number` receives exactly an authored-path field-type diagnostic and does
   not surface a generated `schema.fields` path.
2. `duplicateMatch` with actual values produces one query-empty guard and one
   create operation; empty and array inputs fail without invoking Data API.
3. The public Skill contains the full visitor call, valid field type list and
   explicit custom-capability closure rule.
4. Release verification passes, the new packages publish, and a new Luna Max
   workspace created only from the published Skill/CLI passes check, tests,
   builds, browser E2E, MCP discovery and real preproduction deployment.
