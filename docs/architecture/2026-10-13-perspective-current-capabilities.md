# Perspective read capability intersection

School instrument acceptance on official SDK2.67.1 reproduced private instrument_admins read rejection after selecting a multi-role maintenance perspective. The declaration includes school, college and instrument roles. Runtime.hasReadCapability used only the declaration capabilities when selected, so a limited member could choose a full management DTO even though Native correctly rejected it.

Owner: the SDK Runtime current-identity capability selector. A perspective only narrows current grants; it cannot add capabilities from an unheld role. Compute identity membership capability AND selected perspective capability. Preserve governance override, union reads, writes, membership authority, role projection and Native RLS. No application role list, new grants or copied credentials.

Regressions cover a capability supplied only by another declared role, actual allowed intersection, hidden-by-perspective capabilities, union behavior, governance override, and revoked current grants while a perspective remains selected. The previous predicate reproduced two failures. Root source tests are not school acceptance; the official release, exact consumer upgrade and real-role page readback remain required.

Rollback: revert this selector change; no data/schema or credential change. This reintroduces misleading UI projection selection, not a Native authorization bypass.
