# OpenXiangda 2.0 Field Component Protocol And Delivery Ledger

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

Status: implementation and `reference-environment` test acceptance completed on 2026-08-24

This document is the authoritative implementation ledger for the OpenXiangda
2.0 field protocol, standard Field Kit, typed Data Query, physical storage,
indexes, and row-level data authorization. Update the checkboxes in the same
change that closes an item. A component is not complete when only its editor
control renders; every row in the delivery matrix must pass its full vertical
slice.

## 1. Problem Evidence

- The current public field `type` describes physical storage rather than the
  stable business value. `string + select`, `json + multi`, and scalar
  directory/resource references therefore have no authoritative value codec.
- Static options exist only in the generated Surface. They are removed from the
  platform Data Resource projection, so the platform cannot understand option
  semantics when it validates values, builds filters, chooses indexes, or
  evaluates row policies.
- Directory and resource selectors currently submit scalar IDs. Read-only
  rendering resolves those IDs remotely, which adds latency and makes historic
  labels depend on the current source record.
- `DataQuery.filters` targets raw columns with generic operators. The platform
  cannot derive `jsonb ->> 'value'`, multi-value containment, range operators,
  or semantic indexes from that contract.
- The standard 2.0 Field Kit has no complete Radio, Checkbox, time-only, range,
  cascade, address, location, image, rich-text, handwritten-signature, serial,
  or child-table vertical slice.
- Existing 2.0 data and AppVersions are test-only. They are not a compatibility
  boundary and may be discarded.

## 2. Capability Owners

| Capability | Authoritative owner | Invariant |
| --- | --- | --- |
| Authored field declaration | `openxiangda-devkit-core` | An application declares each field once. |
| Stable value and query contracts | `openxiangda-contracts` | One semantic type has one stored/read shape and one write shape. |
| Physical storage and indexes | Platform Native Data prepare | Semantic type deterministically produces SQL columns and indexes. |
| Writes, reads, query compilation | Platform Native Data API | All ordinary CRUD passes through one type-aware implementation. |
| Row/field authorization | Platform Native AuthZ + PostgreSQL RLS | UI guards are advisory; RLS is authoritative. |
| Desktop/mobile rendering | Generated application Field Kit | Widgets adapt values but never redefine persistence. |
| Dynamic source lookup | Platform Data API or Directory API | Lookups are paged on edit; reads use stored snapshots. |
| Managed files | Platform Native file lifecycle | Business rows store managed references, never credentials or data URLs. |

Application NestJS services do not implement ordinary field CRUD, option
lookup, or authorization shadows.

### 2.1 Implementation Module Boundaries

The implementation must preserve the following focused modules and one-way
dependency direction. Public orchestration services may compose these modules,
but must not duplicate their rules or grow semantic-type switch statements.

| Layer | Focused owner | Owns | Must not own |
| --- | --- | --- | --- |
| Contracts | field value schemas | Stored/read/write shapes and structural bounds | SQL, widgets, authorization sessions |
| Contracts | query validation | Bounded `where` AST and operator payload shapes | SQL strings or physical columns |
| Devkit compiler | field codec/surface/query/physical/policy modules | Declaration closure and deterministic plans | Runtime database access |
| Platform prepare | Native field protocol and physical-plan installer | SQL columns, constraints, child tables, indexes | Request values or RLS decisions |
| Platform Data API | Native value validator | Per-type normalization, bounds, sanitization, immutable fields | Query SQL or request identity |
| Platform Data API | Native query compiler | Declared-field/operator-to-parameterized-SQL translation | Executing SQL or evaluating roles |
| Platform Data API | Native mutation coordinator | Parent/child transaction, revision checks, serial allocation | Field-shape or query-AST duplication |
| Platform AuthZ | Native RLS/session binding | Principal, role union, scopes, field masks, PostgreSQL role/context | Field rendering or source labels |
| Field Kit | family adapters and read-only displays | Widget interaction and value adaptation | Persistence contracts, authorization, source-of-truth state |
| Acceptance | fixtures and black-box drivers | Data API CRUD/query/RLS/UI evidence | Direct business-row repository writes |

The dependency direction is Contracts -> compiler plans -> platform focused
modules -> thin API orchestration -> Field Kit adapters. Shared modules expose
typed inputs and deterministic outputs. They do not receive a controller,
request context, `DataSource`, or React component unless that dependency is the
module's explicit owner boundary.

### 2.2 Remote Acceptance Scope Projection Path Decision

- **Evidence:** preproduction deployment
  `9dbcda1e-968b-561d-a9fc-1ad3d3a1c615` rejected the compiler-valid semantic
  path `/config/authz/scopeSources/0/subject/userIdField = user.value` with
  `NATIVE_FIELD_CODE_INVALID` before environment Head activation. The Devkit
  contract deliberately requires `user.single.value` for subjects and a
  dimension-compatible semantic path such as `resource-ref.single.value` for
  grants, while the platform still treated both as top-level column names.
- **Owner:** Platform Native AuthZ remains the sole owner of scope projection.
  One shared platform semantic-path module validates and reads the declared
  source field; applications do not add scalar shadow columns or a second
  authorization evaluator.
- **Stable invariants:** source records keep complete labeled snapshots.
  Subject and grant identity comes only from their stored stable `value` (or an
  explicitly declared resource snapshot field). The supported grammar stays
  closed to `field`, `field.value`, and `field.snapshot.declaredField`.
- **Affected contracts:** platform configuration validation and the existing
  scope projector consume the already-published semantic-path contract. Public
  field values, standard Data API requests, physical columns, and stable 1.x
  contracts are unchanged.
- **Failure/concurrency/security bounds:** malformed, undeclared,
  type-incompatible, unsafe, missing, non-scalar, or oversized path values fail
  closed. Projection continues to snapshot one Native Head, use the existing
  bounded batch/lease flow, and commit one immutable projection generation.
- **Rollback boundary:** the platform server change is independently
  reversible before a platform image is promoted. Failed application
  candidates never became environment Head; production is not touched.
- **Falsifiable verification:** platform compiler tests accept only valid
  subject/grant paths and reject invalid ones; projector tests read nested JSON
  snapshots and preserve scalar support; the exact acceptance AppPackage
  compiles; descendant/exact/no-leak/transaction cases pass through the remote
  standard Data API and PostgreSQL RLS.

### 2.3 Snapshot Scope-Value Mutation Validation Decision

- **Evidence:** after platform candidate
  `20260824-085621-ec6125e0e1d052ad` and acceptance ApplicationVersion
  `7b31e66a-415c-5270-a87d-ddb008310b26` became the `reference-environment`
  preproduction Head, the first standard Data API create for `field-records`
  failed with `OPENXIANGDA_SCOPE_VALUE_NOT_FOUND`. The referenced `colleges`
  row already existed and was enabled. The mutation guard converted the whole
  stored snapshot `{ label, value, resourceCode, snapshot }` with `String()`
  and then required that result to be a UUID, while the policy evaluator and
  generated policy both declare `valuePath: "value"`.
- **Owner:** Platform Native scope-value validation is the sole owner of
  catalog existence checks before a Native mutation. It consumes the same
  normalized policy rule and `valuePath` semantics as Native row-policy
  evaluation; applications do not submit scalar shadow fields or bypass the
  catalog guard.
- **Stable invariants:** option, user, department, and resource references keep
  their complete snapshots. Identity is extracted from the declared path; an
  omitted path keeps the existing scalar-or-object-`value` default. Extracted
  values remain unique, bounded to 100, UUID-only for native-resource scope
  catalogs, and must identify enabled rows in the same tenant, application,
  environment, and active logical revision.
- **Affected contracts:** no public request, stored value, query, or policy
  contract changes. Only the pre-mutation catalog validator is aligned with
  the already-published snapshot and `valuePath` contracts.
- **Failure/concurrency/security bounds:** missing paths, objects at the leaf,
  malformed UUIDs, disabled/missing rows, more than 100 values, or conflicting
  value paths fail closed. Validation remains inside the existing Native
  mutation transaction and uses parameterized SQL against the active Head.
- **Rollback boundary:** the platform server fix is one independently
  reversible release topic. No migration or data rewrite is required. The
  acceptance application and historical 1.x data are unchanged.
- **Falsifiable verification:** focused service tests cover scalar values,
  single snapshots, arrays of snapshots, missing paths, malformed IDs, and
  disabled/missing catalog rows. The deployed acceptance application must then
  create the same record through the remote standard Data API and continue
  through its complete CRUD/operator/RLS matrix.

### 2.4 Typed Declared Query-Path Decision

- **Evidence:** after platform release
  `20260824-101001-f1652606e77f600e` removed the snapshot scope-value failure,
  the remote standard Data API matrix completed every whole-field operator and
  then rejected `location_value.longitude eq 120.123456` with
  `OPENXIANGDA_NATIVE_DATA_OPERATOR_TYPE_INVALID:location_value:eq`. The
  compiler validated the operator, literal, and cast against the parent
  `location` JSON type before resolving the already-declared `longitude`
  path. The same defect affects string snapshot paths and would otherwise
  compare PostgreSQL text extraction with numeric/boolean parameters.
- **Owner:** the active Head's complete resource declaration graph is the sole
  owner of query-path leaf types. A focused query-path planner derives built-in
  snapshot/address/location paths from their semantic protocol and derives
  `resource-ref.single.snapshot.*` paths from the referenced resource field
  declarations already loaded by the resource resolver. Applications do not
  repeat target types and the query compiler does not perform another database
  lookup.
