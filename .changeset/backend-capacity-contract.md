---
"openxiangda-cli": major
"openxiangda-devkit-core": major
"openxiangda-skill-kit": major
---

Replace raw backend runtime metadata with exact named isolation and resource
profiles. Generated packages now publish one `metadata.backend` contract,
frontend-only applications remain Pod-free, and application code can no longer
set Kubernetes resources, replicas, ports or environment maps.
