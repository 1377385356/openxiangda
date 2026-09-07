# Optional backend workspace and SDK completion

## Evidence and owner

Batch D requires ordinary applications to contain no application backend until
server execution is needed. The compiler already disables that runtime for a
plain model/page application, but `templates/application/apps/server` still
installs Nest and participates in recursive checks and builds. There is no
supported path to initialize this source later. Existing request identity, Data
API transactions, workflow commands, Notification Hub and event receipt
services remain authoritative; they are not being replaced.

The runnable extension also exposed a configuration loader gap: public model
and role helpers were exported by the SDK but absent from the loader's virtual
module. The loader must reuse those canonical helpers so composed application
declarations work through the same check/dev path.
The existing template file/byte budget is a toolchain template gate; it must
not cap an application's authored source after the application adds a backend.
It therefore runs from the toolchain boundary check against its source template.

The devkit owns optional backend source initialization as part of its existing
generation lifecycle. The application declaration remains the only runtime
switch. The Nest SDK owns a small current-user todo facade and structured
action/request diagnostics that reuse platform endpoints and Nest logging.

## Invariants and affected contracts

- The default application template contains only Web and shared contracts.
- Explicit backend execution declarations initialize the canonical Nest source
  on the next `check` or `dev`. Standard platform workflow definitions and
  bindings do not require application Nest. Application operations/providers
  and event consumers do.
- Initialization never rewrites existing application backend code. It stages a
  complete directory, atomically renames it, and records only a local dependency
  installation receipt. That receipt is not identity, authorization, or data.
- The generated dependency uses the application's exact installed toolchain
  capsule; there is no independently chosen SDK version. Nest peers are
  optional for consumers that never import the Nest entrypoint.
- Current user and role union, Data API atomic/idempotent transactions,
  workflow command tokens, Notification Hub receipts and platform-owned event
  delivery retain their existing owners. External effects use stable provider
  idempotency keys and durable platform events rather than an application DB.
- Diagnostic metadata contains action/request/trace identifiers, endpoint and
  error code, never credentials or request bodies.

## Failure, concurrency, and bounds

Source generation is independently retryable and does not activate a remote
runtime. A failed dependency installation keeps its pending local receipt and
reports a repairable error; the next check/dev retries without replacing source.
The installer uses one bounded package-manager invocation. Concurrent
initializers cannot overwrite an existing directory. Paths must stay within the
application workspace and cannot traverse symlinks. Existing partially authored
backends are left to the ordinary application checks.

Platform mutations retain their existing idempotency, expected revision and
authorization checks. The SDK does not retry business effects blindly. Todo
reads and interactions use the verified current caller and existing platform
endpoint; logs cannot grant capability or alter the caller.

## Rollback and blast radius

This change affects new 2.0 scaffolds and applications that explicitly opt into
backend execution. Existing authored backends and stable 1.x are untouched.
Revert the toolchain change to remove automatic initialization; already generated
application source remains ordinary user-owned Nest code and may be retained.
No package publication, platform deployment or database migration is performed.

## Falsifiable verification

1. A newly created ordinary application has no backend source or Nest dependency
   importers and completes its generate/check/test/build path.
2. After declaring a backend, the same app gains canonical source and exact
   dependencies; repeated initialization and installation recovery preserve edits.
3. Path escape/symlink/initialization races fail before overwriting user files.
4. Connected development and packaged delivery cover both no-backend and
   opt-in backend paths; the existing image/provenance checks still run.
5. SDK tests prove current-user todo propagation, idempotent platform transaction
   use, request/error correlation, and absence of credentials in diagnostic fields.
6. Registry publication, deployed real identities and real remote business
   effects remain the later unified release acceptance boundary.
# Packed verification ownership follow-up

The unified seven-package smoke reproduced an old verification assumption: the
creator launcher imports `openxiangda/nest` before any application declares a
backend. Optional framework peers are correctly absent there, so the assertion
fails with `ERR_MODULE_NOT_FOUND: @nestjs/common`.

Keep the default no-Nest contract. The launcher continues testing CLI/config
and closed public subpaths; run the supported Nest SDK export assertion in the
same fresh application's initialized `apps/server`, after its declared peers
are installed. Include Todo and Logger exports in that real package import.
No runtime contract or dependency is added; only the verification consumer
changes to the owner of the capability it exercises. Full packed application
and browser smoke must pass before this source unit is handed off.
