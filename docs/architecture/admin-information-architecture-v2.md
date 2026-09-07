# OpenXiangda 2.0 Admin Information Architecture

Status: accepted for implementation, 2026-08-28

## Problem evidence and outcome

The current browser Shell treats discovery as information architecture: it enumerates every generated Data Resource into “数据管理”, every configured Workflow into “审批中心”, and uses authorization only after those entries have been invented. `OpenXiangdaApplication` also registers list/new/detail/edit routes for every resource regardless of whether the resource has a writable field or whether Native CRUD owns its mutations. This produces visible internal resources, empty create/edit pages, and Workflow launch links whose business revision depends on transient browser handoff state.

The measurable outcome is that a new internal resource, hidden operation route, detail/edit route, or non-standalone Workflow can exist and remain directly addressable where appropriate without becoming a menu item. Only pages named by the application’s compiled admin navigation declaration may enter the Shell menu, and permission evaluation may only remove those declared entries.

## Capability owners and stable invariants

- The application owns one editable admin information-architecture declaration in `openxiangda.config.ts`: business groups, user-facing labels, ordering, semantic icons, and references to page identities.
- The compiler owns the immutable page registry, reference closure, default labels derived from authoritative resource/route/Workflow metadata, stable diagnostics, and generated TypeScript contracts.
- The `openxiangda/react` runtime owns route implementations, direct-URL gates, the standard Shell, and rendering the compiled navigation after current-user authorization filtering.
- Native Identity/AuthZ remains the only permission owner. Capabilities filter an application-declared menu; they never create a page or menu entry.
- Data Resource remains the single declaration for fields, CRUD capabilities, mutation ownership, and generated resource surfaces. There is no second resource Surface, route table, or permission store.
- Workflow Kernel remains the owner of Workflow definitions and execution. The application declares launch/navigation intent beside each versioned Workflow definition; the generated browser definition carries the localized title and launch mode.
- Page existence, route reachability, and menu visibility are separate facts. List/detail/create/update routes and Workflow handoff routes may be hidden; hidden routes never become menu entries by discovery.

## Public contract

Application source uses typed helpers rather than raw route JSON:

```ts
frontend: {
  root: 'apps/web',
  routes: [/* operation-page implementation metadata */],
  admin: {
    navigation: defineAdminNavigation([
      adminNavigationGroup('members', '会员管理', [
        adminResourcePage('member-profiles'),
        adminOperationPage('member-import'),
      ], { icon: 'members' }),
      adminNavigationGroup('approval', '审批中心', [
        adminWorkflowWorkCenterPage(),
        adminWorkflowLaunchPage('assistance-approval'),
      ], { icon: 'workflow' }),
    ]),
  },
},
data: {
  resources: [{
    code: 'submissions',
    name: '申报记录',
    mutationOwner: 'action',
    generated: { list: true, detail: true, create: false, update: false, delete: false },
    fields: [/* one authoritative field declaration */],
  }],
},
workflows: {
  definitions: [{
    version: 1,
    definition: assistanceApproval,
    launch: { mode: 'hidden-handoff' },
  }],
},
```

The compiler emits `adminPages`, `adminNavigation`, `resourceDefinitions`, and localized `workflowDefinitions`. A page identity is one of resource list/detail/create/update, application operation route, Workflow work center, or Workflow launch. Only list pages, static operation pages, the work center, and self-contained `standalone` Workflow launch pages are navigation-eligible. Parameterized detail/edit/task/instance and `hidden-handoff` pages stay hidden.

Compiler tooling exposes `suggestAdminNavigation(config)` and
`renderAdminNavigationSuggestion(config)` as one deterministic authoring
proposal based on compiled resource, route and Workflow metadata. The existing
workspace contract authority exposes that same typed proposal at
`contract_describe.data.adminNavigationAuthoring`: an AI copies its expression
once into `frontend.admin.navigation`, using the listed `openxiangda/config`
imports, and then edits the application-owned declaration. Compilation and
runtime never invoke the suggestion function. Therefore later resources change
the page registry but cannot silently alter a saved production menu.

