---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda": minor
"openxiangda-cli": patch
"openxiangda-skill-kit": patch
---

Separate application data models from selected standard CRUD views through
composable business modules. Models may remain without pages; list/form/detail
field selections are exhaustive and ordered. Add explicit presentation visibility
without changing Data API field or row authorization.

Remove implicit read-to-write role expansion. Existing alpha management roles
must use the explicit manage or operation-list preset before regeneration.
New optional hidden and list.fieldOrder Surface metadata requires the matching
platform server version pinned by the orchestration repository.

Omit unused backend boilerplate and start connected development without Nest for
ordinary CRUD. Add platform mobile text, number, boolean, option and date adapters,
application source checks for raw/desktop-mobile input misuse, and business intent,
permission matrix and browser acceptance guidance in generated workspaces.

Expose scoped Ant Design Mobile controls through openxiangda/mobile. Component
imports omit the library's global reset; base styles and default popup rendering
stay within mobile surfaces. Preserve managed rich-text images across form-save
rerenders, verified in browser acceptance.
