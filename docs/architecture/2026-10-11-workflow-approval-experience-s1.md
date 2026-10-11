# Workflow approval experience S1

Status: implementation of the owner-approved Claude design, 2026-10-11.
Design authority: Claude session `5072bc85-80f0-43dd-91d6-df630b5d0c20`, final design sections 9 and 12. Owner requested local development.

## Evidence and scope

V2 uses `packages/openxiangda/src/browser/components/workflow/StandardWorkflowPages.tsx`, not the V1 viewer or legacy SDK. The detail renderer hides content/history/audit behind Tabs. The shared record-detail CSS wraps mobile workflow actions into 50 percent cells. The server gives save_form primary placement while return is overflow. This slice fixes the V2 reading flow and operation presentation; it does not implement definition drafts, new return execution policies, code steps or production delivery.

## Owners and invariants

The Workflow service remains the sole owner of visible/enabled operations, their schemas, command tokens and authorization. It supplies additive ordered prominence and consequence metadata. The SDK selects at most two prominent controls on mobile and three on desktop, reverses that selection for the visual order (primary decision on the right), and renders the remainder in More. It never grants commands or owns a command-key allowlist for layout. Legacy descriptors fall back to their supplied placement/emphasis. Existing placement remains during the additive rollout.

The shared operations controller, form controller, pending receipt locator, exact idempotency key, failed-input retention and post-success refresh behavior remain authoritative. No second command execution path, draft store or authority is introduced. Business form fields, files and read authorization remain supplied by the platform.

## Contracts and UX

Optional operation prominence (positive integer; lower is more prominent, absent means overflow) and consequence (bounded human text) are emitted by the service and validated by contracts. Readable labels distinguish 同意, 退回 and 拒绝申请. No-return surfaces keep rejection as the secondary choice. Disabled/hidden operations, app-owned actions and correction/instance surfaces remain bounded by their original descriptors.

Detail content and task inputs precede progress. Audit stays collapsed and loads only on demand. Desktop has a progress rail when space allows; narrow/mobile layouts stack. Mobile progress shows nearby visits with an explicit full-history view. Missing participant mode/round metadata is never inferred. Forms retain inputs across layout and receipt state changes.

## Concurrency, failure and resource bounds

No data migration and no runtime topology change. Existing token expiration, stale Surface, file/draft busy locks, unknown-result recovery and role/identity invalidation are preserved. A pending original command cannot be replaced by a new request. A successful command with failed refresh remains successful. More and confirmation UI must respect the same locks. Audits are not fetched merely by opening a detail page. Layout changes do not fetch a second detail Surface.

## Verification and rollback

Focused descriptor/contract, rendering, operation/input/receipt tests and V2 check/build; browser checks at 320/360/390/430 and 1280/1440, plus no-return/correction/hidden/disabled, More, retained inputs and unknown-result paths. Use the real SDK with deterministic API fixtures and state separately that fixture browser checks are not live-role acceptance. Keep exact V2/server/root commits. Revert this slice to restore prior presentation; additive metadata can be ignored by earlier SDKs. No production deploy or npm publish is part of this development step. V1 source must remain unchanged.

## Baseline limitation discovered during implementation

The current kernel follows the immutable onReject target; it does not require that target to be a rejected terminal node. S1 labels the operation 拒绝申请 and describes following the configured rejection branch, without claiming that arbitrary existing definitions terminate. Enforcing rejected-only terminal paths belongs with the versioned definition/return-policy work, not a silent UI-induced kernel change. The existing desktop confirmation dialog remains in S1 to retain focus and failed-input behavior; anchored confirmation and quick phrases remain a subsequent presentation refinement.
