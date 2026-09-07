# Event capture plan evolution v2

## Problem

A data-event capture plan is not owned by the event declaration alone. Its
public fields come from event subscriptions, its available fields come from the
Data revision, and its internal authorization snapshot comes from the AuthZ
revision. Keying a plan only by event revision and resource made a valid
additive resource/RLS change collide with an older immutable plan.

## Contract

The platform compiler projects the canonical capture plan closure. At runtime,
a Native plan is immutable under the exact tuple
`eventContractRevisionId + dataLogicalRevisionId + authzRevisionId + resourceCode`.
The Native Head selects all three revisions atomically.

Adding a field or extending RLS therefore creates a new plan tuple without
rewriting an old one. Schema-version immutability, producer identity, the
64-field bound, and sensitive-field checks remain fail-closed. Applications do
not declare plan versions or send revision ids.

An event fact stores the captured data, authorization projection, Head revision
and capture-plan digest. Replay or re-emission copies that immutable fact; it
never evaluates the current Head or projects newly added fields into history.

## Recovery

Platform upgrades backfill only current active Head tuples from the legacy
plan table. Inactive candidates are prepared from their own immutable Data,
AuthZ and Event projections. A pre-activation deployment failure can therefore
use the official platform-upgrade replacement run without changing its package
digest or application declarations.
