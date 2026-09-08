# Application Presentation Timezone

Status: decided within the authorized meeting lifecycle audit, before implementation.

## Evidence and ownership

The meeting app requires Asia/Shanghai even on a browser in Los Angeles. Published
2.5.0 datetime controls use device-local Dayjs/Date conversion, and standard
workflow summaries render startsAt/endsAt through DateTimeValueDisplay. Standard
workflow/todo/audit timestamps also ignore the business presentation zone.

The existing OpenXiangdaApplication and OpenXiangdaUiProvider own presentation.
Add optional timeZone through that provider's React context. Standard surfaces
inherit it; explicit datetime fields may override it. No persisted preference,
global timezone mutation, identity/environment state or additional data authority.
Data API continues to own canonical UTC instants and all server validation.

## Contract and invariants

Datetime Field/Filter/Display and MobileDateTimeField accept timeZone. Explicit
datetime inputs additionally accept min/max ISO instants and minuteStep (integer
divisor of 60). With minuteStep configured, seconds/milliseconds must be zero.
Existing applications without a zone or bounds keep current device-local behavior.
Date-only and time-only values retain their existing non-instant semantics.

Use Temporal 0.5.1 for IANA conversion with disambiguation reject; never silently
choose an offset for a DST gap or repeated wall time. PC's supported generated
Dayjs picker adapter uses UTC-coded wall fields, including now/fixed-date/parse,
so a device DST gap cannot normalize another zone's legitimate wall time.
Convert only at the public value boundary; generated form Dayjs values represent
real instants and must not be misinterpreted as the wall-field carrier.

Mobile uses plain calendar parts in bounded date/time wheels for zoned datetime,
with at most 731 date choices narrowed by min/max. Range stages and cancellation
retain their existing semantics. Validate both endpoints as instants, then apply
the declared closed/half-open boundary. Invalid user values stay editable and
show an error; invalid zone/configuration fails clearly. UI min/max never replaces
the platform's acceptance-time authorization/transaction guard.

## Concurrency, security and resources

Context has no cross-application mutable timezone state. Editing remains local
component state and onChange fires only for valid canonical results. A changed
value/zone is reinterpreted from its canonical instant. No network calls or new
permissions are introduced. Include standard summary, work center, notification,
resource audit, draft and signature timestamp rendering in the same boundary.
Measure actual production browser bundle delta for the Temporal dependency.

## Rollback and blast radius

Stable V1 uses its independent engine. V2 defaults remain device local; opt-in
applications receive consistent IANA presentation. Revert application props or
restore a prior accepted artifact before reverting the package. No platform SQL,
stored records or server image changes are needed for this topic.

## Falsifiable verification

Verify real PC/mobile inputs and output UTC under UTC, Los Angeles and Shanghai
browsers: quarter-hour steps, limits, range cancellation, DST gap and repeat,
invalid props and unchanged date-only semantics. Verify standard workflow subject
summary dates and generated CRUD edit/save normalization, not only custom fields.
Run the affected gates and full existing browser release suite, inspect screenshots
and measure the bundle difference before publishing the reviewed Changeset.

## Candidate evidence

Five conversion tests and 13 real Chromium checks passed: UTC/Los Angeles/Shanghai
controls, min/max and step rejection, PC range and generated-form output, mobile
cancellation, DST ambiguity, standard workflow history/centers and generated detail
headers. The controlled-picker unit now renders through React because its public
wrapper consumes context; change emission is covered by the real browser checks.
The affected gate passed 12/12 tasks. Formal release verification remains a later
gate over the frozen version candidate.

The same production Vite fixture with registry 2.5.0 versus the candidate measured
2,734,560 -> 2,901,271 JavaScript bytes and 876,509 -> 926,078 gzip bytes
(+49,569 gzip bytes, 12 chunks unchanged). This includes the Temporal dependency;
the bounded cost is accepted for correct DST conversion without device-local
normalization. No application-specific timezone tables or network dependencies.
