# OpenXiangda 2.0 AI protocol discoverability

## Problem evidence

A fresh application built by a low-capability model compiled a valid AI Catalog,
but the model reported that MCP could not read it. The protocol already existed
behind the single pinned `openxiangda --mcp-stdio` process entry and was covered
by package tests; the application Skill and generated `AGENTS.md` did not expose
that entry or the catalog identity check. A correct capability that agents cannot
discover through their public contract is not an accepted platform capability.

The same black-box run also proved an important boundary: application authors
must not respond by writing another MCP server or another AI capability registry.

## Capability owner and stable invariants

- `openxiangda.config.ts` remains the only application declaration source.
- Devkit compilation remains the only owner of the application contract and AI
  Catalog, including both digests.
- `openxiangda-mcp` remains a library with no executable and no state store.
- The workspace-pinned `openxiangda` binary remains the only process entry. Its
  pre-command `--mcp-stdio` mode is a transport, not a ninth public CLI command.
- Platform AI Query/Preview/Confirm remains the only execution and authorization
  boundary. The local development MCP cannot bypass it or invent an AI identity.

## Public contract

Every generated workspace and installed OpenXiangda 2.0 Skill must state:

1. start MCP with the workspace-pinned binary using
   `pnpm exec openxiangda --mcp-stdio --cwd <workspace>`;
2. read `openxiangda://workspace/contracts` or call `contract_describe`;
3. verify that the returned `aiCatalog` and `aiCatalogDigest` are the same values
   produced by the normal compiler/check path;
4. never create an application-owned MCP server, catalog file, preview store or
   authorization path.

This is protocol discovery guidance, not a compatibility alias. No older command,
package or application shape is recognized.

## Failure and concurrency behavior

- Invalid MCP arguments fail before Oclif starts.
- stdout is reserved for MCP protocol frames; diagnostics use stderr.
- Each MCP process reads one explicit workspace root. Concurrent applications
  use independent processes and do not share mutable local protocol state.
- A missing or invalid workspace fails closed through the same Devkit diagnostics
  used by the CLI.

## Security and resource bounds

The transport exposes only the registered application-development resources and
tools. It exposes no arbitrary shell, Kubernetes coordinates, registry secrets or
database client. Write tools retain their explicit authorization annotations and
server-owned deployment state. No long-lived background process is created by
application generation.

## Blast radius and rollback boundary

The change affects only the 2.0 Skill distribution, generated workspace agent
contract and CLI documentation. It does not change runtime wire contracts, the
platform, 1.x applications or existing deployments. Rollback is one package
version and does not require data migration.

## Falsifiable verification

1. Template and Skill contracts contain the exact pinned MCP entry and same-
   catalog verification rule.
2. The template agent contract remains byte-identical to the Skill workspace
   contract.
3. A fresh packaged application launches the MCP through its pinned CLI.
4. An MCP client lists resources/tools and reads
   `openxiangda://workspace/contracts` containing the compiled `aiCatalog` and
   matching `aiCatalogDigest`.
5. `openxiangda-mcp` still publishes no `bin`, and the CLI still publishes
   exactly eight Oclif commands.
