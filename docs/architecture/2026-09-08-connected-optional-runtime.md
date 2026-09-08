# Connected development owns the optional local runtime

Status: implemented; official publication and real application retest pending.

## Evidence

The isolated meeting application activated test run
971d63bb-c77d-437f-8b8d-0381c0b3b3cd using official 2.7.0. The subsequent official
dev command failed on missing root dev:server. Adding that application script
revealed OPENXIANGDA_RUNTIME_DESCRIPTOR_INCOMPLETE from the actual Nest module.
The initializer owns only the configured backend directory; it never adds a root
script. Connected development nevertheless always starts dev:server, even for a
frontend-only workspace. It also omits the required OPENXIANGDA_APP_VERSION.
Existing process tests replace Nest with an HTTP stub and missed both contracts.

## Owner and invariants

The developer toolchain owns local child processes and proxy lifecycle. App
configuration owns whether a backend is required and its directory. The platform
owns the selected active environment, AppVersion and short-lived Dev Session.
Nest keeps its complete descriptor validation; application code supplies no
runtime identity or credentials. No local platform, Docker or database is added.

Connected development starts the root dev:web entry and, only when required,
the configured backend package's dev entry. It does not rewrite authored root
scripts. A frontend-only session exposes no local Nest URL/port and rejects local
application API routes explicitly. Its platform Data API proxy remains available.

An enabled Nest process receives the version and identity of the platform-returned
active Head, including its hydrated AppVersion. Missing or inconsistent descriptor
data fails before starting children; placeholder deployment/version identities are
removed. The created Dev Session target must match the selected snapshot, or the
tool revokes it and asks for a fresh dev invocation. Backend opt-in against an
existing frontend-only Head is supported before any backend image deployment.
The local process uses `connected-development:<Dev Session id>` as its runtime
revision label, even when the active Head has a published backend. This label is
not an image or deployed artifact identity. The Nest connected gateway already
authorizes exclusively through the platform Dev Session and developer bearer;
its production backend revision checks remain separate and unchanged.

## Failure, concurrency and limits

The existing loopback-only proxy, session refresh/revocation, bounded readiness,
port allocation and process-group cleanup remain authoritative. Backend paths must
stay within the workspace and must not traverse a symbolic link. Session targets
are checked again on refresh; a moved Head cannot silently change a running local
process's identity. Tokens never enter child argv/environment or returned session
metadata. Invalid/moved grants are revoked through the same cleanup boundary.

## Contracts, impact and rollback

The public dev command keeps its flags and explicit production warning. Internal
process options gain the optional backend path; returned app URL/port are nullable
for frontend-only sessions. No server API, production runtime, schema or V1
behavior changes. Revert the toolchain release independently; existing deployed
applications and their immutable artifacts are unaffected.

## Falsifiable verification

Run configured non-default backend paths without root dev:server, and launch a
real packaged Nest forApplication module through the connection descriptor. Verify
readiness/version readback, frontend-only startup and API denial, exact session
target mismatch/refresh cleanup, missing descriptor rejection, and SIGTERM/no
orphan/no token leakage. Existing CLI lifecycle and fresh-package gates must pass.
Finally repeat official dev in the real meeting application after publication.
