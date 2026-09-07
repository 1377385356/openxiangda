# Versioned Platform Capability Closure v3

Status: accepted for the OpenXiangda 2.0 alpha reset.

## Decision record

| Concern | Decision |
| --- | --- |
| Problem evidence | AppPackage v2 represented platform requirements as `string[]`; the config and package compiler both allowed callers to append strings, while deploy checked mostly for name presence and accepted preview features. A package therefore could not prove which feature contract it used or which declaration produced the requirement. |
| Capability owner | The application compiler owns derivation and usage digests. Platform capabilities own supported feature contract versions and limits. Platform deployment preparation owns authoritative recomputation from sealed config/contract bytes. Applications own neither list. |
| Stable invariant | One normalized application declaration produces one sorted structured capability closure. A required feature is usable only when the advertised status is `available` and its `contractVersion` exactly matches. |
| Contract reset | Toolchain contract `2.0.0-alpha.5`, AppPackage `openxiangda.app-package/v3`, PlatformCapabilities `openxiangda.platform-capabilities/v3`, compiler contract `native-3`. Application source still starts with `schemaVersion: 3`. |
| Failure behavior | Unknown, missing, preview, planned or version-mismatched features fail before build, artifact upload or DeploymentRun creation. Old AppPackage/config shapes fail validation rather than being rewritten. |
| Concurrency | The closure is pure compiler output and is part of the immutable AppPackage digest. It has no mutable state and introduces no write race. Platform deployment revalidates the exact sealed bytes selected by the run. |
| Security and bounds | At most 64 structured entries. Each usage digest is a prefixed SHA-256 over a capability-specific normalized declaration fragment. Runtime rows and secret values are never inputs. Platform feature metadata is closed and may contain only bounded numeric limits. |
| Rollback boundary | Roll back the complete toolchain/platform contract train. Do not dual-read v2/v3 AppPackages and do not add an alias for the removed fields. Disposable 2.0 alpha environments are rebuilt; 1.x is outside the blast radius. |

## Wire contracts

```ts
interface RequiredPlatformCapabilityContract {
  code: PlatformCapabilityCode;
  contractVersion: string;
  usageDigest: `sha256:${string}`;
}

interface PlatformFeatureCapabilityContract {
  contractVersion: string;
  status: "available" | "preview" | "planned";
  limits?: Record<string, number>;
}
```

`AppPackage.compatibility.requiredPlatformCapabilities` is sorted by code and
contains no duplicate code. The supported code/version catalog is a contracts
export shared by the compiler and platform implementation. Changing a feature
wire contract requires changing that catalog entry and updating both owners in
one release train.

`usageDigest` is not a platform support version and is never compared with a
feature advertisement. It binds the requirement to the normalized application
declaration used to derive it. Platform preparation recomputes the closure and
compares it with the package before persisting an AppVersion.

## Deleted alpha shapes

- `AppPackage.compatibility.requiredCapabilities: string[]`.
- `openxiangda.config.ts` `platform.requiredCapabilities`.
- `CompileAppPackageInput.requiredCapabilities` and all caller-supplied append paths.
- Platform feature `version`, arbitrary feature metadata and `capable` status.
- Preview-as-sufficient deployment checks and the special one-off golden CRUD status branch.
- AppPackage v2, PlatformCapabilities v2 and compiler contract `native-2` as accepted application compiler tuples.

There is no compatibility alias, warning period, down-conversion or fallback.
The gateway assertion value named `native-2` is a separate transport contract
and is not changed by this compiler tuple reset.

## Derivation and confidentiality

Baseline runtime, deployment and environment requirements use only their
bounded compiler declarations. Data requirements digest normalized resource
declarations. AuthZ requirements digest perspectives and authorization
declarations. Directory usage includes directory-backed fields, grants and
`operation.platformAccess.directory`; managed-file and Notification Hub usage
come only from the matching operation platform-access declaration. Active
Workflow declarations require the kernel and fresh-command-token contracts.
An operation with Workflow platform access, or a Workflow whose launch mode is
`standalone` or `hidden-handoff`, additionally requires the durable business
process contract and digests the matching operations, definitions, activations
and subject projection. Backend secret values never exist in application
config; secret descriptors are also excluded from the runtime/deployment usage
slices.

The package compiler consumes the same normalized `ConfigurationBundleV3`
bytes that the platform later loads from content-addressed sealed artifacts.
It never derives a usage digest from raw authoring-only properties. This keeps
toolchain and platform recomputation byte-identical and makes a manifest claim
insufficient evidence by itself.

Canonical JSON sorts object keys and preserves declaration array order where it
is semantically observable. The emitted closure itself uses a code-point sort,
so locale cannot change AppPackage bytes.

## Required platform implementation

The platform server release paired with this toolchain must:

1. advertise only PlatformCapabilities v3 with closed feature objects;
2. advertise every implemented feature using the catalog's exact
   `contractVersion` and truthful status;
3. accept only the new application contract tuple in
   `supportedApplicationContracts`;
4. parse only AppPackage v3 and reject `requiredCapabilities`;
5. recompute the structured closure from sealed config/contract artifacts and
   reject missing, extra, duplicate, unsorted, version-mismatched or
   usage-digest-mismatched entries;
6. perform those checks before AppVersion, configuration revision,
   DeploymentRun or environment writes.

## Falsifiable verification

- Repeated compilation of the same declaration produces byte-identical
  capability entries and AppPackage digest.
- Changing an events declaration changes only relevant event/core usage
  digests and does not introduce an application-authored code.
- An application containing `platform.requiredCapabilities` fails config
  validation.
- An AppPackage containing the removed string field fails contract validation.
- Missing, preview, planned and wrong-version platform features fail with
  `OPENXIANGDA_REQUIRED_CAPABILITY_UNAVAILABLE` before uploads.
- Exact available features permit the unchanged sealed-artifact integrity path.
- Contracts schema tests, compiler tests, deploy tests, CLI black-box tests and
  packed fresh-application verification all pass on the same tuple.
