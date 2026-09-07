# Compact Generated Resource Definitions v2

## Evidence

The generated TypeScript emitted each normalized resource Surface twice: once
in `resourceSurfaces` and again as an inline literal under
`resourceDefinitions[code].surface`. A sixteen-resource application was already
within a few kilobytes of the unchanged 2,650,000-byte Web dist gate; adding
three standard resources failed the gate even though application code had not
duplicated platform components.

## Owner and invariants

The Native compiler is the sole owner of generated runtime definitions.
`resourceSurfaces` owns the one serialized Surface for every resource.
`resourceDefinitions[code].surface` must reference that object and preserve the
existing public property and inferred TypeScript shape. Application budgets,
runtime loaders and application source remain unchanged.

## Failure, bounds and rollback

Generation remains deterministic for empty and populated resource catalogs.
Resource codes are JSON-escaped before becoming object keys and lookups. A
nineteen-resource compiler fixture proves that every Surface label occurs only
in the canonical map and every definition points to it. Rollback is one
compiler commit and package release; it does not require platform data changes.

## Verification

The compiler suite must pass, packed output must build, and a real
nineteen-resource application must pass the existing Web dist byte gate. The
gate must not be increased to accept duplicated generated data.
