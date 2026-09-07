---
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
---

Keep Kubernetes application readiness local to the NestJS process and injected
Native runtime identity. Move platform reachability and contract compatibility
to a separate authenticated dependency diagnostic so a control-plane rollout
does not simultaneously remove healthy application Pods from service.
