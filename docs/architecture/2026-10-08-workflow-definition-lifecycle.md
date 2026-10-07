# Stable workflow definitions during application renders

## Evidence and owner

B20 local development retained the React root, but an entry render still erased
unsaved launch form input and owned row keys. The workflow definitions provider
normalized its unchanged declaration on every render. The launch page depends on
that definition, so it cleared and reloaded its surface, removing the rendered
form. The SDK provider owns definition normalization and identity.

## Invariants and contracts

Memoize normalization by the immutable definitions input. An unrelated parent
render or task form behavior change must retain the same normalized definitions.
A changed declaration must still normalize and validate normally. No new storage,
authorization, form values, request API, or HMR implementation belongs here.
Application-specific preparation effects remain owned by the application.

## Failure, bounds, and rollback

Validation exceptions remain synchronous and fail closed. There is one bounded
memo per mounted provider; no global cache or stale tenant/environment data is
introduced. V1 does not consume this provider. Other V2 applications receive only
stable identities for unchanged declarations. Rollback reverts the provider memo.

## Falsifiable verification

Existing definition validation tests and affected checks must pass. In the real
B20 mobile form, record text, number, and owned row input keys; update the entry
and a component module and compare the actual DOM values and keys. Preserve both
earlier reset failures. Application preparation must retain ready context during
an unchanged refresh while reloading on identity/environment or explicit retry.

## Observed validation

Definition validation: 3 tests passed. `pnpm verify:affected`: 12/12 tasks passed.
B20 browser evidence retained entry, business component, and contribution
registration updates with unchanged text, negative decimal, and owned row IDs.
The application bootstrap now renders only at the first root creation. Earlier
resets and an attempt affected by concurrent SDK rebuild remain recorded; a full
SDK rebuild may replace module contexts and still requires an explicit reload.
