---
"openxiangda-contracts": major
"openxiangda-devkit-core": major
"openxiangda": major
"openxiangda-cli": patch
---

Replace the unshipped application route manifest v2 with v3. The compiler now
publishes a validated device policy, root-entry pair, and desktop/mobile
authentication pair; the browser negotiates those compiler-owned surfaces and
standard routes while preserving deep-link parameters, query/hash state, and
browser history. The default viewport boundary is mobile through 900px and
desktop from 901px, with bounded application overrides.
