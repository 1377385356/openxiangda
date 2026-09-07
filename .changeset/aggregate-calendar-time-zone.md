---
"openxiangda-contracts": minor
---

Add an optional IANA timeZone to DataAggregateQuery. The matching platform defaults datetime calendar buckets to UTC, validates zone names and rejects bare numeric offsets; date-only fields retain their calendar dates. Direct and batch aggregate clients use the same contract. Deploy the matching platform before applications send the new property.
