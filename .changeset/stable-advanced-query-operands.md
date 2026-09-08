---
"openxiangda": patch
---

Preserve explicit query operand cardinality and paths when normalizing Field Kit selections. Scalar membership predicates remain scalar, and array operators keep every operand across list, batch list and export requests.