- **Stable invariants:** only fixed built-in paths and explicitly listed
  `snapshotFields` are queryable. Option/directory display paths are text;
  location longitude/latitude/accuracy are decimals; location capture time is
  datetime; address division/display paths are text. Resource snapshot scalar
  paths retain the referenced field's scalar type; non-scalar snapshot leaves
  are JSON containment values. Whole-field operator semantics remain
  unchanged.
- **Affected contracts:** no public request or stored-value shape changes.
  The platform resource resolver attaches a non-serialized derived path plan
  to declared fields, and the shared Native query compiler resolves the path
  before operator validation, literal normalization, empty checks, and SQL
  generation. List, aggregate, export, dynamic sources, transaction assertions,
  and service guards continue to use that one compiler.
- **Failure/concurrency/security bounds:** undeclared paths fail before SQL;
  incompatible leaf operators and malformed leaf literals fail closed; path
  depth and length remain bounded. Every value remains a bound parameter, JSON
  path segments come only from declarations, and scalar JSON extraction is
  explicitly cast to the derived PostgreSQL comparison type. Planning is a
  bounded in-memory pass over the resource graph already fetched for the
  request and introduces no additional query or mutable state.
- **Rollback boundary:** the planner and compiler change are one reversible
  platform-server release topic with no migration, data rewrite, application
  compatibility path, or 1.x blast radius. The preproduction acceptance rows
  remain disposable.
- **Falsifiable verification:** focused tests must cover option/user/department
  display text, resource snapshot text and boolean leaves, address text,
  location longitude/latitude numeric comparison and ranges, datetime casts,
  undeclared paths, incompatible operators, bound parameters, and the absence
  of derived metadata from public resource JSON. The same cases must pass
  through remote list, aggregate, export, transaction guard, field permission,
  and PostgreSQL RLS execution on `reference-environment`.

## 3. Approved Invariants

1. OpenXiangda 2.0 has no old field-protocol compatibility. Do not add dual
   reads, dual writes, aliases, scalar-reference fallbacks, shape unions,
   shadow backfills, or historic test-data migrations.
2. Public field `type` is semantic. PostgreSQL storage is compiler-derived and
   is not authored separately.
3. `widget` is presentation only. A compatible widget cannot change the write,
   stored, read, query, or authorization value.
4. Single values use `null` when empty. Multi values, files, and images always
   use arrays and use `[]` when empty.
5. Options, users, departments, and resource references persist display
   snapshots. Reads, lists, exports, and permission checks do not resolve the
   source again.
6. The client is trusted to provide snapshot labels and metadata. The server
   performs bounded structural validation, but does not re-query a source to
   canonicalize a label. Stable IDs remain the comparison key.
7. An unchanged submitted reference preserves the existing snapshot. A source
   rename affects only later selections or an explicit snapshot refresh.
8. Query clients name declared fields and semantic operators, never SQL,
   PostgREST expressions, or arbitrary JSONPath.
9. Compiler-generated role/data-policy declarations become immutable AuthZ
   definitions. PostgreSQL RLS evaluates them for read/create/update/delete.
10. Stable 1.x applications, tables, APIs, and field components are outside the
    blast radius.
11. Implementation modules follow capability ownership. Value codecs, authored
    field validation, query AST validation, SQL compilation, physical/index
    planning, RLS policy materialization, and UI adapters must remain separate
    modules with focused tests. Do not grow a second monolithic service or one
    universal field component containing every semantic branch.

## 4. Core Snapshot Values

```ts
export interface LabeledValue {
  value: string;
  label: string;
  description?: string;
  color?: string;
}

export interface ResourceReferenceValue extends LabeledValue {
  resourceCode: string;
  snapshot?: Record<string, unknown>;
}

export interface UserReferenceValue extends LabeledValue {
  avatarUrl?: string;
  employeeNo?: string;
  title?: string;
  mobile?: string;
  email?: string;
  departments?: DepartmentReferenceValue[];
}

export interface DepartmentReferenceValue extends LabeledValue {
  fullPath?: string;
  path?: LabeledValue[];
  parent?: LabeledValue;
}
```

The standard selectors submit these complete snapshots. The Data API stores
them without source lookups after enforcing shape, maximum length, maximum
array count, field access, row policy, and transaction revision.

## 5. Semantic Field Catalog

| Semantic type | Compatible widget(s) | Stored/read value | PostgreSQL |
| --- | --- | --- | --- |
| `text.short` | `text`, `email`, `phone` | `string` | `varchar(length)` |
| `text.long` | `textarea` | `string` | `text` |
| `text.rich` | `rich-text` | sanitized HTML `string` | `text` |
| `number.integer` | `number` | integer `number` | `bigint` |
| `number.decimal` | `number`, `money`, `percent` | finite `number` | `numeric(p,s)` |
| `boolean` | `switch` | `boolean` | `boolean` |
| `date` | `date` | `YYYY-MM-DD` | `date` |
| `time` | `time` | `HH:mm:ss` | `time(0)` |
| `datetime` | `datetime` | RFC3339 instant | `timestamptz` |
| `date-range` | `date-range` | `{ start, end }` | `daterange` |
| `datetime-range` | `datetime-range` | `{ start, end }` | `tstzrange` |
| `option.single` | `select`, `radio` | `LabeledValue` | `jsonb` |
| `option.multiple` | `multi-select`, `checkbox` | `LabeledValue[]` | `jsonb` |
| `cascade.single` | `cascade` | `LabeledValue[]` path | `jsonb` |
| `cascade.multiple` | `cascade` | `LabeledValue[][]` paths | `jsonb` |
| `user.single` | `directory-user` | `UserReferenceValue` | `jsonb` |
| `user.multiple` | `directory-user` | `UserReferenceValue[]` | `jsonb` |
| `department.single` | `directory-department` | `DepartmentReferenceValue` | `jsonb` |
| `department.multiple` | `directory-department` | `DepartmentReferenceValue[]` | `jsonb` |
| `resource-ref.single` | `select`, `radio`, `resource` | `ResourceReferenceValue` | `jsonb` |
| `resource-ref.multiple` | `multi-select`, `checkbox`, `resource` | `ResourceReferenceValue[]` | `jsonb` |
| `file` | `attachment` | `DataFileRef[]` | `jsonb` |
| `image` | `image` | `DataImageRef[]` | `jsonb` |
| `signature` | `signature` | managed PNG signature value | `jsonb` |
| `address` | `address` | administrative labeled path + detail | `jsonb` |
| `location` | `location` | exact DingTalk/browser WGS84 coordinates; optional provider display snapshot, never manual input | `jsonb` |
| `json` | `json` | bounded JSON | `jsonb` |
| `serial-number` | `readonly` | generated `string` | `varchar(255)` |
| `uuid` | `readonly` | UUID `string` | `uuid` |
| `subtable` | `subtable` | child row aggregate | child resource/table |

The 1.x `AssociationFormField` maps to `resource-ref.single` or
`resource-ref.multiple`; it does not introduce a second reference value shape.
The 1.x `EmployeeSelectField` and `TextareaField` names are aliases of member
selection and long text and are intentionally not carried into 2.0.

`money` and `percent` are widgets/configurations of decimal semantics rather
than separate stored values. Percent stores its displayed percentage points:
`12.5` means `12.5%`.

## 6. Option And Reference Sources

Static options:

```ts
{
  type: 'option.single',
  widget: 'select',
  options: [{ value: 'draft', label: 'Draft' }]
}
```

Same-app resource options:

```ts
{
  type: 'resource-ref.single',
  widget: 'select',
  source: {
    kind: 'resource',
    resourceCode: 'customers',
    labelField: 'name',
    searchFields: ['name', 'code'],
    descriptionFields: ['code', 'mobile'],
    snapshotFields: ['code', 'mobile', 'level'],
    pageSize: 20
  }
}
```

- Dynamic Select uses 300 ms debounce, cursor pagination, and at most 100
  resolved selected entries per request.
- Dynamic Radio/Checkbox requires `loadMode: 'all'` and has a hard limit of 100
  options. Larger sources must use searchable Select.
- Source filters may contain literals and validated bindings to another current
  form field. They cannot contain executable code or raw query fragments.
- Deleting a source record does not delete or blank historic snapshots.

### 6.1 Subtable Child Resource And Transaction References

Subtable is an aggregate UI over an ordinary child Data Resource. It does not
store child rows in a parent JSON column and does not introduce a second child
CRUD API:

```ts
{
  type: 'subtable',
  widget: 'subtable',
  subtable: {
    resourceCode: 'instrument-items',
    foreignKey: 'instrumentId',
    orderField: 'displayOrder',
    maxRows: 20
  }
}
```

- `foreignKey` names a writable child field whose stored value is the parent
  record UUID. `orderField` names a writable child `number.integer` field. Both
  fields belong to the child resource; the parent subtable pseudo-field never
  becomes a parent SQL column or mutation value.
- Reads use the standard child-resource Data API query with `foreignKey =
  parent.id`, ordered by `orderField` and then `id`. Child field permissions and
  child-resource RLS remain authoritative.
- Create/update/delete/reorder is submitted as one standard Data API
  transaction. The client does not generate parent IDs.
