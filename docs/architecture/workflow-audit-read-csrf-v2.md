# Workflow change-history transport

Live alpha.99 acceptance on the foundation Demo returned
`WORKFLOW_V2_CSRF_INVALID` when opening change history. The browser's new
`loadWorkflowDataAudit` omitted the CSRF header used by the other Workflow
Surface readers. The server authorizes this projection through instanceSurface,
which may issue command tokens and therefore retains its existing CSRF check.

The platform browser client owns the correction: use workflowCsrfToken and the
same request header as record/task/instance detail. Identity, field redaction,
instance visibility, pagination and server authorization remain unchanged.
No application workaround, alternate credential, token store or backend change
is needed. The existing helper owns acquisition and errors; a rejected or
missing credential fails closed and the history component retains its retry.
The change performs no business write and adds no concurrency/resource scope.
It affects only optional 2.0 Workflow history; 1.x and other data paths remain
outside the change. Rolling back the browser package reverses the request fix.

Verification must first reproduce the missing-header rejection in the browser
fixture, then prove the real history request carries the acquired CSRF token
and renders successfully. After publication, repeat real Demo history and
multi-role detail checks without modifying the already completed workflows.
