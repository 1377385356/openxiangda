# PLT-076: Public named-query sort priority

## Evidence and owner

A real school Head41 anonymous ranking query declared total_booking_count DESC then instrument_name ASC, but bootstrap returned instrument_name ASC first and the page showed ten zero-booking instruments. The canonical compiler sorts the query.sort array by field name, changing SQL ORDER BY priority. This is not a UI-only sorting or missing-counter issue. The contracts compiler is the sole declaration/canonicalization owner; the server consumes its immutable ordered declaration.

## Decision and invariants

Preserve declaration order for public-query sort items, as already required for Native multi-column order. Continue canonical key serialization, query/policy stable code ordering, field/parameter sets and all validation. No filters, fields, grants, schema, query operations, public scope or business data changes. Existing compiled versions remain immutable; recompile and publish applications to adopt corrected priority. V1 remains untouched.

Different sort priority must produce different config digests; repeating the same declaration must remain deterministic and share app/server canonical compilation. Retain stable final id ordering and pagination contracts. No frontend resorting a wrongly selected first page, query proxy or expanded full-table read. Rollback requires restoring prior application version; records and original operation receipts remain intact.

## Verification and release

Regression compiles two reverse-priority declarations and proves both exact order preservation and different digests, then compiles canonical bytes through the target shared compiler to prove agreement. Existing compiler public-query tests and affected gates remain required. Real school ranking before/after remains separate.

The earlier 2.75.0 candidate was frozen but no validation or npm writes were started; its original tarballs are retained. This new fix and the public-access Skill change require an additional contracts patch and Skill-kit patch, plus root/CLI patches. The formal planner chooses the next versions; do not overwrite predecessor package versions, publish altered 2.95.1/2.3.126 bytes, or race the other live 2.74.1 release.

The first local regression still failed after correcting the shared compiler because the application source bundler independently reordered the array before shared compilation. Both canonicalization stages now preserve sequence, and the regression covers app/target agreement. The original failed log remains /tmp/zjnu-public-sort-compiler-tests.log; this is why source inspection or a mock page alone would not close the issue.
