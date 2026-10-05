# Entry identity wait continuity

Status: implementation candidate; no new online capacity claim.

## Evidence and owner

r62 used the r61 platform and unchanged application. 5,000 cold HTTP entrants arrived over 3.159 seconds (sliding one-second peak 2,300). 4,952 received final results within 30 minutes, including 1,000 success ticket readbacks. 48 interrupted before explicit submission during identity loading after 11–12 bootstrap 429 responses, with identity elapsed 264–297 seconds. All request journal entries reconcile with the gateway; SQL shows 1,000 tickets/ledger rows and matching three-level occupancy, no foreign scope or unexpected commands. The complete cohort remains partial.

The SDK runtime current read has a 300-second deadline and exponential backoff reaching 30 seconds plus jitter. The server entrance receipt retains a 1,200-second original deadline and advertises bounded polling hints (maximum 15 seconds); its ready wave covers 20 seconds. These verified policy mismatches can prematurely end a valid entrance wait and miss polling waves. Original JSON response bodies were hashed rather than retained, so exact last receipt state for the 48 actors cannot be claimed from their journals alone.

The platform SDK owns runtime identity read recovery. The platform entrance service remains the only receipt authority; no application-specific identity or queue is added.

## Decision and invariants

Only explicit HTTP 429 CONCURRENCY_BOOTSTRAP_BUSY, retryable not false, with a waiting/ready/active entry receipt and a finite positive numeric remainingMs can opt into entry waiting. Freeze its absolute deadline at the first such receipt, cap it at 30 minutes from the original read start, and only shorten it on later receipts. Never refresh a deadline on retry. Respect the receipt hint with bounded 2–15-second polling plus at most 20% jitter, within the existing 20-second ready wave. Allow at most 900 entry attempts; ordinary requests keep 120 attempts and the original five-minute budget. No known busy without a receipt can extend the deadline.

Read timeouts stay ten seconds; projection retry chain and transport failure limits stay unchanged. Authorization denial, version drift, full/expired terminal receipt and retryable=false still end recovery immediately. Abort cancels transport and waiting; identity is still resolved by platform permissions after admission. No write, submit or quota action is replayed, no business deadline/key is changed.

## Bounds, compatibility and rollback

A maximum of 900 identity reads over the original 30-minute bound is explicit; minimum two-second polling prevents an unbounded fast loop. Server admission/Redis work bounds remain unchanged. This is V2 browser SDK behavior, independent of V1, with no database or wire schema change. Existing applications retain behavior until using the new SDK. Rollback restores the old SDK bundle; accepted commands retain their original result recovery and are never replayed. Package a reviewed Changeset and official release, then redeploy the application once with the updated SDK; do not alter the completed r62 report.

## Falsifiable verification

Virtual-clock tests: wait succeeds after five minutes with a valid receipt; plain busy cannot extend; receipt hints stay within the polling wave; declining receipts and inflated later receipts do not refresh the deadline; absolute 30-minute cap; invalid metadata, terminal receipt, transport/projection errors and cancellation retain their boundaries. Then repeat a new isolated cold 5,000-person graph using the actual rebuilt SDK. Require all original actors and results, independent SQL, gateway reconciliation and observed arrival distribution; do not infer first-second hardware capacity or SSO rendering from the screen barrier.
