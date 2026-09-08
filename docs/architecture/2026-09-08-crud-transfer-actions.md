# Generated CRUD import/export visibility

Decision accepted for implementation after the audit capability reference release.

Evidence: the meeting room list displays import/export although the confirmed
first release excludes these tasks. GeneratedDesktopList unconditionally renders
export and derives import only from create permission. There is no public view
declaration to omit these controls. Direct CSS removal would bypass the component
contract and would not apply coherently to mobile or named views.

Application presentation owns desired task visibility; platform authorization
continues to own whether a request may execute. Add optional
`crud[].list.actions: { import?: boolean; export?: boolean }` to the public list
declaration and its compiled `surface.list`. Omission preserves current behavior.
False suppresses the control; true still requires existing capability and mutation
owner constraints. It is not an authorization grant or Data API denial policy.
Named views own their own setting; desktop native/workflow import and desktop/
mobile export consume the same projection. No extra export permission model,
transport, endpoint, state store or CSS workaround.

The compiler, shared validator, native server compiler, JSON schemas and bundle
normalization must preserve and validate the flags; malformed/unknown action keys
fail before publication. Both authored model CRUD and direct resource paths are
covered. Canonical package and platform contracts must upgrade together before
the application deploys the declaration.

Additive and independently reversible. Existing applications and V1 remain
unchanged; no migrations, records, event contracts, locks or extra network I/O.
Reverting a platform compiler while an active application contains the new
declaration requires preserving the matching contracts package, so rollback should
use the previous complete platform combination and app candidate together.

Verify config-to-bundle-to-shared-validator roundtrip for default/named views,
false/true/omitted settings and invalid types/keys. Browser controls must disappear
without affecting create/edit or field authorization; mobile export follows the
same flag. The meeting app must use the public declaration and actual deployed
PC/mobile browser readback must confirm the reviewed task set.
