# Default component UI

Status: user explicitly requested removal on 2026-09-05.

## Evidence, owner and decision

The platform appearance preference, global document writes, algorithm/seed
configuration and custom CSS-variable namespace have caused user-page styling
errors. The user rejected further isolation machinery and requested complete
removal of this feature. This decision supersedes previous visual configuration
contracts and the proposed surface-specific appearance implementation.

The React runtime will use Ant Design's default component appearance. Its UI
provider supplies Chinese locale and contextual feedback only. Remove appearance
APIs, storage, media listeners, menu controls, custom palette variables and mobile
color-scheme options. The mobile adapter retains scoped upstream default CSS,
without the optional dark block or application palette remapping. Application
and skill templates, public exports, documentation and tests must agree.

## Stable invariants and affected contracts

The router, identity, permissions, field values, data concurrency and workflow
state remain unchanged. Platform CSS is limited to its components; the template
owns a minimal document reset. Components may consume the component library's
native default CSS variables; no platform color registry or configuration remains.
This alpha API deletion has no compatibility aliases or preference migration.

## Failure, resource bounds and rollback

Startup does not read or write visual preferences or depend on system appearance.
No replacement preference store, per-route provider or portal lifecycle is added.
Old browser preference values are inert; reading them just to migrate them would
retain unnecessary code. Default Ant Design popups manage their own styles.

The change is limited to 2.0 runtime/toolchain outputs and documentation. No server,
1.x, database or production environment changes are needed. Rollback is the prior
package and application bundle. Registry publication/deployment remain separate
release steps. Remaining batch B page and field work is not part of this unit.

## Falsifiable verification

- Public exports and shipped source contain no platform appearance API or state.
- A browser with an old preference and dark system setting still renders the
  same default components. User-menu controls and document theme writes are gone.
- Importing the full stylesheet does not change a surrounding element's font,
  background or box sizing. Dropdowns, dialogs, PC/mobile forms and saved values
  remain usable with the default styles.
- Run the affected checks, browser fixtures and fresh packed-app acceptance.
  Record source, package-consumer and remote deployment evidence separately.

## Execution evidence

- Removed the appearance module and exports, user-menu controls, persisted/media
  state, global document writes, platform variable aliases, mobile color mode,
  template palette and the four obsolete design/test decision documents. Updated
  both workspace and frontend generation references, including a stale reference
  which still recommended an earlier deleted color API.
- `pnpm verify:affected`: 16/16 tasks passed. Runtime/SDK tests: 138/138 passed;
  the affected template test accepts its application-owned `document.css`.
- The browser checks default components with a saved old preference and changing
  system settings, then navigates to a user page and operates Select/Modal while
  preserving input, surrounding-document styles and the identity request count.
  Signature acceptance waits for its modal's close transition before measuring
  the document, so temporary library scroll locking is not mistaken for overflow.
- `pnpm distribution:smoke:from-build`: all 7 freshly built candidate tarballs
  installed in an independent application; check/test/build and browser acceptance
  passed (33 passed, 6 skipped). Three skipped tests need a live Data API/PostgreSQL
  bridge; three do not apply to the blank template. Deterministic package and
  tamper-rejection checks passed.
- Skill distribution validation and documentation build passed. Ant Design lint
  reports no issues in the changed runtime JSX and resource fixture. A broader
  scan reports 19 existing deprecated-property warnings in other components;
  those unrelated component migrations are not included in this removal.
- No registry publication, remote deployment or authenticated business-data
  acceptance was performed. The orchestration repository pins the source commit.
