# Resolve Locked Engines From Their Physical Package Root

## Evidence And Owner

The published 2.0.0 launcher from a separate npm install fails with
WORKSPACE_ENGINE_DEPENDENCY_MISSING in a real pnpm application. Running the
project's own command works. createRequire receives the logical
node_modules/openxiangda symlink path, so Node searches outside pnpm's
physical package dependency directory. Resolving that package path first
locates its installed openxiangda-cli/run correctly.

The root distribution alone owns engine selection. Package managers own
installed package placement; the launcher must respect their symlinks.

## Decision And Invariants

Canonicalize packageRoot once at packageEngine entry, then inspect the
manifest, executable and engine dependencies relative to that physical root.
Preserve nearest-workspace selection, declared-version and generation checks,
V1 argument forwarding, and all authentication paths. Do not search global
dependencies or substitute another installed engine.

The change affects local dependency discovery for both generations; V1
execution still uses its selected package and working directory. There are
no platform, tenant, runtime, authorization or data changes. Missing or
malformed engines fail before business execution. Package installation must
finish before commands run; this adds no lock or parallel writer.

## Release, Bounds And Verification

Publish a reviewed patch Changeset for openxiangda and openxiangda-cli. The
CLI bundles template package manifests that must reference the patched root,
so both packages belong to this release unit. Preserve immutable 2.0.0
bytes and dependent package versions chosen by Changesets. Rollback is a
project-local version pin, with the known old discovery limitation.
Use a pnpm-style symlink fixture whose CLI exists only beside the physical
package, and real published-package installation acceptance. Validate V1
updates, mixed markers, subdirectories, and login/Skill isolation. Run
verify:affected and the official release gate before publication.
