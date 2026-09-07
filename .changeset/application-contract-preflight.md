---
"openxiangda": patch
"openxiangda-cli": patch
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-mcp": patch
---

Advertise and seal one atomic AppPackage, configuration bundle, contract bundle,
and compiler contract compatibility tuple. Deployment now validates the
platform capabilities envelope and requires an exact accepted tuple before any
workspace production build, backend image build, artifact upload, or
DeploymentRun creation, then repeats the check at the final upload boundary.