`mutationOwner` is one of `native`, `action`, `readonly`, or `workflow`. `native` defaults list/detail/create/update/delete on; non-Native owners default list/detail on and Native create/update/delete off. An application may narrow any generated surface but may not enable a Native mutation for a non-Native owner.

Workflow launch mode is one of `standalone`, `custom-page`, `hidden-handoff`, or `work-center-only`. Only `standalone` owns a self-contained standard submission page eligible for navigation; `hidden-handoff` exposes the same paired routes without a menu item. Standard launch identity, subject and localized title are compiler-owned. The default submission uses the platform Durable Business Process Command; an explicit `named-operation` submission calls the sealed original App Operation and resumes only when it returns a command. `custom-page` launches only through its verified Named Action and cannot be inserted as a standard Workflow launch page.

## Failure, concurrency, security, and resource bounds

- Compilation fails with stable `APP_CONFIG_ADMIN_*`, `APP_CONFIG_DATA_RESOURCE_*`, or `APP_CONFIG_WORKFLOW_*` diagnostics and an exact source pointer for an unknown page reference, duplicate page/group, empty/orphan group, unsupported icon/order, missing user label, internal code used as a label, non-static operation menu route, non-standalone Workflow menu entry, Native mutation owned by another capability, or create/update with zero writable business fields. System, compiler-generated/serial, and operation-denied fields cannot satisfy that writable-field gate or enter generated mutation inputs.
- Generated navigation and page registry are immutable build artifacts, bounded to 100 groups, 500 items/pages, and deterministic source/order tie-breaking. No runtime discovery or network response can add menu entries, so concurrent permission/identity refreshes only filter the same immutable declaration.
- Direct URLs repeat the same capability closure used by generated pages and operation routes. UI hiding is not authorization; Data API, App API, and Workflow still authorize every request server-side.
- Labels/icons are presentation metadata only. Paths remain compiler-owned and cannot contain domains, credentials, state payloads, or environment-specific URLs. Workflow submission accepts persistent query parameters only and never treats temporary browser state as an authority or business revision.

## 2.0 replacement and rollback boundary

This is a direct replacement of an incorrect pre-release 2.0 contract. There are no aliases for `surface.generated: boolean`, no implicit “enumerate all resources” fallback, no 1.x import, and no appCode or tenant special case. Existing 2.0 applications regenerate contracts and explicitly declare their navigation.

The implementation is independently reversible at the `tools/openxiangda-v2` commit boundary before package publication. No database migration, platform deployment, package publication, production data write, or root gitlink update is part of this change. Rollback after a future package release means redeploying the previous immutable application/toolchain version; compiled applications do not mutate navigation at runtime.

## Falsifiable acceptance

1. Compiler tests show a representative multi-resource application produces deterministic `adminPages` and exactly the declared grouped navigation; adding an undeclared internal resource changes the page registry but not navigation.
2. Negative compiler tests assert diagnostic code and pointer for every invalid state above, including action-owned Native mutations, zero writable create/update, unknown/duplicate/orphan page references, internal-code labels, and non-standalone Workflow menu references.
3. Runtime tests prove Shell menu entries come only from `adminNavigation`, authorization removes but never adds entries, and hidden detail/new/edit/handoff routes do not enter the menu.
4. CRUD tests prove generated routes/buttons and direct mode rendering respect list/detail/create/update/delete surfaces and mutation ownership on desktop and mobile.
5. Workflow tests prove localized titles come from generated definitions, only `standalone` can be navigated, and the standard submission context has no `location.state` channel.
6. Public exports, `contract_describe`, generated template contracts, workspace `AGENTS.md`, documentation, and the packaged OpenXiangda 2.0 Skill describe the same single declaration and typed copy-once proposal path.
7. `pnpm verify:affected` passes, including the fixed 43-resource compatibility corpus, public Native JSON Schema validation, generated template check, and unchanged Web dist budget when those affected gates run.