- `maxRows` defaults to 20, may not exceed 49, and the sum of `maxRows`
  across all subtable fields on one parent resource may not exceed 49. This is
  derived from the fixed 100-operation transaction bound: the worst replacement
  is 49 old-row deletes + 49 new-row creates + 1 parent mutation = 99 operations.
- A transaction operation value may use only this bounded reference shape:

```ts
interface DataTransactionOperationReference {
  operationIndex: number;
  field: 'id';
}
```

  The reference is allowed only as a direct field value inside an operation's
  `data`, may point only to a preceding operation, and may read only that
  operation result's generated `id`. The platform resolves it inside the same
  PostgreSQL transaction before semantic field validation. References are not
  general expressions and cannot appear in guards, IDs, revisions, query
  predicates, nested snapshot properties, or any other request location.

Architecture gate for this topic:

- Problem evidence: transaction operations currently cannot pass a newly
  generated parent ID to child creates, so an atomic parent/child create cannot
  be expressed without an unsafe client-generated ID.
- Capability owner: the contracts package owns the reference shape; the Native
  Data API transaction coordinator alone validates and resolves it; the child
  resource remains the only owner of child business data.
- Stable invariants and affected contracts: only prior-operation generated IDs
  are referenceable; `DataTransactionOperation`, its JSON Schema and validator,
  subtable declarations, compiled Surface, generated client, and platform
  transaction input change together.
- Failure and concurrency behavior: malformed, nested, forward, out-of-range,
  non-ID, missing-result, unauthorized, revision-conflicting, or over-`maxRows`
  operations fail the complete transaction. Parent and children commit once or
  roll back once; idempotency covers the resolved operation set.
- Security and resource bounds: at most 100 operations per transaction and at
  most 49 aggregate child rows per parent declaration;
  reference resolution does not bypass writable-field checks, semantic value
  validation, child capability checks, field permissions, or PostgreSQL RLS.
- Rollback boundary: this is a pre-release breaking contract with no 1.x or old
  2.0 compatibility. Reverting the package/platform pair restores the previous
  transaction schema; no production business-row migration is involved.
- Falsifiable verification: schema tests reject every forbidden reference
  shape; platform tests prove atomic parent create plus child creates, child
  update/delete/reorder, idempotent replay, authorization/RLS denial, stale
  revision failure, and rollback with no persisted parent or child rows.

### 6.2 Managed Rich-Text Inline Images

Rich-text inline images use the existing Native managed-file lifecycle. They do
not use data URLs, public object-store URLs, a second upload API, or unmanaged
HTML references.

- The rich-text editor initiates and completes an upload against its owning
  `text.rich` field, then inserts only the exact authenticated Native file
  content route. Stored HTML contains the stable file ID, not a signed URL.
- Inline images are limited to PNG, JPEG, WebP, or GIF; SVG is rejected. Each
  object is at most 10 MB and one rich-text value may reference at most 20
  distinct managed images.
- The platform sanitizes HTML first and parses the surviving `img` elements with
  a structured HTML parser. Business writes validate the managed route shape but
  do not replay upload-session, Head, owner, action, intent or file-row checks.
- Create/update stores the HTML in the business transaction and queues its file
  IDs for asynchronous reference projection. Images released by every record
  receive the normal retention delay. Incomplete and unreferenced uploads remain
  subject to bounded cleanup and the explicit delete endpoint.
- Image content reads still require resource read permission, field read
  permission, row visibility through PostgreSQL RLS, and the matching record.
  The stored HTML is not an authorization token.

Architecture gate for this topic:

- Problem evidence: the editor currently permits only formatting and links;
  although the sanitizer recognizes managed image routes, `text.rich` cannot
  initiate, validate, reference, release, or render a newly uploaded inline image.
- Capability owner: Contracts own the stable managed reference and HTML bounds;
  the Native managed-file service owns upload state and object retention; the
  rich-text adapter owns only selection/caret interaction and HTML insertion.
- Stable invariants and affected contracts: the existing upload/complete/content
  endpoints remain the only file API; `text.rich` becomes an allowed image-only
  owner in those endpoints; the stored string shape does not change.
- Failure and concurrency behavior: upload completion creates a durable asset;
  a successful revision-checked business mutation queues the exact parsed set.
  A stale revision, denied row, denied field or malformed HTML rolls back the
  mutation, while reference projection retries independently after commit.
- Security and resource bounds: exact managed routes only, four raster MIME
  families, 10 MB per image, 20 distinct images per value, existing HTML byte
  and node bounds, and no SVG/data/blob/external URL acceptance.
- Rollback boundary: reverting the platform and Field Kit changes restores the
  prior editor. Ready but unreferenced objects are cleanup-owned; no 1.x table or
  application data is touched.
- Falsifiable verification: parser tests reject external/data/SVG routes,
  deduplicate repeated references, and enforce image-count limits; Data API tests prove JSON persistence, asynchronous
  reference/release, rollback, and RLS-protected reads;
  desktop/mobile component tests prove managed upload and insertion.

### 6.3 Managed Image Metadata And Thumbnails

The Native managed-file service, not the browser, derives image metadata and
creates thumbnails after object upload completion.

- `image` completion reads the bounded original once, rejects undecodable or
  oversized-pixel images, applies EXIF orientation, records positive width and
  height, and writes one maximum 480 x 480 WebP thumbnail beside the original.
- Upload completion returns a file reference plus platform-derived `width`,
  `height`, `previewUrl`, and `thumbnailUrl`; business data stores that ordinary
  typed JSON value. Both routes remain authenticated Native content routes;
  object names and signed storage URLs are never persisted in business rows.
- Original and thumbnail share one metadata row, reference state, record/field
  authorization boundary, retention clock, and cleanup claim. Cleanup deletes
  both objects before marking the metadata row deleted.

Architecture gate for this topic:

- Problem evidence: the current image shape permits client-provided dimensions
  and URLs, while upload completion records only generic file metadata and the
  UI repeatedly loads the original for list previews.
- Capability owner: a focused Native image processor owns decoding and resize;
  platform storage owns object reads/writes/deletes; managed-file metadata owns
  lifecycle state; Field Kit only renders canonical variants.
- Stable invariants and affected contracts: generic files remain unchanged;
  `image` values require positive dimensions and authenticated preview/thumbnail
  routes; the Native file table gains only image metadata columns.
- Failure and concurrency behavior: image completion is idempotent. Decode,
  thumbnail write, or metadata CAS failure leaves the file pending and fails
  completion; retry recomputes the deterministic thumbnail object. Business
  reference projection occurs asynchronously after the later record transaction.
- Security and resource bounds: declared file-size bound, Sharp input-pixel
  limit, one 480 x 480 WebP variant, no SVG, no public URL, and the same field
  plus row authorization as original content.
- Rollback boundary: stop new image completion, remove unreferenced thumbnail
  objects, then drop the additive metadata columns. Existing generic managed
  files and all 1.x storage remain untouched.
- Falsifiable verification: processor tests assert orientation/dimensions and
  thumbnail bounds; completion tests assert canonical metadata and idempotency;
  cleanup tests delete both objects; content tests enforce field/RLS checks for
  original and thumbnail variants.

### 6.4 Standard Data API CSV Export

CSV export is one bounded standard Native Data API operation. It does not page
the list API in the browser and does not introduce a second filter, sort,
projection, authorization, or value-formatting language.

- `POST /data/{resourceCode}/export` accepts the same `select`, `where`, and
  `order` contract as list. The platform supplies the active environment and
  returns UTF-8 CSV with a BOM so spreadsheet applications preserve Chinese
  text. Column headers are the active Surface field labels; stored snapshot
  labels are exported directly without resolving their sources.
- The operation enters `openxiangda_data_api` with the same principal and active
  AuthZ revision as list, rejects unreadable selected/filter/order fields, and
  keeps PostgreSQL RLS active for every export query. Semantic database decoding
  and readable-field masking are shared with get/list/aggregate.
- Export is streamed in deterministic bounded batches under one read-only
  transaction. The default and hard row limit is 10,000, the hard encoded byte
  limit is 20 MiB, the batch size is 200, and the transaction statement timeout
  is 30 seconds. Crossing any bound aborts the stream and releases the query
  runner; partial output is never represented as a successful JSON response.

Architecture gate for this topic:

- Problem evidence: the generated browser currently repeats list requests and
  assembles up to 10,000 rows in memory. It can observe different revisions
  between pages, duplicates CSV formatting semantics, and has no authoritative
  byte/time bound.
- Capability owner: Contracts own the export request; the Native Data API owns
  query execution, field masking, semantic decoding, and CSV serialization; the
  generated client owns only download initiation and filename handling.
- Stable invariants and affected contracts: `select`, `where`, and `order` keep
  their standard meanings and compiler; no raw SQL, arbitrary snapshot path,
  browser-side requery, or public object URL is added. Contracts, controller,
  Data API service, generated client, and CRUD export action change together.
- Failure and concurrency behavior: invalid input fails before response
  streaming. The export uses one PostgreSQL snapshot; timeout, disconnect,
  query failure, row overflow, or byte overflow aborts the transaction and
  closes the stream. No retry is performed after bytes are sent.
- Security and resource bounds: explicit query capability, readable-field
  projection, RLS for every batch, 200-row batches, 10,000 rows, 20 MiB, 30
  seconds, CSV formula neutralization, and RFC 4180 escaping.
- Rollback boundary: removing the additive endpoint and restoring browser list
  paging requires no schema or business-data migration and does not affect 1.x.
