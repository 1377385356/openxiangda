---
"openxiangda": minor
"openxiangda-cli": minor
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-skill-kit": patch
---

Add one target-platform configuration compatibility contract and make
`openxiangda check` validate the real generated configuration and contract
bundles with the advertised Native platform validator before workspace builds
or deployment uploads. Compatibility failures now retain the Native JSON
pointer plus client schema, platform capability, and required/supported tuple
details, while deployment preparation remains the authoritative validation
boundary.
