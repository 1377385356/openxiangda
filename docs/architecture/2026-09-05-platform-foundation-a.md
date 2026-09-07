# Platform foundation A: models, views and usable CRUD

Status: implementation authorized by the user on 2026-09-05.

## Evidence and capability owner

The resource authoring contract currently combines storage fields, list/form
presentation, generated routes and automatic write grants. MobileSurfaceFieldControl
contains raw inputs and reuses desktop interaction components. Disabled Nest still
requires backend configuration. These are platform/toolchain concerns, not fixes
to be copied into a customer application.

The approved platform blueprint supersedes the older customer-specific golden
module and implicit table-to-page defaults. No committee, school or instrument
domain belongs in the platform definition.

## Decisions for this implementation round

1. Introduce composable application modules with data models and independently
   selected standard CRUD views. A model creates no routes or menu entries by
   itself. Standard CRUD remains a short explicit selection; form/list/detail
   field selections may override its defaults. Custom task pages can use several
   models through the existing platform clients and component composition.
2. Compile these authoring blocks into the existing authoritative DataResource
   and Surface execution contracts. Do not add an alternate data service or
   parallel runtime store. Existing low-level resource declarations remain
   supported inputs to that same compiler, not a second compiler.
3. Give internal field visibility explicit presentation semantics. It must not
   change Data API authorization. Form/detail field selections are exhaustive,
   not merely a sort preference that silently appends unselected fields.
4. Reading a resource never implicitly grants writes. Provide explicit read and
   manage capability presets; migrate intentional management fixtures to the
   manage preset. Server-side field/row/action authorization remains unchanged.
5. Application authors can omit unused backend/platform boilerplate. The
   normalized runtime configuration retains its required transport fields.
   Pure CRUD generation and development must not require starting Nest.
6. Mobile input uses platform mobile components based on Ant Design Mobile.
   Desktop and mobile share field value codecs but own their interaction layers.
   Application checks prohibit raw business inputs and desktop form imports in
   mobile entry modules; component-library internals may use semantic DOM.
   The public mobile adapter uses per-component imports and scopes the pinned
   library's base CSS during package build. Popup defaults preserve the calling
   surface ancestry. No mobile library HTML/body reset enters the app.

## Stable invariants and affected contracts

Identity and authorization stay platform-owned. A missing UI is not a data-access
decision. Storage fields and values do not depend on screen size. System values
remain server-owned. Mutations keep current revision/transaction guarantees.

Affected: devkit authoring/compiler and exports, generated resource metadata,
Surface validation in the platform, React form/list/detail renderers, template
and creation defaults, documentation, package changesets and focused tests.

Multiple named form/page routes per resource, full relational FK migrations,
workflow kernel changes, reporting materialization and the final delivery UX
are later blueprint batches; do not claim those implemented through this batch.

## Failure, concurrency and resource bounds

Invalid model/view references and incompatible controls fail with source pointers
during compilation. Do not hide unknown write fields or weaken server checks to
make a form submit. Preserve field values on failed submissions. Existing revision
checks, managed-file ownership and bounded queries remain in force. Creating an
internal field is a presentation choice, not a way to bypass field authorization.

## Rollback and blast radius

Changes are confined to 2.0 authoring and its standard Surface consumers. No 1.x
code, table, route or migration is changed. Additive optional presentation
metadata requires matching platform support before package promotion. Existing
alpha applications must regenerate explicit write grants if they depended on
read-to-write expansion. There is no production deployment in this round until
the candidate passes the required delivery checks. No data migration is implied
by splitting authoring files or changing presentation.

## Falsifiable verification

- Compile a model without CRUD: storage/type metadata exists, pages and navigation
  do not. Add CRUD and confirm the same storage schema with explicit pages.
- Compile custom form/list/detail selections; internal fields are absent from
  generated UI while remaining available to authorized platform data access.
- A read-only role has no write grants; a manage preset has exactly the intended
  grants; hidden fields do not silently become denied data fields.
- Build a minimal application with omitted backend declaration and no Nest
  process. Validate generated output through the platform contract validator.
- Exercise PC and mobile field entry, submit and readback, including empty
  values, false, zero, dates and options. Record whether a check uses a fixture,
  real database or deployed authenticated environment.
- Run affected repository checks and packaged consumer verification. Browser
  or deployment checks that were not run remain explicitly unverified.

## Execution record

- 2026-09-05: clean toolchain/server checkouts fast-forwarded to their fetched
  master commits; stale, empty, unowned Git index locks removed after process
  and age checks. Root advanced without overwriting submodule working files.
- Implemented module/model/view authoring, exhaustive field selection, explicit
  role presets and optional backend defaults. Existing native contracts remain
  the only execution path; platform Surface validation accepts the new metadata.
- `pnpm verify:affected`: 28/28 tasks passed, including 197 devkit tests, 140
  runtime/SDK component tests, builds/type checks and the CLI black-box
  login/create/dev/check/deploy/status/logs/rollback exercise with a test server.
- Platform server: 4 focused Jest suites, 82/82 tests passed, including exact
  bytes compiled from a new toolchain module/model configuration supplied through
  `OPENXIANGDA_NATIVE_ARTIFACT_FIXTURE`. `pnpm build` passed. The changed source
  passes ESLint and changed tests pass Prettier. Repository-wide `mwts check`
  still reports existing errors in other modules/scripts; no full lint pass is
  claimed and no unrelated lint rules were disabled.
- `pnpm --filter @app/web exec playwright test e2e/field-protocol.spec.ts`:
  5/5 passed. PC/mobile input, selection cancel/confirm, invalid integer, cleared
  values, canonical save/reload, managed-image rerender and scoped popup
  behavior are exercised in a real browser against fixtures.
- `pnpm distribution:smoke:from-build`: 7 candidate tarballs installed in a
  fresh independent application; check/test/build and browser acceptance passed
  (33 passed, 6 skipped). The skipped cases are 3 live Data API/PostgreSQL tests
  without their bridge and 3 blank-template-inapplicable route/resource cases.
  Deterministic native package and tamper checks also passed.
- This is source/package-consumer verification, not registry publication,
  deployment or authenticated remote business acceptance. Exact paired source
  commits are pinned by the orchestration repository's gitlinks.

## Browser finding within this round

Saving a form rerenders unchanged rich-text details. A freshly allocated
`dangerouslySetInnerHTML` object replaced hydrated managed-image blob URLs with
placeholders while the hydration effect had unchanged dependencies. Memoizing
that markup by its stored value preserves image DOM on parent rerenders. The
existing desktop browser assertion now exercises this save-triggered rerender.

Ant Design Mobile's root entry imports global HTML/body/link styles even when
only an input is requested. The platform now exports per-component imports under
`openxiangda/mobile`, ships scoped upstream base CSS and preserves popup ancestry.
Its browser test checks the surrounding page's original fonts/colors while operating popups. The subsequent
[default component UI decision](./2026-09-05-default-component-ui.md) removes
visual preferences and the remaining desktop global resets.
