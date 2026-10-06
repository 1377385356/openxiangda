---
"openxiangda": patch
---

Keep runtime identity GET recovery within its original deadline after transient transport failures; retain projection, cancellation and authorization boundaries. Use bounded exponential transport backoff and never replay a business submission.
