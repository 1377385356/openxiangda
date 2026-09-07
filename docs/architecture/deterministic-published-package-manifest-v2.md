# Deterministic published package manifest v2

## Decision

- Problem evidence: repeated `pnpm pack` calls for `openxiangda-cli` emitted different tarball integrities because workspace dependencies were rewritten into `package.json` in nondeterministic insertion order. The reference frozen lock correctly rejected the second artifact.
- Capability owner: each publishable package manifest owns its registry dependency versions; the release receipt owns the exact immutable tarball bytes. The reference lock consumes only those frozen bytes.
- Stable invariants: identical source and package version produce identical tarball bytes; local workspace linking stays explicit; no release gate regenerates a same-version artifact with a different integrity.
- Affected contracts: publishable packages declare canonical exact internal dependency versions; pnpm links those exact matching versions to local workspace packages during development. No runtime API changes.
- Failure and concurrency: release validation packs the CLI repeatedly and fails before registry writes if SHA-512 differs. Parallel release publishers remain forbidden by the existing receipt state machine.
- Security and resource bounds: no credentials or registry responses enter package manifests; package count, file budget and one-bin/eight-command boundaries remain unchanged.
- Rollback boundary: remove the canonical publish manifest override and its deterministic-pack regression. Any receipt created after removal must be rebuilt from scratch.
- Falsifiable verification: eight consecutive CLI packs have one SHA-512; unpacked manifests are byte-identical and contain exact non-workspace OpenXiangda dependency versions; distribution, reference and release gates pass.
