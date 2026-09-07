---
"openxiangda-admin": patch
"openxiangda-user": patch
"create-openxiangda": patch
---

Correct the standard application runtime surfaces: normalize stable option and
directory filters as JSON containment predicates, retain at most six mounted
Admin pages while remounting URL-bound instances on search/hash changes, and
add an explicit desktop workflow return action. The generated application now
uses platform department-supervisor resolution, omits mobile role switching,
and keeps dynamic details, edits, and tasks outside the page cache.

Architecture boundary: Data API remains the only query and audit owner;
Field Kit remains the stable-value and department-control owner; Workflow
Kernel continues to resolve configured organization supervisors. Native audit
is supplied by the platform server under the existing data-audit-page contract.