- Falsifiable verification: contract tests reject nonstandard keys and invalid
  bounds; platform tests assert shared SQL text/parameters, role entry/reset,
  unreadable-field rejection, RLS-visible rows only, semantic snapshot labels,
  formula/quote/newline escaping, deterministic order, row/byte/timeout aborts,
  disconnect cleanup, and frontend download wiring.

### 6.5 Explicit Business UUID Fields

An authored `uuid` field is business data, not platform-generated identity.
Only the resource system field `id` uses `uuid_generate_v4()`. Omitting an
optional UUID keeps the value `NULL`; a current create for a logically required
UUID must supply it explicitly, while the authored column remains physically
nullable for historical rows. A valid explicit UUID is accepted on create so the transaction
coordinator can inject a newly created parent ID into a child resource foreign
key. Update remains read-only for UUID fields in the standard Field Kit.

Architecture gate for this topic:

- Problem evidence: treating every UUID-typed field as generated wrote random
  values into omitted nullable business fields, including workflow references
  that did not correspond to any Workflow instance.
- Capability owner: the physical-plan compiler owns database defaults; the
  Native Data API mutation boundary owns validation; the transaction
  coordinator alone resolves parent-ID references; Field Kit only displays the
  stored result.
- Stable invariants and affected contracts: UUID storage remains PostgreSQL
  `uuid`; omitted optional values remain `NULL`; explicit create values still
  pass semantic validation, field-create permission, capability, and RLS;
  update rejects UUID fields before SQL. No client-side UUID generator or
  second identifier store is introduced.
- Failure and concurrency behavior: invalid, forbidden, duplicate, forward,
  or unresolved transaction references fail the complete transaction; a retry
  relies on the existing idempotency result.
- Security and resource bounds: callers cannot mutate identifiers after create;
  transaction injection remains a direct prior-create `id` reference and
  cannot read arbitrary operation fields or bypass child field permissions.
- Rollback boundary: the physical planner and update guard change only
  pre-release 2.0 runtime behavior; 1.x schemas remain untouched.
- Falsifiable verification: physical-plan tests assert no default on authored
  UUID fields and preserve the system row-ID default; standard Data API tests
  prove omitted `NULL`, explicit child FK create, malformed create rejection,
  update rejection, revision behavior, RLS denial, and read-only rendering.

### 6.6 Pre-Release Reset And PostgreSQL Extensions

The existing immutable migration sequence
`1787427731998` through `1787427732001` is the authoritative one-time 2.0
pre-release reset. It selects only applications whose `runtime_settings` marks
`applicationV2`, removes both retired and Native physical tables, deletes the
complete scoped application domain, and restores trigger modes. It is not
duplicated for this field protocol. The release runbook requires the reset
sequence to have run after the last disposable 2.0 test application, or requires
those applications to be explicitly recreated before field-protocol acceptance.

The SQL migration path also installs `uuid-ossp` and `pg_trgm` idempotently.
Native resource row IDs depend on `uuid_generate_v4()`; authored UUID fields do
not. Declared searchable fields depend on `pg_trgm` before their generated GIN
indexes are prepared.

Architecture gate for this topic:

- Problem evidence: the reset sequence and live rehearsal already delete the
  intended complete pre-release domain, while adding a second reset would create
  competing deletion ownership. Conversely, physical plans emit trigram indexes
  but no current production SQL migration guarantees `pg_trgm`.
- Capability owner: immutable SQL migrations own extensions and destructive
  application-domain changes; the Native prepare compiler only consumes those
  capabilities; the runbook owns backup, downtime, order, and evidence capture.
- Stable invariants and affected contracts: only `applicationV2` scopes are
  reset; 1.x apps and tables are never selected; published migrations are not
  edited; extension creation is additive and idempotent; generated field SQL
  never attempts ad hoc extension installation.
- Failure and concurrency behavior: the backend is stopped for the reset
  runbook even though individual migration headers permit online execution.
  Trigger state is snapshotted and restored, invalid physical names fail closed,
  and a failed transactional migration is retried only after state inspection.
- Security and resource bounds: extension installation requires the deployment
  database role and exposes no application API. Reset scope is derived from
  persisted platform metadata, not caller input, and every physical identifier
  is regex-checked and identifier-quoted before `DROP TABLE`.
- Rollback boundary: extension rollback never drops a shared extension; reset
  rollback restores the pre-release database/object backup. Deleted 2.0 test
  applications are deliberately not reconstructed by compatibility code.
- Falsifiable verification: static migration verification passes; the live
  migration fixture recreates a disposable application with a Native physical
  table, reruns the reset sequence, proves both disappear, proves trigger modes
  restore, verifies both extensions, and reruns all migrations idempotently.

## 7. Type-Aware Query Contract

`DataQuery.filters` is replaced by a bounded `where` tree:

```ts
type DataWhere =
  | { and: DataWhere[] }
  | { or: DataWhere[] }
  | { not: DataWhere }
  | {
      field: string;
      operator: DataQueryOperator;
      value?: unknown;
      path?: 'value' | 'label' | `snapshot.${string}`;
    };
```

Limits: maximum depth 5, 50 predicates, 100 `in` values, 10 order terms, and
200 rows per page. `path` is optional and defaults to the semantic comparison
value. Snapshot paths must have been declared by `snapshotFields`.

| Field family | Operators |
| --- | --- |
| text | `eq`, `neq`, `contains`, `startsWith`, `endsWith`, `in`, `isEmpty`, `isNotEmpty` |
| number/date/time/datetime | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `between`, `in`, `isEmpty` |
| single labeled/reference | `eq`, `neq`, `in`, `isEmpty`, `isNotEmpty` |
| multiple labeled/reference | `has`, `hasAny`, `hasAll`, `isEmpty`, `isNotEmpty` |
| date/datetime range | `overlaps`, `contains`, `containedBy`, `isEmpty` |
| JSON/address | `jsonContains`; address also permits declared division/full-address paths |

One parameterized SQL compiler is reused by list, aggregate, export, dynamic
source lookup, transaction assertions, and black-box verification. PostgreSQL
RLS remains active for every generated statement.

## 8. Index Plan

- Scalar filter/sort fields: BTREE.
- Single labeled/reference value: BTREE expression on `(field ->> 'value')`.
- Multi labeled/reference and cascade fields: GIN `jsonb_path_ops`.
- Searchable scalar or stored label: `pg_trgm` GIN, generated only when declared.
- Date/datetime range: GiST.
- Arbitrary JSON: GIN only when explicitly indexed.
- Multi-valued fields are not sortable.
- Compiler rejects a requested filter/search/sort mode without a defined query
  and index plan.

## 9. Data Authorization Protocol

Resource capabilities answer whether a role may perform an operation. Data
policies answer which rows that role may operate on. Every protected resource
declares one `dataPolicyCode`; unrestricted roles bypass its restrictive rules.

### 9.1 Current user owns the row

```ts
currentUserDataPolicy({
  code: 'owner-only',
  resourceCode: 'instruments',
  field: 'owner',
  roleCodes: ['instrument_owner'],
  unrestrictedRoleCodes: ['school_admin']
})
```

For `user.single`, RLS compares `owner ->> 'value'`. For `user.multiple`, RLS
matches any array item's `value`.

### 9.2 College role sees its college rows

Declare the business dimension:

```ts
scopeDimensions: [{
  code: 'college',
  name: 'College',
  valueType: 'uuid',
  hierarchyMode: 'self_parent',
  valueSource: {
    kind: 'native_resource',
    resourceCode: 'colleges',
    labelField: 'name',
    enabledField: 'enabled'
  }
}]
```

Declare where a user/role membership receives its college grant. The source is
a normal business resource such as `college-role-assignments`:

```ts
scopeSources: [{
  code: 'college-role-assignment-source',
  name: 'College role assignments',
  resourceCode: 'college-role-assignments',
  subject: {
    type: 'role_membership',
    userIdField: 'user.value',
    roleCode: 'college_manager'
  },
  grants: [{
    dimensionCode: 'college',
    valueField: 'college.value',
    parentValueField: 'parentCollege.value'
  }],
  enabledField: 'enabled',
  failureMode: 'strict'
}]
```

Apply it to rows whose `college` field is a stored department/resource snapshot:

```ts
dataPolicies: [{
  code: 'instrument-college-scope',
  name: 'College managers operate within granted colleges',
  resourceCode: 'instruments',
  unrestrictedRoleCodes: ['school_admin'],
  matchMode: 'AND',
  rules: [{
    dimensionCode: 'college',
    field: 'college',
    valuePath: 'value',
    roleCodes: ['college_manager']
  }]
}]
```

The compiler validates every role, resource, field, dimension, and value path.
The platform materializes immutable role/dimension/policy definitions and scope
grants. The generated physical table has one generic RLS policy per operation;
the predicate resolves the active AuthZ revision and checks the row snapshot's
`value` against the current role membership's effective college closure.

Strict projection failures deny access. `last_known_good` is allowed only for
explicit low-risk read policies and never for create/update/delete.

## 10. Failure, Concurrency, Security, And Resource Bounds

- Writes carry `expectedRevision`; stale writes return 409 and are not retried.
- The complete parent/child subtable write is one transaction.
- Unknown fields, unsupported operators, undeclared paths, excessive query
  depth/count, malformed snapshots, oversized arrays/strings/JSON, and invalid
  managed files fail closed.
