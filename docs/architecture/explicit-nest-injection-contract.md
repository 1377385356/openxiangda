# Explicit Nest Dependency Injection Contract

## Problem evidence

OpenXiangda connected development runs application TypeScript through `tsx` for
fast reloads, while release images run JavaScript emitted by `tsc`. `tsx` does
not emit TypeScript `design:paramtypes` metadata. A custom controller using an
implicit constructor parameter therefore compiled successfully and worked in a
release build, but received `undefined` in connected development.

The reproduced failure was a visitor reservation controller whose
`OpenXiangdaStandardOperations` constructor dependency was implicit. The signed
gateway request reached the controller and then failed before the Data API call.

## Capability owner

`openxiangda-nest` owns all official Nest providers. `openxiangda-devkit-core`
owns workspace validation for application-defined Nest controllers and
providers. Application code owns only the explicit choice of which provider
token it consumes.

## Stable invariants

1. OpenXiangda 2.0 Nest dependency injection never depends on emitted type
   metadata.
2. Every constructor parameter of an application `@Controller`, `@Injectable`,
   `@Catch`, `@Module`, or `@WebSocketGateway` class has an explicit injection
   decorator.
3. The same source behaves identically under connected-development `tsx` and
   release `tsc` execution.
4. `openxiangda check`, `openxiangda dev`, and therefore deployment fail before
   runtime when this contract is violated.
5. There is no compatibility mode for implicit injection in 2.0.

## Affected contracts

- `OpenXiangdaStandardOperations` explicitly injects
  `OpenXiangdaDataApiService`.
- Application business controllers use Nest `@Inject(Token)` on constructor
  parameters.
- Workspace diagnostics expose
  `OPENXIANGDA_NEST_EXPLICIT_INJECTION_REQUIRED` with a source location.
- The OpenXiangda 2.0 backend skill teaches the same source form.

## Failure and concurrency behavior

Validation is a deterministic, local source scan and performs no network or
state mutation. All violations are reported together. It runs before connected
development starts a session, so a failed validation cannot leave a live local
gateway or application process.

## Security and resource bounds

The validator reads only TypeScript source files below `apps/server/src` and
does not evaluate them. File traversal is bounded by that workspace directory.
Explicit tokens remove compiler-dependent provider ambiguity and do not expand
application capabilities.

## Rollback boundary

The SDK provider annotations and workspace validator are one release unit. A
rollback returns both together; partial rollback is unsupported because it
would restore environment-dependent behavior.

## Falsifiable verification

- A decorated controller with an implicit constructor dependency produces the
  stable diagnostic and cannot start connected development.
- The same controller with `@Inject(OpenXiangdaStandardOperations)` passes.
- The SDK request-scoped `OpenXiangdaStandardOperations` resolves from a real
  Nest application context under the `tsx` test runner.
- A real signed visitor reservation succeeds through connected development and
  through a freshly deployed image built from the same source.
