# User Surface Authoring Compatibility V2

## Evidence and owner

`openxiangda@2.0.0-alpha.72` removed the public
`adminApplicationTodoCenterPage` export while applications created with the
previous public release still import it. Their configuration fails during the
esbuild load step before the compiler can generate the current route contract.
OpenXiangda owns this authoring compatibility boundary; applications must not
delete their Todo capability merely to consume a platform upgrade.

## Stable invariants

- Todo Center remains a compiler-owned authenticated user Surface at `/todos`
  and `/m/todos`.
- The admin navigation contract contains only admin resource and operation
  pages. A compatibility input must never put Todo Center back under the admin
  shell, sidebar, breadcrumb, or tab lifecycle.
- The generated configuration and route manifest are canonical. Legacy helper
  syntax is not persisted into ConfigBundle, ContractBundle, AppPackage, or the
  platform database.
- Explicit application routes, capabilities, identity, authorization, and
  business data ownership are unchanged.

## Contract and failure behavior

The public config entrypoint re-exports the deprecated
`adminApplicationTodoCenterPage` helper. `defineOpenXiangdaApp` recognizes its
authoring-only marker before validation, enables
`frontend.user.applicationTodoCenter`, removes the marker from admin navigation,
and drops a group only when the marker was its sole item. All other declaration
validation remains fail-closed. The adapter is deterministic and introduces no
runtime state, concurrency, network, security, or resource-bound change.

## Rollback boundary

The adapter is independently reversible in the toolchain package and requires
no platform migration. It may be removed only after the supported application
floor no longer contains the deprecated helper. Removing it earlier recreates a
package-load failure and is therefore a breaking release.

## Falsifiable verification

- Source exports expose the helper.
- A declaration using only the legacy helper for Todo enablement compiles to
  `frontend.user.applicationTodoCenter=true`.
- Its generated admin navigation omits Todo Center while the route manifest
  contains exactly `/todos` and `/m/todos`.
- A packed `openxiangda` consumer imports and invokes the helper successfully.
- The full release gate and independent reference application still pass.
