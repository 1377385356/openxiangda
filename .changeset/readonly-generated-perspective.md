---
"openxiangda": patch
"openxiangda-cli": patch
---

修复非空生成 Perspective 的嵌套只读数组与公共 React 输入类型不一致。复用只读输入契约，保留可变 wire contract 的消费兼容，身份与授权协议不变；以公共导出 TypeScript 正反例核验。
