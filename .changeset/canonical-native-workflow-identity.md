---
"openxiangda-contracts": minor
"openxiangda-skill-kit": patch
"openxiangda": minor
---

Correct Native UUID omission, Workflow fact identity, and Native data-event
capture-plan evolution semantics. Declared optional UUID fields no longer imply
generated identifiers; every Workflow fact v2 requires the immutable
definition, binding, instance, generation, business-data reference, revision,
actor, and cause envelope; and capture plans are versioned by the Event, Data,
AuthZ and resource revision tuple without reprojecting historical facts.
