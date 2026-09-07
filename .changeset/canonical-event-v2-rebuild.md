---
"openxiangda-cli": major
"openxiangda-contracts": major
"openxiangda-devkit-core": major
"openxiangda-mcp": major
"openxiangda-nest": major
---

Replace the unshipped Application Events contract with canonical data and
workflow v2 events, an immutable event catalog and schema digest, bounded
filters and payload projections, typed handler manifests, durable timer/date
producer declarations, and atomic application-domain event emission. Remove
the old data-event aliases, subject filters, imperative subscription creation,
and subscription-secret response fields instead of carrying compatibility.