- Snapshot labels are trusted business display data, but HTML is escaped unless
  the semantic field is sanitized rich text.
- Rich text is sanitized on write and rendered with the same allowlist.
- Signature images use managed files. Signature JSON never contains base64 data.
- Location accepts only DingTalk or browser geolocation with required WGS84
  longitude and latitude. DingTalk capture explicitly requests WGS84 coordinates.
  The component exposes no address input and the protocol has no `manual`
  source. Address and POI text may be retained only as an optional read-only
  display snapshot returned by the provider with that coordinate; manually
  entered or address-only values are rejected.
- Stored directory snapshots may include avatar, employee number, title,
  mobile, email, and departments. Credentials and authentication secrets are
  never snapshot fields.

## 11. Reset And Rollback Boundary

- The first field-protocol deployment invalidates old 2.0 test AppVersions and
  recreates only OpenXiangda 2.0 Native business tables. No test-data backfill
  is provided.
- 1.x form tables and runtime contracts are never selected by the reset.
- After the reset, rollback is supported only between AppVersions compiled
  against this protocol. A pre-reset 2.0 AppVersion is not a rollback target.
- Package and platform changes remain independently versioned and are promoted
  only after their exact commits pass their own release gates.

### 11.1 Live Browser Acceptance Gate

- Problem evidence: the existing component Playwright suite renders all field
  families, while the standard resource-page suite intercepts `/service/**`.
  It therefore cannot prove that browser create/list/get/update/delete/query
  requests reach the Native Data API, parameterized SQL, and PostgreSQL RLS.
- Capability owners: the generated resource page owns UI workflow, its Refine
  Data Provider owns CRUD adaptation, the platform Native Data API owns all
  validation/query/mutation behavior, and PostgreSQL remains the only business
  data and row-authorization store. The acceptance harness owns no business
  behavior.
- Stable invariants: acceptance mounts the production standard resource page
  and Data Provider with an injected compiled declaration; it must not copy or
  replace CRUD behavior. All HTTP calls use the published Native Data API route
  and envelopes. No ORM or repository write counts as browser acceptance.
- Affected contracts: the generated resource definition dependency becomes an
  explicit injectable module boundary for tests and generated applications;
  default applications continue to use generated declarations with no behavior
  change. A dedicated E2E entrypoint is not included in production routes.
- Failure and concurrency: one disposable PostgreSQL container and one
  loopback-only HTTP bridge exist for one test run. Requests that switch between
  super-admin and restricted principals are serialized before binding the SQL
  session. Any browser, API, assertion, or child-process failure fails the gate;
  servers, data source, and container are always closed.
- Security and resource bounds: the bridge binds only `127.0.0.1`, accepts only
  the fixed acceptance app/resource/routes, uses no external credentials, and
  applies the same query/value bounds and RLS session service as the platform.
  The restricted browser role must not observe an out-of-scope row.
- Rollback boundary: the injectable factory/page-definition parameters and E2E
  files are independently removable; the default generated application path,
  persisted contracts, migrations, and production deployment are unchanged.
- Falsifiable verification: Playwright must drive standard page create, list,
  keyword query, detail get, update, audit read, and delete; assert stored
  `{label,value}` option snapshots and captured browser coordinates; then reload
  as a restricted role and prove one visible and one hidden PostgreSQL row. The
  platform live migration command must report the browser gate and leave no
  container or listening process.

## 12. Delivery Ledger

### A. Architecture And Contracts

- [x] Confirm evidence, owners, invariants, affected contracts, failure model,
  security bounds, reset boundary, and falsifiable verification.
- [x] Replace physical authored field types with the semantic catalog.
- [x] Add complete stored/read/write TypeScript values and JSON Schemas.
- [x] Add widget/type compatibility and source declarations.
- [x] Add bounded typed `where` query AST and operator matrix.
- [x] Generate exact record/create/update TypeScript types.
- [x] Add reviewed Changesets for every changed public package.

### B. Compiler And Physical Plan

- [x] Project semantic metadata into the platform Data contract and Surface.
- [x] Generate SQL storage type, nullability, constraints, and indexes.
- [x] Validate source resource/fields and snapshot paths.
- [x] Validate filter/search/sort/index compatibility.
- [x] Validate role/dimension/data-policy field paths against semantic codecs.
- [x] Remove old scalar reference and safe-widening compatibility branches.
- [x] Keep codec, Surface projection, physical plan, index plan, and policy-path
  validation in separate focused modules.

### C. Platform Data API And AuthZ

- [x] Add bounded snapshot and semantic scalar validation on create/update.
- [x] Encode/decode PostgreSQL range values.
- [x] Implement the parameterized semantic SQL query compiler.
- [x] Reuse it for list, aggregate, export, source lookup, and assertions.
- [x] Install expression/GIN/GiST/trigram indexes from the physical plan.
- [x] Prove current-user RLS for single and multiple user snapshots.
- [x] Prove college dimension RLS for exact and descendant college grants.
- [x] Prove field permissions mask or reject inaccessible snapshot fields.
- [x] Add the one-time 2.0 Native test-data reset migration/runbook.
- [x] Keep semantic value validation, parameterized query compilation, index
  installation, and RLS/session binding in separate focused modules.

### D. Standard Field Kit

- [x] Single-line text, multiline text, email, phone.
- [x] Integer, decimal, money, percent.
- [x] Boolean switch.
- [x] Date, time, datetime, date range, datetime range.
- [x] Static/dynamic Select single and multi.
- [x] Static/dynamic Radio and Checkbox.
- [x] Cascade single and multi.
- [x] User single and multi with rich snapshots.
- [x] Department single and multi with rich snapshots.
- [x] Resource reference single and multi with configured snapshots.
- [x] Attachment and image with managed file lifecycle.
- [x] Rich text with sanitization and managed inline images.
- [x] Address with lazy administrative divisions.
- [x] Location with exact DingTalk/browser coordinates.
- [x] Handwritten business signature with managed PNG.
- [x] JSON editor and read-only formatter.
- [x] Serial number.
- [x] Subtable as transactional child resource.
- [x] Desktop create/edit/read/list/filter for every component.
- [x] Mobile create/edit/read/list/filter for every component.
- [x] Keep field-family components separate and reuse focused snapshot,
  managed-file, date/time, and read-only display adapters.

### E. Falsifiable Verification

- [x] Every declaration compiles to one deterministic codec, Surface, SQL plan,
  and generated TypeScript value.
- [x] Every component passes create/read/update/null-or-empty round trips.
- [x] Every declared operator produces the expected parameterized SQL and result.
- [x] `EXPLAIN` proves BTREE/GIN/GiST/trigram index use on representative data.
- [x] Stored labels render after source rename/deletion with no source request.
- [x] Current-user, role capability, college dimension, unrestricted role, and
  field-mask black-box cases pass under real PostgreSQL RLS.
- [x] Forged undeclared fields/operators/paths and resource-limit violations fail.
- [x] Concurrent revision conflict and atomic parent/child rollback pass.
- [x] Desktop and mobile Playwright screenshots show every editable/read-only
  component without overlap or blank states.
- [x] `pnpm verify:affected` passes in `tools/openxiangda-v2`.
- [x] Platform focused tests, task-owned lint, build, SQL migration verification,
  and the platform 2.0 release-candidate gate pass.
- [x] Task-owned platform sources lint with zero errors. The repository-wide
  `mwts check` baseline is audited and its 714 pre-existing errors are retained
  as a separate cleanup topic rather than mixed into this architecture change.
- [x] Test deployment succeeds; remote CRUD/query/RLS black-box suite passes.
- [x] Stable 1.x release regression shows no behavior or schema change.

### F. Standard Data API Field Acceptance Matrix

Every row below must be exercised through the published OpenXiangda 2.0
standard Data API. Direct repository/ORM writes do not count as acceptance.
For each semantic type, run create, get, list, update with
`expectedRevision`, aggregate when applicable, null/empty transition, delete,
audit, inaccessible-field rejection/masking, and stale-revision rejection.

