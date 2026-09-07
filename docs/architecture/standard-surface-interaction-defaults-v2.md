# Standard Surface Interaction Defaults V2

> 2026-09-05：本文的 read 自动扩展写权限决定已被 `2026-09-05-platform-foundation-a.md` 取代。新角色使用显式 read/manage/操作列表，添加页面不会增加写权限。其余历史背景仅供追溯。

## Status

Accepted for the OpenXiangda 2.0 alpha contract on 2026-09-03.

## Evidence

- Generated Native lists already own create, update, delete, batch mutation and import controls, but package roles that can read a list must repeat every generated mutation capability before those controls appear.
- Workflow-owned resources intentionally reject Native mutation grants. Their standard launch page commits a durable process command, yet the current list import path only knows how to execute a Native transaction.
- Standard-process forms do not receive an upload renderer, although file, image and signature fields are platform-managed fields and the synthetic process operation is the mutation owner.
- After submission, the standard launch page replaces the form with a command-status card containing command terminology and internal recovery text.
- Generated lists keep columns, filters, density and page size only in component state even though the platform already exposes an account-owned AdminList preference store.
- Read-only directory values are rendered as selector-like cards in resource lists/details, numeric columns are not aligned semantically, and generated lists omit `created_at`.
- Native audit events retain stable actor identifiers, but the standard detail surface can expose that identifier when directory resolution is unavailable.

## Decision owner

OpenXiangda Platform Product and Runtime.

## Decisions and invariants

### Native entry roles receive generated Native mutations by default

For a resource whose `surface.mutationOwner` is `native`, the compiler expands a package role that explicitly has the resource `read` capability with each generated Native mutation capability (`create`, `update`, `delete`). The expansion is limited to operations whose generated surface is enabled.

The source role may declare `deniedCapabilities` to remove an auto-expanded capability. Denials must reference the same application's capability catalog, cannot contain duplicates and win over both authored and generated grants. The sealed role contains only the final `capabilities` array; runtime authorization does not interpret a second allow/deny model.

Resources owned by `workflow`, `action` or `readonly` never receive this expansion. Existing compiler rejection of their Native mutation grants remains fail closed.

### Workflow import means bounded batch launch

When a generated list belongs to exactly one standalone standard-process workflow, its import action validates the entire spreadsheet with the standard resource field codec and then submits one durable process command per valid row. It never calls Native transaction import.

The batch is limited to 100 rows and uses bounded concurrency of three. Every row receives a stable idempotency key for the lifetime of the preview. Acceptance is reported per row; a retry submits only rows that were not accepted. This is a batch of independently durable applications, not a distributed all-or-nothing workflow transaction.

Named-operation workflows and ambiguous multiple-workflow resources do not receive an inferred batch launcher. They require an explicitly declared business action.

### Standard-process files remain platform managed

The synthetic operation `openxiangda.workflow.<workflowCode>.submit` may initiate upload sessions only for file-capable fields on its sealed subject resource and only for the create/update intent used by the launch page. The server re-resolves the active workflow, subject resource and current-user authorization for every initiation. The uploaded reference is bound by the existing atomic standard-process commit; no application upload endpoint is introduced.

### Submission remains on the current form

The launch page preserves the filled form while the durable command is accepted and started. Controls are disabled and a standard block loading mask states only that the application is being submitted. The command identifier and internal state names remain in the URL/API for recovery but are never user-facing copy. On `started`, navigation replaces the launch route with the workflow detail route. Awaiting input and terminal failures use user-facing language and keep a recovery action on the same page.

### Generated list preference is one account-owned default

Each desktop generated resource list uses one stable key `openxiangda-v2:resource:<resourceCode>`. The preference contains versioned column visibility, filter values, sort, density and page size. It is loaded from and saved through the canonical Native v2 AdminList endpoint backed by the existing account-owned preference store for the current tenant, app and user. Unsaved changes expose a `Save settings` action; restoring defaults deletes the preference. Saved preferences affect presentation and initial query only and never become authorization input.

Unknown or no-longer-readable fields are discarded when applying a stored preference. At least one business/system column remains visible. Filter values are still validated and authorized by the Native Data API on every query.

### Read-only presentation and audit attribution

User and department snapshots render as ordinary text in lists, details and audit changes; selector affordances remain exclusive to editable controls. Numeric fields are right-aligned. Generated desktop lists include `created_at` and `updated_at` as configurable system columns.

The detail header owns only navigation, title and applicable record actions. Recent-update copy and the duplicate audit shortcut are removed; the inline audit section remains the single entry point.

Created audit entries render one attribution sentence and no field-by-field initial values. The audit API may attach a current display projection (`displayName`, optional avatar) resolved from the immutable actor/initiator identifier. The event actor itself stays immutable and authoritative; failure to resolve a profile falls back to a principal label without exposing a raw identifier.

Workflow applicant avatars are 32 px and timeline actor avatars are 20 px. Workflow state labels use semantic Ant Design status colors, and opinions are visually separated from secondary metadata.

## Failure and concurrency semantics

- Preference reads fail soft to platform defaults; explicit saves and restores surface errors and do not update the local saved baseline on failure.
- A changed preference is compared against a canonical normalized snapshot so request order and object-key order cannot create false dirty state.
- Submission polling remains revision-driven and has one timer per mounted command. Re-entry with the same URL resumes the existing command.
- Workflow batch launch has at most three requests in flight. Accepted rows are immutable in the batch result and are skipped on retry.
- Upload initiation is fail closed when the workflow is inactive, the launch mode is not standard, the subject differs, the field is not managed-file capable, or the intent/record identity does not match.

## Security and bounds

- Native default grants are compile-time package grants only; data policies, field access and current-user union authorization still apply.
- `deniedCapabilities` cannot deny a capability outside the sealed catalog or create a runtime wildcard interpretation.
- Workflow batch launch never receives Native create capability and cannot bypass the standard process operation.
- Preference payloads remain account scoped and under the existing 64 KiB limit. Filter and column keys are intersected with the active readable surface.
- Audit display resolution is tenant scoped and reveals only the display projection required for an already-authorized audit entry.

## Rollback

- Revert compiler role expansion and regenerate applications to restore fully explicit Native mutation grants.
- Remove workflow import UI and standard-process upload authorization; already accepted commands and bound files remain valid durable facts.
- Stop reading the generated-list preference key; stored account preferences may remain unused and can be deleted through the existing endpoint.
- Revert presentation changes without rewriting business records, audit events or workflow history.

## Verification

- Compiler tests cover expansion, explicit denial, disabled generated operations and non-Native owners.
- Browser tests cover in-place submission, standard-process uploads, workflow batch partial retry, preference normalization/dirty state, plain reference values, system columns and audit creation rendering.
- Platform service tests cover standard-process managed-file authorization, tenant/field/intent rejection, audit actor display projection and filter preference persistence.
- Run repository typecheck/tests/build plus `pnpm verify:affected`, then validate the expense approval application with `pnpm openxiangda check --json` and deploy the resulting artifact to preproduction.
