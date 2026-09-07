# Create JSON output isolation v2

Status: Accepted

- Problem evidence: the published `openxiangda-cli@2.0.0-alpha.57` runs the
  mandatory `pnpm install` for `openxiangda create <directory>` with inherited
  stdio. In `--json` mode pnpm progress and lifecycle output therefore precede
  the final CLI envelope on stdout and may also write stderr, so one successful
  command is not one machine-readable JSON document.
- Capability owner: `openxiangda-cli` owns workspace creation and the install
  subprocess. Oclif remains the only owner of the final
  `openxiangda.cli-result/v2` envelope. The package manager remains the owner of
  dependency installation; installation is not skipped or simulated.
- Stable invariants: `create --json` writes exactly one JSON document to stdout
  and writes no stderr on success. Pnpm still runs. Its successful stdout and
  stderr are captured and discarded. Human mode continues to inherit the
  terminal and preserves the existing progress experience. No global console
  or process stream monkeypatch is permitted.
- Contract and failure behavior: the CLI passes an explicit install-output mode
  into its creator for both new and reused workspaces. A captured install
  failure becomes a retryable `WORKSPACE_INSTALL_FAILED` result envelope;
  captured child output is never copied into the envelope or terminal. The
  partially created workspace remains rerunnable through
  `openxiangda create <directory>`.
- Security and resource bounds: captured output is bounded by the synchronous
  child-process buffer and discarded immediately. Token values, registry
  credentials, authorization headers and raw package-manager diagnostics must
  not appear in either machine stream or the structured error. This change does
  not alter login, platform identity, package resolution or registry ownership.
- Concurrency and rollback: every create invocation owns its subprocess and
  output policy; there is no shared mutable output state. Rollback is the CLI
  commit only and restores inherited stdio without changing created application
  data or platform state.
- Falsifiable verification: real executable fake-pnpm fixtures emit noise on
  stdout and stderr for success and emit credential-shaped noise before a
  nonzero exit for failure. Source creator, built CLI and packed CLI tests prove
  installation ran, stdout parses as exactly one envelope, successful stderr is
  empty, failure is `WORKSPACE_INSTALL_FAILED`, and no secret-shaped fixture
  text is present. Human-mode tests prove inherited output remains visible.

Known adjacent gap: successful create currently recommends `openxiangda dev`
even when the newly provisioned application has no active test Head and first
needs `openxiangda deploy`. That remediation ordering needs its own platform
state/UX decision and is not changed by this output-isolation slice.
