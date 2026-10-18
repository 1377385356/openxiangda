# Contract supervisor admission and actionable launch failure
Evidence: A V2 contract launch command retries six times with no instance; selected department has zero supervisors.
Owner: platform resolves people and owns command state; app declares admission and level editing.
Invariants: no invented supervisor, arbitrary department union, empty-policy bypass or duplicate subject. Task entry revalidates people; tenant/environment/idempotency and lease CAS stay authoritative.
Change: enable department_supervisor in existing transactional launchPreflight. Stable assignment failures stop automatic retries, retain original command for explicit retry. User correction: source is the initiating unit of the actual initiator, NEVER contract handling department. One membership auto-selects; multiple memberships require explicit selection via platform submissionDepartment requirement. App exposes levels 1-3 and no ancestor fallback.
Scope: opt-in V2; no V1/schema/unrelated directory changes. Admission rolls back the subject transaction; directory changes still checked on task entry.
Rollback: revert source/package for new versions; retain old commands, contracts and numbers.
Validation: zero/one/multiple supervisors, selected dept with multiple memberships, parent levels, infrastructure retry, deterministic terminal state, transaction rollback, browser recovery without duplicate creation. TEST activation and real-role acceptance remain separate gates.

The current request handling department has no supervisor, but after the user correction it is not authoritative for the initiating-unit node. Do not repair it by assigning invented staff. Missing organizational input must be collected before resolving approvers; defer admission only for nonempty choose_department requirements, never when no units exist. Old accepted commands retain frozen facts/versions; no silent migration or duplicate submission.