| Semantic type | Create/read/update value cases | Required query cases | Status |
| --- | --- | --- | --- |
| `text.short` | ASCII, Chinese, max length, `null` | eq/neq/contains/startsWith/endsWith/in/isEmpty/isNotEmpty, sort, search | [x] |
| `text.long` | multiline, max length, `null` | eq/neq/contains/startsWith/endsWith/isEmpty/isNotEmpty, search | [x] |
| `text.rich` | sanitized markup, inline managed image, rejected unsafe markup | eq/neq/contains/isEmpty/isNotEmpty, stored sanitized read | [x] |
| `number.integer` | zero, positive, negative, safe bounds, `null` | eq/neq/gt/gte/lt/lte/between/in/isEmpty, sort, sum/avg/min/max | [x] |
| `number.decimal` | precision/scale edges, money, percent, `null` | eq/neq/gt/gte/lt/lte/between/in/isEmpty, sort, sum/avg/min/max | [x] |
| `boolean` | true, false, `null` when nullable | eq/neq/in/isEmpty, aggregate count | [x] |
| `date` | leap day, boundaries, `null` | eq/neq/gt/gte/lt/lte/between/in/isEmpty, sort, date bucket | [x] |
| `time` | minute and second precision, midnight, `null` | eq/neq/gt/gte/lt/lte/between/in/isEmpty, sort | [x] |
| `datetime` | timezone offsets, UTC boundary, `null` | eq/neq/gt/gte/lt/lte/between/in/isEmpty, sort, date bucket | [x] |
| `date-range` | closed start/end, overlap, `null` | overlaps/contains/containedBy/isEmpty | [x] |
| `datetime-range` | timezone range, overlap, `null` | overlaps/contains/containedBy/isEmpty | [x] |
| `option.single` | complete `{label,value}`, label change, `null` | eq/neq/in/isEmpty/isNotEmpty by value; declared label path | [x] |
| `option.multiple` | ordered snapshots, `[]`, label change | has/hasAny/hasAll/isEmpty/isNotEmpty | [x] |
| `cascade.single` | complete path and `null` | has/path value and declared label path | [x] |
| `cascade.multiple` | multiple paths and `[]` | hasAny/hasAll/isEmpty/isNotEmpty | [x] |
| `user.single` | rich user snapshot, renamed source, `null` | eq/neq/in/isEmpty/isNotEmpty by value | [x] |
| `user.multiple` | rich user snapshots and `[]` | has/hasAny/hasAll/isEmpty/isNotEmpty | [x] |
| `department.single` | rich department/path snapshot, `null` | eq/neq/in/isEmpty/isNotEmpty by value | [x] |
| `department.multiple` | rich department snapshots and `[]` | has/hasAny/hasAll/isEmpty/isNotEmpty | [x] |
| `resource-ref.single` | label/value/source/snapshot, deleted source, `null` | eq/neq/in/isEmpty/isNotEmpty; declared snapshot path | [x] |
| `resource-ref.multiple` | complete snapshots, deleted source, `[]` | has/hasAny/hasAll/isEmpty/isNotEmpty; snapshot path | [x] |
| `file` | upload/complete/bind/replace/remove | isEmpty/isNotEmpty, file read/preview/download authorization | [x] |
| `image` | upload/complete/dimensions/thumbnail/remove | isEmpty/isNotEmpty, image read/preview authorization | [x] |
| `signature` | managed PNG, signer/time/hash, clear | isEmpty/isNotEmpty, forged file rejection | [x] |
| `address` | administrative path/detail/full address, `null` | jsonContains and declared division/full-address paths | [x] |
| `location` | DingTalk/browser WGS84 coordinates, optional provider display snapshot, `null`; reject manual source, manual input and missing coordinates | jsonContains and declared coordinate/provider-snapshot paths | [x] |
| `json` | scalar/array/object bounds, `null` | jsonContains on declared paths | [x] |
| `serial-number` | server generation, uniqueness, immutable update | eq/neq/in/contains/startsWith, sort | [x] |
| `uuid` | valid UUID and `null` | eq/neq/in/isEmpty, sort | [x] |
| `subtable` | create/update/delete/reorder child rows atomically | child resource typed query and parent-scope RLS | [x] |

### G. Query Compiler Acceptance Matrix

- [x] Logical `and`, `or`, and `not` return the expected rows.
- [x] Maximum depth 5 passes; depth 6 fails before SQL execution.
- [x] 50 predicates pass; 51 fail before SQL execution.
- [x] 100 `in`/`hasAny` values pass; 101 fail.
- [x] Missing value is accepted only for `isEmpty`/`isNotEmpty`.
- [x] Unknown fields, unreadable fields, unknown operators, incompatible
  field/operator pairs, and undeclared JSON/snapshot paths fail closed.
- [x] Values remain parameters; quotes, wildcard characters, JSON strings, and
  SQL-looking input cannot alter generated SQL structure.
- [x] List, aggregate, export, dynamic source lookup, transaction guards, and
  record assertions produce equivalent predicates through the shared compiler.
- [x] Sort rejects multi-value fields and undeclared/unreadable fields.
- [x] Aggregate rejects incompatible dimensions/measures and keeps RLS active.

### H. Authorization And RLS Acceptance Matrix

- [x] Anonymous and invalid-session requests fail before Data API access.
- [x] Role capability allows/denies query/get/create/update/delete independently.
- [x] `user.single.value` current-user ownership works for every operation.
- [x] `user.multiple[*].value` current-user membership works for every operation.
- [x] College exact-scope role sees and mutates only its college rows.
- [x] College descendant-scope role sees configured descendant rows.
- [x] A different college receives no existence leak from get/list/aggregate/audit.
- [x] School administrator unrestricted role sees all rows.
- [x] Strict scope projection failure denies all protected operations.
- [x] Field read mask `omit` and `null` behave exactly as declared.
- [x] Field create/update permissions reject forbidden snapshots before SQL.
- [x] Query/select/order/aggregate over unreadable fields is rejected.
- [x] Dynamic source lookup applies source-resource row and field permissions.
- [x] Transaction operations and guards cannot bypass RLS.
- [x] Application-principal access obeys its explicit capability and row policy.

### I. Release And Evidence Gates

- [x] Contract/compiler unit and schema tests pass.
- [x] Platform SQL compiler unit tests assert SQL text and bound parameters.
- [x] PostgreSQL integration suite recreates a clean 2.0 test schema and passes.
- [x] Field Kit component tests cover desktop/mobile edit and read-only states.
- [x] Playwright exercises standard Data API UI workflows and captures evidence.
- [x] `pnpm verify:affected` passes in `tools/openxiangda-v2`.
- [x] Platform focused tests, task-owned lint, build, migration verification, and
  the platform 2.0 release-candidate gate pass.
- [x] Task-owned lint is clean and the repository-wide 714-error historical
  baseline is recorded as a separate cleanup topic.
- [x] Clean-worktree release mainline checks pass.
- [x] Preproduction deploy records exact root/submodule/package/image commits.
- [x] Remote preproduction standard Data API field/query/RLS suite passes.
- [x] Production remains untouched until a separate explicit release decision.

## 13. Progress Log

