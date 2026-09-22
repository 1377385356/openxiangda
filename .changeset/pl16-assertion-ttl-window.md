---
"openxiangda-nest": patch
---

fix(nest): gateway assertion verifier accepts platform-configurable TTL windows — app-side lifetime ceiling raised from the hard-coded 30s to the platform maximum 300s (default stays 30s, configurable via OPENXIANGDA_GATEWAY_ASSERTION_TTL_SECONDS on the gateway). Cold-start/slow requests on the gateway→app→verify three-hop chain previously blew past 30s and surfaced intermittent 401 ASSERTION_CONTEXT_INVALID; forged assertions beyond 300s are still rejected (PL-16).
