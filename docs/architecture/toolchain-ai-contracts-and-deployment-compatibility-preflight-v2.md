# ADR: Toolchain AI Contracts and Deployment Compatibility Preflight

Status: Accepted for implementation (2026-08-27)

## 1. Problem evidence

- The current `master` contains the Web build verifier fixes `b25184b` and
  `24947b7`. The latest published `openxiangda` tag is still on their parent
  `977e83b`, so both fixes are unpublished release input. Their existing
  `scalable-lazy-web-builds.md` and `wider-initial-web-budget.md` Changesets
  correctly name the public package that exports the verifier:
  `openxiangda/testing` is shipped by the `openxiangda` package. They must stay
  unmaterialized until the normal reviewed release train consumes them; a
  duplicate bump must not be invented.
- The installed historical `openxiangda-v2`, backend, frontend and
  workflow/events Skills can link outside their installed directory and still
  mention non-existent `openxiangda app info` / `openxiangda app provision`
  commands, active RoleSession selection, retired physical packages and 1.x
  examples. The repository now distributes one `openxiangda-v2` Skill with
  nested references, but its validator checks commands and links only in the
  root `SKILL.md`; nested references can still drift.
- `DEVKIT_COMMANDS` is the executable CLI registry and the Oclif command-file
  gate already derives from it. `docs/reference/cli.md` is generated from the
  registry, while the Skill has no generated command reference. Human copies
  therefore remain a second command list.
- `deploy` fetches platform capabilities before `check`, Buildx and upload, but
  it checks only capability codes. The capabilities contract does not advertise
  the AppPackage/config/contract parser combination accepted by the platform.
  A toolchain can therefore pass local checks and fail later in
  `preparing-configuration` with `NATIVE_PROPERTY_UNKNOWN`, after an image may
  already have been built and pushed and artifacts uploaded.
- App operation request/response schemas are untyped JSON objects. The public
  field protocol already exists in `FIELD_VALUE_SCHEMAS`, but there is no
  public helper that projects a declared resource into an operation schema or
  safely attaches reusable local `$defs`/`$ref` definitions. AI clients repeat
  labeled-value, directory, resource-reference and managed-file shapes by hand.

## 2. Capability owners

| Capability | Authoritative owner |
| --- | --- |
| Executable command set and command metadata | `openxiangda-devkit-core` `DEVKIT_COMMANDS` |
| One installable Skill and nested reference validation | `openxiangda-skill-kit` |
| Application declaration, resource-to-schema projection and App Operation composition | `openxiangda-devkit-core`, exposed through `openxiangda/config` |
| Wire schema identifiers and platform capabilities shape | `openxiangda-contracts` |
| Parser combinations accepted by a deployed platform | platform `/openxiangda-api/v2/capabilities` |
| Deployment ordering and the zero-write preflight | `OpenXiangdaApplicationServices.deploy` |
| Identity, role memberships, effective capability union and Perspective enforcement | platform AuthZ/Data API; application code is only a consumer |

No application, Skill, CLI flag or MCP tool may become a second source for
platform parser support, identity or authorization.

## 3. Stable invariants and contract decisions

1. The only application identity model is the current authenticated user plus
   the union of all effective application roles. Perspective is an optional
   read-only projection over that union. There is no active RoleSession or
   application-owned identity switch.
2. The only installable AI entry is `openxiangda-v2`. Backend, frontend and
   workflow/events remain nested references. All local links and CLI examples
   in every nested Markdown file are validated as installed assets.
3. The only command inventory is `DEVKIT_COMMANDS`. A generated
   `references/cli.md` and the generated docs CLI reference use one shared
   renderer. `app info` and `app provision` are not commands and are forbidden
   in active Skill/template command surfaces.
4. A deployable application contract is one atomic tuple:

   - AppPackage `schemaVersion`;
   - configuration bundle `schemaVersion`;
   - contract bundle `schemaVersion`;
   - compiler contract version.

   `PlatformCapabilities.configurationCompatibility.supportedApplicationContracts`
   advertises the one bounded list of complete tuples together with the target
   validator endpoint, request/result schemas and capability version.
   Independent version arrays or a duplicate deployment list are forbidden
   because they could claim a cross-product or drift from the parser the
   platform actually runs.
5. AppPackage records its exact application-contract tuple. The CLI compiles
   the current config/contract bundle in memory, requires an exact tuple match,
   and submits those digest-bound bytes to the advertised target-platform
   compatibility endpoint. `check` does this before application checks, tests
   or production builds; deploy repeats it before Buildx, artifact upload and
   DeploymentRun creation. Deployment preparation still runs the same Native
   compiler authoritatively before state can be activated.
6. Platform capability payload structure is validated before fields are used.
   Feature descriptors may carry bounded owner-specific metadata, but the
   envelope, deployment contract, backend-image target and accepted contract
   tuples have explicit shapes.
