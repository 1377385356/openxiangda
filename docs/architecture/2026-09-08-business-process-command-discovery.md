# Recover Original Process Commands from a Business Record

Status: approved for the full lifecycle verification.

A newly committed subject can be visible before workflow event projection. A
fresh detail entry has a record ID but no processCommandId. The platform durable
command service already owns the association and permissions. Add typed read-only
subject queries to browser and Nest clients, using that owner.

Require resourceCode/recordId and current environment; optionally filter workflow
and operation. Existing command views are ordered newest first by database
(created_at,id), pageSize 1..50 (default20), nextCursor is the last command ID only
when more exist. beforeCommandId must be readable and match the requested history.
Multiple commands remain distinct; callers apply their business rule rather than
silently selecting the latest. Continue with original receipt/poll/surface; do not
submit again merely to recover an ID.

Current identity and command authorization remain platform owned: same
tenant/app/environment, initiator or existing superadmin. A business record read
grant alone does not grant command access. Existing history remains readable
after subject deletion without expanding subject RLS. Nest requires one explicit
declared workflowCode and checks returned items against it. Browser derives the
current environment from platform metadata.

No second store, credential, queue write or command transition. The server reads
at most pageSize+1 through scoped subject/index lookup, without count or OFFSET.
Database cursor comparison preserves microseconds despite newer inserts. Each
page refreshes authorization. Invalid cursor/scope or revoked access fails.

Advance business-process.durable-command to 1.1.0 through the capability map so
incompatible deployments fail preflight; old clients remain supported. Stable
V1 and apps without this capability are unaffected. Roll back clients before the
backend; the additive index is independently removable and data is unchanged.

Verify typed exports, current environment propagation, Nest declaration and
identity forwarding, filters/cursor encoding and backend real-PG isolation and
pagination. App acceptance must reopen before signed event projection and recover
the original command without creating another one.
