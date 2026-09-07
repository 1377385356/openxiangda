# Docker build context isolation

Status: Accepted (2026-08-21)

## Evidence

The first public-package test deployment failed before any DeploymentRun was
created. A no-cache Buildx run proved that the install layer created the
`openxiangda-nest@2.0.0-alpha.31` workspace symlink, but the later
`COPY apps/server apps/server` step replaced it with the host workspace's stale
`alpha.29` symlink. That target did not exist inside the image, so TypeScript
failed with `TS2307`.

The root-only `node_modules` entry in the application `.dockerignore` did not
exclude nested workspace dependency trees from the Docker context.

## Decision and owner

The generated application repository owns its Docker build context. Its
`.dockerignore` must exclude every generated tree recursively, including nested
workspace `node_modules`, `dist`, coverage, test reports and OpenXiangda state.
The official Nest Dockerfile remains the sole backend image recipe; the CLI
does not add a second cleanup or dependency store.

## Invariants and contracts

- Source files and package manifests remain available to the Docker context.
- No `**/node_modules`, generated output, report or local OpenXiangda state may
  enter the context at any workspace depth.
- The dependency symlinks used by the build must come only from the frozen
  install executed inside the image.
- The public CLI template and the independent reference application use the
  same recursive ignore contract.
- Build or push failure still creates no DeploymentRun and cannot replace the
  current healthy version.

## Failure, security and resource bounds

The change only removes local generated files from the context. It reduces
context size and prevents local caches, reports and state from being copied or
uploaded. It introduces no concurrency, credential or persistent-state change.

## Rollback

Revert this commit and the CLI patch release. A rollback cannot make an already
published broken template safe, so no compatibility alias is provided.

## Falsifiable verification

1. A template test requires recursive ignore patterns for every generated tree.
2. Generate/install a fresh app, deliberately leave nested workspace
   `node_modules`, and run the official Dockerfile with no cache.
3. The build must resolve the published Nest package, compile, produce the
   runtime image and push an immutable digest.
4. Run `openxiangda deploy` against test and verify a new ready DeploymentRun;
   production is out of scope.