7. `resourceRecordSchema(resource, options)` projects the canonical public field
   value schemas from one `AppDataResourceDeclaration`; it does not introduce a
   second field declaration. `schemaRef`, `composeJsonSchema` and
   `composeAppOperationSchemas` only compose standard JSON Schema `$defs` and
   local references. They do not resolve remote schemas, execute code or change
   runtime authorization.
8. Public helper changes are exported from the same-version `openxiangda/config`
   facade and have compile/runtime export tests. AI guidance uses these exports,
   not physical `openxiangda-*` package imports.

## 4. Failure, concurrency and retry behavior

- Missing or malformed `configurationCompatibility` fails with a stable
  compatibility/capabilities diagnostic and an upgrade-platform remediation.
  Every compatibility failure reports a bounded pointer, client contract and
  schema versions, platform version and validator capability, plus the required
  tuple and bounded supported tuples. Unknown properties and collection limits
  preserve the Native compiler code and pointer before any build or upload.
- Structural schema failure reports bounded JSON paths; it does not echo the
  full capability payload, config, contract, source or artifact bytes.
- Preflight is a pure, deterministic comparison over one capabilities snapshot
  and compiler output. It creates no idempotency key, artifact, image, package,
  DeploymentRun or retry loop. Concurrent deploy attempts independently reach
  the same result; existing platform DeploymentRun/CAS behavior remains the
  only deployment concurrency owner.
- A platform upgrade or toolchain change requires the user to rerun the same
  `pnpm openxiangda deploy`. The CLI does not negotiate down, delete unknown
  properties, rewrite the package or choose another parser tuple.
- Schema composition rejects invalid/duplicate definition names and unknown
  resource fields locally. It never silently drops a requested field.

## 5. Security and resource bounds

- Accepted application-contract tuples are bounded to eight; feature and
  diagnostic traversal is bounded. Only schema/version identifiers and safe
  JSON paths appear in errors.
- Schema libraries are bounded to 64 definitions and 200 selected resource
  fields. Definition names use a stable identifier grammar; `$ref` is local to
  `#/$defs/` and cannot contain a URL or path traversal.
- Helpers clone canonical field schemas before adding declaration-specific
  constraints, so callers cannot mutate package-level protocol constants.
- No token, Secret, Docker credential, repository URL, application data,
  identity value or environment Head is persisted by this topic.

## 6. Blast radius, rollback and release boundary

- Changes are limited to `tools/openxiangda-v2` contracts, Devkit, root facade,
  Skill kit, generated references, template agent contract, tests, docs and
  reviewed Changesets. No Workflow/Notification implementation, 1.x code,
  platform database, tenant data, OCI registry, npm registry or environment is
  changed.
- The platform must add the exact capabilities tuple before a new toolchain
  package can deploy. Until both sides are present, the expected behavior is an
  early compatibility failure with zero build/upload side effects.
- Rollback is the prior toolchain commit/package train plus the prior platform
  image. Existing published npm bytes and successful AppVersions are immutable.
  No compatibility adapter or package rewrite is retained after rollback.
- The pending verifier Changesets remain separate historical release inputs.
  This topic adds Changesets only for packages it actually changes; version
  selection and dependency bumps remain the deterministic release job's work.

## 7. Falsifiable verification

1. Git history proves `b25184b` and `24947b7` are descendants of the latest
   published `openxiangda` tag and both reviewed Changesets target
   `openxiangda`.
2. The generated docs and Skill command references byte-match one renderer over
   `DEVKIT_COMMANDS`; every registry entry has an executable command file and no
   generated surface contains `app info` or `app provision`.
3. Skill validation recursively checks every Markdown reference, command and
   forbidden legacy marker. A missing backend/frontend/workflow-events link or
   unknown command fails before package build/pack.
4. Capabilities with a missing/malformed contract list, invalid envelope or no
   exact tuple fail before workspace build, Buildx, upload and DeploymentRun.
   Instrumented tests assert all four side-effect counters remain zero.
5. A matching tuple reaches the existing check/build/seal/submit path without
   weakening required-capability, immutable digest or artifact checks.
6. AppPackage and both structured artifacts carry the same tuple/schema facts;
   tampering any one produces a stable local failure before upload.
7. Resource-schema tests cover required/optional fields, canonical
   user/department/resource/file values, selection, unknown fields, local
   `$defs`/`$ref`, immutability and duplicate/invalid definitions.
8. `openxiangda/config` runtime and type tests prove all helpers are public;
   Skill examples compile using only the root facade.
9. `templates/application/AGENTS.md` remains byte-identical to the Skill
   workspace reference and states current-user role union/Perspective semantics.
10. Package tests, `pnpm verify:affected`, template generated checks, Skill
    checks, generated docs, packed-distribution checks and Changeset status pass
    without publishing or deploying.
