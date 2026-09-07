# Declaration-driven browser acceptance v2

## Problem evidence

A generated business workspace copied an end-to-end assertion for an empty
application. As soon as the application declared a real resource, the test
failed while looking for `还没有声明数据资源`. The test therefore described the
template fixture rather than the generated application.

## Capability owner

The application template owns browser acceptance. The Native compiler remains
the single owner of resource names, fields, surfaces and capabilities; tests
must consume its generated contract instead of maintaining a second fixture.

## Stable invariants

- One browser suite works for zero, one or many declared resources.
- Resource routes, labels, filters and mobile controls come from
  `@app/contracts`; no business resource name is embedded in the suite.
- The suite never writes remote data. Native and directory reads are mocked at
  the browser boundary with contract-shaped responses.
- Authorization is verified twice: a super administrator sees the declared
  surface and a principal without the read capability sees the platform 403
  state.
- When a declaration contains directory, resource-reference or file fields,
  the mobile test must prove the platform-specific picker or upload surface is
  rendered.

## Affected contracts

No runtime API changes. The generated workspace testing contract now consumes
`appCode`, `capabilities`, `resourceCodes` and `resourceDefinitions` from the
compiler output. A workspace may extend the suite, but must not replace these
declaration-driven baseline assertions with copied business fixtures.

## Failure and concurrency behavior

Each test receives an isolated browser page and deterministic mocked Native
responses. A missing declared control, stale route, unauthorized render leak,
or failed CSV download fails the workspace before deployment. Tests do not
share mutable browser or data state.

## Security and resource bounds

The suite performs no login, upload or remote mutation. Query pages are empty,
directory results are bounded to zero items, and export is bounded to the
generated CSV for the empty page. This keeps the gate fast and prevents test
records from entering a tenant.

## Rollback boundary

The change is isolated to the application template and can be reverted as one
CLI release. Existing deployed applications and platform APIs are unaffected.

## Falsifiable verification

1. A clean generated workspace passes and renders the empty-resource state.
2. Visitor, meeting and course workspaces pass the same suite without editing
   business names into it.
3. A resource with more than two filters exposes the collapsed-filter action.
4. CSV export raises a browser download with a `.csv` name.
5. Declared mobile directory, resource-reference and file fields render their
   platform controls.
6. Removing the read capability renders the resource permission-denied state.

## Blast radius

Only newly generated or explicitly refreshed 2.0 workspaces receive the new
suite. OpenXiangda 1.x and production application runtimes are not involved.

