# Advanced query operand preservation

Evidence: TEST Head6 /meetings returns400 OPENXIANGDA_NATIVE_DATA_STRING_INVALID.
Application uses the public typed where predicate participants has scalarUserId.
Public openxiangda/core buildResourceWhere on2.8.1 independently reproduces the
incorrect has arrayUserId. No app source change is warranted.

The SDK owns conversion of Field Kit display snapshots into stable query values;
the Data API owns operator/type validation, membership composition and RLS. The
advanced where compiler currently reuses shortcut filters (which infer hasAny or
range comparisons), then overwrites only the operator. This changes the caller's
operation operand cardinality and can lose explicit path.

Keep the logical tree, operator and explicit path. For scalar has preserve a
stable scalar or unwrap one selection snapshot; retain cascade path snapshot
conversion for the existing cascade control. For in/between/hasAny/hasAll preserve
array cardinality and normalize each snapshot without dropping values, while
retaining the rich multi-cascade terminal projection. An explicit path addresses
the declared subvalue and must not be replaced by top-level selection conversion.
Shortcut filters continue their established UI semantics. No new endpoint, store,
identity, role session, migration, retry or authorization bypass is introduced.

Only V2 browser query serialization changes. Stable V1 is isolated. Existing
correct canonical predicates remain equivalent at the Data API boundary. This is
an independently reversible SDK patch after the CRUD2.9.0 publication; roll back
the application candidate/package lock if necessary. Do not rewrite an artifact
that is already in formal verification or publication.

Verify public-query has for option/user/department/resource/cascade fields,
array operators including in and between, nested AND/OR/NOT, explicit paths,
immutable caller input and existing Field Kit snapshot conversions. Assert actual
resource list/batch/export request bodies where practical. Publish a Changeset
patch with a fresh packed gate; repeat the child's exact public reproduction and
real employee/employee-manager PC/mobile My Meetings page against independent
standard-API expected record sets. Preserve the original400 evidence.
