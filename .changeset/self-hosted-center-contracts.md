---
'openxiangda-nest': patch
---

`OpenXiangdaPlatformClient.workflowWorkCenter` 新增可选 `view` 参数（`created/pending/handled/cc`），与浏览器端合同对齐；未传时保持原 `status` 兼容行为。文档新增「自建待办与消息中心 UI」指南（`docs/frontend.md`）。