| Date | Change | Evidence |
| --- | --- | --- |
| 2026-08-23 | Draft architecture and implementation ledger created; implementation paused for product confirmation. | This document and 1.x default component registry inspection. |
| 2026-08-23 | Product confirmed semantic fields, snapshot storage, server-generated serials, transactional child tables, destructive 2.0 test-data reset, and full standard Data API acceptance. | User confirmation in the implementation task. |
| 2026-08-24 | Semantic contract vocabulary, field value schemas, modular declaration/query validation, shared transaction `where`, and legacy contract rejection completed. | `openxiangda-contracts` check and 31/31 tests pass. |
| 2026-08-24 | Compiler Surface/codec/query/physical plans, exact generated value types, dynamic source checks, and semantic authorization path closure completed in focused modules. | `openxiangda-devkit-core` check and 114/114 tests pass; all 30 semantic types and current-user/college hierarchy/unrestricted-role declarations are covered. |
| 2026-08-24 | File-level modularity gate added for platform prepare, value validation, query compilation, mutation coordination, RLS binding, Field Kit families, and black-box acceptance. | Section 2.1 is the required implementation dependency map; monolithic semantic branches are an acceptance failure. |
| 2026-08-24 | Platform semantic physical plans now install typed columns, defaults, sequences, constraints, expression/GIN/GiST/trigram indexes, and child-table foreign keys through one shared module used by prepare and Connected Dev. | Platform physical-plan, prepare, and overlay focused suites pass; old widening branches and duplicate SQL type maps are removed. |
| 2026-08-24 | A focused value validator and PostgreSQL codec now enforce all 30 semantic shapes, required/null/empty rules, snapshot/resource bounds, rich-text allowlist sanitization, location modes, managed PNG signatures, JSON complexity, numeric precision, and closed range transport. | Platform value-validator and database-codec suites pass 9/9; platform TypeScript build passes. |
| 2026-08-24 | Standard Native list/get/aggregate and query-empty guards now execute the shared bounded `where` compiler under `openxiangda_data_api` RLS; old PostgREST query strings, forwarded JWT, generic filters, and duplicate aggregate SQL were deleted. | Query compiler and standard Data API query suites prove bound SQL parameters, nested logic, unreadable-field rejection, empty-page totals, semantic decode, and RLS role setup; Native Data API focused suite passes 30/30. |
| 2026-08-24 | Location is narrowed to exact DingTalk/browser coordinates. Longitude and latitude are mandatory; manual address-only values are removed, while reverse-geocoded display text remains an optional snapshot. | User-confirmed contract; contract, validator, and Field Kit acceptance must reject `manual` and missing coordinates. |
| 2026-08-24 | Transaction `record-assert` value predicates now compile through the standard semantic `where` compiler inside the locked `SELECT`; only field-to-field comparisons remain in a restricted service comparator. Query operator identity is owned by the query-plan module, not duplicated by the Data API orchestrator. | Contract checks/tests pass 32/32; platform query, transaction, service, and controller focused suites pass 55/55. Tests prove snapshot paths, `isEmpty`, operator/type rejection, field-read rejection, bound SQL parameters, RLS role entry/reset, and atomic field comparison. |
| 2026-08-24 | Standard list limit is aligned to the contract maximum of 200. Aggregate capability is an explicit per-type query-plan matrix; single snapshots count distinct by stored `value`. Snapshot physical plans install both `value` filter and `label` sort BTREE expressions. System-field semantics are declared once in the field protocol module. | Devkit check and 115/115 tests pass; platform TypeScript and 59/59 query/aggregate/physical-plan/controller tests pass. SQL assertions prove snapshot distinct semantics and both snapshot indexes. |
| 2026-08-24 | Generated AI query capabilities declare canonical DataQuery/DataPage schema versions, and the platform AI execution boundary stamps `openxiangda.data-query/v2` before invoking the standard Data API. The last legacy AI `filters` fixture is removed. | Devkit check/tests pass 115/115; platform AI catalog and Data API focused suites pass 12/12 with exact call-shape assertions. |
| 2026-08-24 | Declaration-owned dynamic resource sources now query through one bounded endpoint. The server derives target resources, fields, filters, and snapshot projection from the active Head, applies target field permissions and PostgreSQL RLS, and returns complete stored reference snapshots. The generated selector sends only host context and binding values. | Contracts pass 32/32, Devkit passes 115/115, platform dynamic-source/Data API suites pass 37/37, platform build passes, and generated web check plus 11/11 tests pass. |
| 2026-08-24 | The standard location Field Kit now captures coordinates only through DingTalk or browser geolocation. Both paths persist mandatory WGS84 longitude/latitude, optional provider display snapshots, source, accuracy, and capture time; no address input exists. Desktop/mobile edit and stored read display share focused modules. | Contract location schema test passes; platform validator/database-codec suites pass 9/9 and reject `manual` or missing coordinates; generated web check and 15/15 tests pass. Full Data API/RLS/Playwright matrix remains open. |
| 2026-08-24 | The address Field Kit is kept separate from geolocation. It lazily reads platform administrative divisions, stores complete country/province/city/district/street label/value snapshots plus optional detailed address, renders saved labels without a source lookup, and filters by the deepest stable administrative code. Desktop Cascader and mobile level-by-level Drawer share a pure value adapter. | Generated web check passes at 28 files / 7738 LOC and all 32 tests pass, covering snapshot construction, municipality label deduplication, no address-only value, lazy route wiring, mobile controls, and canonical `jsonContains` path generation. Full Data API/RLS/Playwright matrix remains open. |
| 2026-08-24 | Standard rich-text and JSON fields now have focused Field Kit modules. Rich text uses the platform tag/attribute/link/managed-image allowlist for immediate browser sanitization and safe stored display; JSON submits only parsed structured values, formats read-only output, and emits canonical containment filters. | Generated web check passes at 31 files / 8014 LOC and all 36 tests pass. Managed inline-image upload plus full Data API/RLS/Playwright verification remain open. |
| 2026-08-24 | Handwritten business signature now uses a dedicated responsive canvas, produces only a managed PNG, stores SHA-256, signer snapshot, signing time, and points, and reads previews through the authorized Native file-content API. Read-only/serial widgets are excluded from all client writes, including super administrators. | Generated web check passes at 32 files / 8410 LOC and all 38 tests pass; platform validator already rejects non-PNG/invalid hashes and serial writes, while physical-plan tests prove sequence/default/unique-index generation. Real PostgreSQL/Data API/Playwright verification remains open. |
| 2026-08-24 | Field bounds now project through the public Surface contract and compiler instead of being re-inferred by controls. Text length, numeric precision/scale, file count/size/accept rules, serial settings, and subtable settings are preserved; desktop/mobile numeric controls allow negatives and apply integer/decimal/money/percent presentation correctly. Managed-file lists now carry the owning resource into authorized preview/download calls. | Contracts check/tests pass 32/32, Devkit check/tests pass 116/116, and generated web check passes at 32 files / 8454 LOC with 39/39 tests. |
| 2026-08-24 | Subtable architecture gate resolved before runtime edits: child rows remain ordinary child resources; `orderField` provides deterministic persisted ordering; the standard transaction protocol gains only bounded references to a prior operation's generated `id`. Client-generated parent IDs and general transaction expressions are rejected. | Section 6.1 records the problem evidence, owner, invariants, affected contracts, atomic failure/concurrency behavior, permission/RLS bounds, rollback boundary, and falsifiable verification. Implementation remains unchecked until focused contract, platform, Field Kit, PostgreSQL, and RLS tests pass. |
| 2026-08-24 | Subtable contracts, compiler closure, child physical/index plans, prior-create ID transaction references, atomic mutation planning, and responsive desktop/mobile child-row editors are implemented. Generic UUID controls remain read-only, while the transaction-owned child foreign key uses its declared create capability without exposing an input. The protocol maximum is 49 rows, the default is 20, and aggregate subtable capacity on one parent cannot exceed 49. | Contracts check/tests pass 34/34; Devkit check/tests pass 118/118; generated web check passes at 34 files / 9337 LOC with 41/41 tests; platform build and 8 focused suites pass 79/79. Unit and mocked integration coverage proves reference validation/resolution and rollback; real PostgreSQL, parent-scope RLS, and Playwright acceptance remain open. |
| 2026-08-24 | Native managed files now cover rich-text inline images and complete image metadata. Rich text accepts only exact authenticated Native image routes, binds parsed file IDs in the business-record transaction, and applies 10 MB / 20-image bounds. Image completion derives oriented dimensions once, writes one 480 px WebP thumbnail, returns canonical protected variant routes, and cleanup/deletion removes both objects. Desktop/mobile rich-text controls upload through the owning field, and file lists consume thumbnails while opening the authorized original. | Contracts check/tests pass 35/35; Devkit check/tests pass 119/119; generated web check passes at 34 files / 9453 LOC with 41/41 tests; 121 SQL migrations verify; platform build passes and focused image/rich-text/Data API/controller/storage/cleanup suites pass 75/75, followed by lifecycle regression tests at 39/39. Real PostgreSQL object storage, RLS, and Playwright acceptance remain open. |
| 2026-08-24 | Standard CSV export is now a first-class Native Data API operation. It accepts only the standard `select`/`where`/`order` contract, uses the shared semantic compiler and one repeatable-read RLS transaction, streams bounded batches, exports stored display snapshots, neutralizes spreadsheet formulas, and rolls back on disconnect or failure. Generated web clients no longer page list data or format CSV in-browser. Dynamic resource sources were re-audited and already use the same compiler, keyset order, target field permissions, and RLS session. | Contracts check/tests pass 36/36; generated web check passes at 34 files / 9474 LOC with 41/41 tests; platform build and export/query/compiler/controller suites pass 35/35. Tests cover SQL parameters, unreadable fields, role entry/reset, CSV snapshots and escaping, timeout setup, disconnect cleanup, and frontend endpoint wiring. Real PostgreSQL RLS and remote streamed-download acceptance remain open. |
| 2026-08-24 | Superseded on 2026-08-28: authored UUID fields were initially treated as generated immutable identifiers. | Real content-review acceptance proved this confused business references with resource identity; section 6.5 now makes only the system row `id` generated. |
| 2026-08-28 | Authored UUID fields are explicit business values. Omitted optional UUID fields remain `NULL`; current required creates require explicit input; only the resource system row `id` is generated. Authored business columns remain physically nullable. | Physical-plan, Data API, and real PostgreSQL regressions prove no random workflow reference is synthesized while row identity generation remains intact. |
| 2026-08-24 | The existing immutable pre-release reset sequence was accepted as the single destructive owner and documented in a field-protocol release runbook; no competing reset SQL was added. A new additive production migration installs `uuid-ossp` and `pg_trgm`, and the live verifier now checks both extensions while using only semantic field fixtures and the modular Data API dependencies. | Static verification passes for 122 production SQL migrations. The disposable PostgreSQL suite applies all 68 selected 2.0 migrations, verifies the historical expand window, Native projection/Head/AuthZ/RLS/OAuth lifecycles, reenacts the complete application/physical-table reset, restores trigger state, and passes an idempotent zero-pending rerun. The full 30-field Data API matrix remains open. |
| 2026-08-24 | The local PostgreSQL field matrix is closed through the standard Native Data API service boundary. One generated resource stores all 30 semantic types; create/get/list/update/null-or-empty/delete/audit and every declared per-type operator execute against real PostgreSQL. The same run proves query depth/predicate/value bounds, bound parameters, BTREE/snapshot/GIN/GiST/trigram plans, current-user single/multi ownership, exact/descendant college scope, field masks, dynamic-source permissions, stale revisions, managed file/image/signature/rich-text lifecycle, and atomic subtable create/update/reorder/delete/rollback. Location rejects `manual` and address-only values. | `npm run test:openxiangda-v2:migrations` applies 68/68 selected migrations, completes the field matrix, and passes a zero-pending idempotent rerun. `npm run test:openxiangda-v2` passes 96/96 suites and 658/658 tests; platform build and 122-migration static verification pass. Task-owned production source lints with 0 errors; the repository-wide lint gate remains open because unrelated historical workflow files still report baseline errors. |
| 2026-08-24 | The modular Field Kit and toolchain gates are locally closed. Field families remain in focused components/adapters; desktop and mobile exercise editable and read-only states with no failed administrative-division requests, blank canvas, overlap, or horizontal overflow. CLI generated-workspace black-box acceptance now uses semantic `text.short`, and template size accounting excludes generated contracts and install lockfiles while preserving source and bundle budgets. | `pnpm verify:affected` passes 25/25 tasks. Field Kit Playwright passes 2/2 and captures `field-protocol-desktop.png` and `field-protocol-mobile.png`; template check reports 74 authored source files / 425055 bytes, and the generated CLI black box passes `login -> create -> dev -> check -> deploy -> status -> logs -> rollback` without local infrastructure. Remote preproduction HTTP, supplier OSS/COS, release lineage, and stable 1.x regression remain open. |
| 2026-08-24 | The operation-complete RLS matrix now uses one coherent published role contract: the role revision, membership scope grant, request principal snapshot, and resource capabilities all explicitly include read/create/update/delete. Current-user single and multi snapshots, college exact/descendant scope, and inaccessible user/college rows are exercised without bypassing the published authorization revision. | `npm run test:openxiangda-v2:migrations` applies 68/68 selected migrations and passes its zero-pending rerun. Standard Native Data API query/get/aggregate/audit/create/update/delete and transaction-guard paths pass under real PostgreSQL RLS; inaccessible rows return non-enumerating not-found/empty/revision-conflict behavior, and rejected writes leave the row unchanged. |
| 2026-08-24 | The platform release-candidate gate is locally closed. Its authoritative-directory fixture now matches the real user schema, and the protected directory acceptance expects the confirmed rich member snapshot (`avatarUrl`, `mobile`, `email`, employee and department data) instead of an obsolete phone-redaction rule. | `npm run verify:openxiangda-v2:release` passes Native cutover inspection, 122-migration static verification, the disposable 68-migration PostgreSQL suite, selector/Scope PostgreSQL black box, Native cutover PostgreSQL black box, 96/96 suites with 658/658 tests, and platform build. Task-owned changed JS/TS files lint with 0 errors. Repository-wide historical workflow lint remains a separately tracked baseline. |
| 2026-08-24 | Stable OpenXiangda 1.x regression remains isolated from the new 2.0 semantic protocol and Native storage reset. No 1.x workspace, package, SDD contract, or gitlink was modified. | `npm run test:release` in `tools/openxiangda` passes 43/43 release-profile cases in 461 seconds, including backend/app release, resource planning/publishing, permissions, environment policy/swap, SDD, SDK, runtime deployment, worktree and mainline guards. Evidence: `.openxiangda/evidence/tests/f8d8a07b585a3a660fa548f7820a688264315322/release.json`. |
| 2026-08-24 | Location contract reconfirmed as coordinate capture only: DingTalk or browser Geolocation must produce WGS84 longitude and latitude. No manual address, manual source, or map-picked value is accepted. Provider-returned address/POI remains optional read-only snapshot metadata and is never an input path. | Contract schema, Field Kit, platform validator, and PostgreSQL Data API matrix already enforce this boundary; stale high-fidelity and 1.x-to-2.0 migration wording was corrected to match. |
| 2026-08-24 | Standard resource UI acceptance now uses the production generated resource page and a declaration-injected instance of the same Refine Data Provider. A loopback-only bridge routes browser requests into the Native Data API service while one disposable PostgreSQL instance enforces typed storage and RLS; the harness neither mocks `/service/**` nor writes through ORM/repositories. | `scripts/verify-openxiangda-v2-field-ui-live.sh` passes 68/68 migrations plus zero-pending rerun and Playwright 3/3. Browser evidence covers create/list/keyword-query/get/update/audit/delete, `{label,value}` single/multiple snapshots, browser WGS84 coordinates, restricted-row filtering, and no-read page denial. Screenshots: `templates/application/apps/web/test-results/data-api-live-detail.png` and `data-api-live-rls.png`; the temporary container and listeners are closed. |
| 2026-08-24 | The final local gate rerun reconfirmed the coordinate-only location contract and the complete component/Data API matrix. Repository-wide lint was audited instead of auto-fixed across unrelated legacy modules. | `pnpm verify:affected` passes 25/25 tasks; platform 96/96 suites and 658/658 tests, build, 122-migration verification, release-candidate gate, ordinary Playwright 4/4 with 6 environment skips, and live PostgreSQL Playwright 3/3 all pass. Task-owned lint has zero errors. Full `mwts check` reports 714 historical errors outside this architecture topic. |
| 2026-08-24 | The publishable Field Kit candidate passed its fresh-workspace and independent-reference acceptance before any npm write. Template size ownership is now explicit: the generated workspace has 83/84 total files, the template has 78/80 authored source files and 438278/500000 bytes, and the Web Field Kit has 35/36 modules and 9515/10000 LOC. The compiler-derived blank-template contracts were refreshed and prove that location accepts only `browser` or `dingTalk` with mandatory longitude/latitude. | Candidate application check/test/build passes with 41/41 Web tests, 1/1 server test, Playwright 4/4 and 6 environment skips, plus deterministic package/tamper checks. The independent reference application passes 7/7 Web tests, 2/2 server tests, build, and Playwright 2/2 from an isolated registry and frozen lock. Platform commit `1c90900d470f3d9856d61ea075209228054fba73`, toolchain candidate commit `3e376866065f7ef2c2a3cdf01884eebc9e56b744`, and reference lock commit `4d868e42bf3b5414dd20fd8f3e88f7408346a1f0` are on their remote `master` branches. Formal npm publication, root gitlink/image lineage, and remote preproduction acceptance remain open. |
| 2026-08-24 | The `reference-environment` rollout path was separated into its real runtime boundaries. The first generic app update selected legacy direct Compose, restarted nginx against stale blue-slot hostnames, and failed its 180-second readiness window; this did not count as a K3s update. The direct Compose entry was recovered with its declared service upstreams, then all field-protocol backend releases used the single-Deployment K3s release path. After K3s verification, the duplicate Compose application services were stopped so only one platform runtime remains. | Recovery snapshot: `/opt/projects/sy-lowcode-main/.deploy-rollbacks/20260824-103459-7e5129bfacec43b5-20260824T024245Z-5EfW9n`. Compose `127.0.0.1:8888/service/readyz` and public `https://platform.example.com/service/readyz` returned `status: ok` after recovery. Each K3s plan proved exact parent lineage and immutable digest before mutation; both completed with 1/1 backend readiness, 7/7 running Pods, and zero restarts. Final Docker state retains only healthy PostgreSQL, Redis, MinIO, and RabbitMQ dependencies; public and Pod-local K3s readiness remain `status: ok`. |
| 2026-08-24 | Declared JSON query paths were closed as a focused, typed planner instead of adding generic JSON traversal. Built-in option/directory/address/location leaves have fixed semantic types, and resource-reference snapshot leaves derive their types from the already-loaded target resource declaration without another state owner or database lookup. | Platform commit `4238a8b4c12f2ee2e974e11bcd68a651b28bdb9a` and root commit `91966fcaa714e7b833141bf109c4fc4a27c78058` are on remote `master`. Release `20260824-103459-7e5129bfacec43b5` passed 122 migration checks, the disposable 68-migration PostgreSQL gate, 97/97 suites with 666/666 tests, production build, exact-digest K3s rollout, and 7/7 zero-restart readiness on `reference-environment`. |
| 2026-08-24 | Remote acceptance exposed that a safe dotted semantic-path error code was being rewrapped as an unknown 500. The Native Data controller now preserves bounded OpenXiangda error codes containing declared dotted paths while retaining the unknown-error redaction boundary. | Platform commit `568d5cd73724d43f70f95c676de5f395e57aeafb` and root commit `3b217e1d81aa` are on remote `master`. The formal 2.0 release gate passes 97/97 suites and 667/667 tests, 122 migration verification, the 68-migration PostgreSQL/idempotency suite, selector and cutover black boxes, and platform build. Immutable release `20260824-105749-f4db1931c8c4d0b3` deployed `platform-server@sha256:dfc5c37c452d973767fdee8f5888684353d37b7d7c1cd361ebaa32581a22f253`; K3s receipt: `/opt/backups/sy-lowcode-platform/backend-releases/20260824-105749-f4db1931c8c4d0b3-20260824T030101Z`. |
| 2026-08-24 | The complete remote standard Data API and authorization matrix is closed on `reference-environment`. Dynamic resource source paging remains declaration-owned (`source.pageSize` plus cursor), image fixtures use strictly decodable PNG bytes, invisible mutations retain non-enumerating revision conflicts, policy-denied writes fail before SQL, and invisible audit reads return a strictly empty page. No acceptance application production environment was created or promoted. | Acceptance commit `d79ddcf` is on remote `master`. After the duplicate Compose application services were stopped, `pnpm test:remote` passed all 13 stages again in 48.538 seconds: authentication, the 30-type catalog, CRUD and every declared operator, typed snapshot/address/location paths, aggregate/export, dynamic source, managed file/image/signature/rich-text lifecycle, subtable transaction rollback, role memberships, descendant Scope, capability/field/row authorization, RLS non-enumeration, cleanup, audit, and delete. Evidence: `/home/developer/project/xiangda/openxiangda-v2-field-acceptance/.openxiangda/remote-field-protocol-evidence.json` with `status: passed`, `productionTouched: false`, and `manualAddressSupported: false`. |
| 2026-08-24 | The final reverse audit found and removed stale developer-facing wording that still described physical `string`/`uuid` references, ID-only storage, unimplemented association fields, signature data URLs, and a rich-text companion upload field. Public field docs, the generated template README, the 1.x functional mapping, earlier component decisions, and the CLI Changeset now point to the one semantic snapshot protocol. | Repository search finds no remaining ID-only, data-URL signature, or rejected-association guidance in the field documentation set. Full `pnpm verify` passes 27/27 tasks, including 38 contracts, 43 Nest, 123 Devkit, 41 generated Web tests, all checks/builds, and the CLI `login -> create -> dev -> check -> deploy -> status -> logs -> rollback` black box. The authoritative 30-type runtime and current `reference-environment` backend remain unchanged. |
