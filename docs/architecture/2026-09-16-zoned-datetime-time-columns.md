# Zoned DateTime Time Columns

## Evidence

An application consuming openxiangda 2.20.2 with Ant Design 6.6.2 opens the
standard datetime picker with only a seconds column. The Field Kit passes an
explicit showSecond but no showHour/showMinute. rc-component picker treats any
explicit show flag as a complete visibility configuration and disables omitted
columns. Minute precision similarly disables all time columns.

## Owner And Invariants

Field Kit alone owns standard datetime input. Explicitly enable hours and minutes
for both datetime and datetime-range; seconds remain conditional on minuteStep.
The application timezone, canonical UTC instants, bounds, DST validation, form
ownership and cancellation semantics do not change. No application-specific code,
new state, API, identity or storage is introduced.

## Contracts And Failure

This is a presentation correction within the current DateTimeField contract.
Existing validation, rejected input and stale uploads are unchanged. The picker
uses the same mounted component and state; there is no new concurrency behavior.
The PC shared implementation also serves generated forms and filters. Mobile
wheels and stable V1 packages are unaffected. Other V2 tenants gain the intended
hour/minute controls; no server or database deployment is required.

## Bounds And Rollback

No new dependency, request, timer, token or unbounded data is added. Revert the
Field Kit package change before publication, or deploy the previous application
AppVersion after publication. Existing records are not rewritten.

## Falsifiable Verification

Browser tests open scalar, generated-form, filter and range pickers with minute
and second precision, assert exactly two/three visible columns with usable width,
select hours/minutes and verify canonical UTC output. Run affected repository
gates and the deterministic package release train. Application regression must
then pass against the published package, not a locally patched node_modules.
