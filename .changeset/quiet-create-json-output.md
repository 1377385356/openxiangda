---
"openxiangda-cli": patch
---

Keep `openxiangda create --json` machine-readable while the mandatory pnpm
install runs by capturing package-manager progress and returning install
failures as a sanitized retryable result envelope.
