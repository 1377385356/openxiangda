# Released supervisor chain bindings

Claude P1 contract section 6.1 is the accepted basis. The application releases a supervisor_chain binding from the request initiator or a declared user fact, with a level (1..20), top or first matching app role stop. Administrators select a released binding; chain parameters remain code-owned.

Owners/invariants: the existing department supervisor service owns hierarchy and managers; the existing current-user profile owner resolves a selected user's affiliated department; existing assignment owns active-tenant filtering, dedupe, snapshots and empty-policy evidence. The initiator uses only the department already frozen at launch; its application must declare the starter department policy. Continuous chains require sequence mode, including effective node parameter overrides. A role is only a stop criterion, never fabricated authority on every manager.

Bounds/failure: max 20 hierarchy steps, visited department set against cycles, max 200 unique selected handlers under existing assignment bounds. Missing manager defaults to skip_level; block is explicit. Role not reached blocks. Invalid/missing user or department blocks with a named resolution reason. A genuine empty chain can follow approval empty policy; resolution errors never become empty skip evidence. Directory changes affect future entry; an entered seat list stays E-pinned.

Compatibility/rollback: opt-in provider/capability, no new organization source, no change to legacy department_supervisor or V1 traversal. Retain compatible assignment code while chain versions exist. Verify linear and role stops, missing levels, inactive users, cycles, from-user profile, ordered dedupe, mode override denial and developer/sealed compilation parity. No production deployment.
