---
"openxiangda-devkit-core": patch
---

大型应用的 AppSpec 当前文档上限增至 512，保留 2 MiB 总量与 256 KiB 上下文边界，避免多批次业务实现因 128 文件限制而丢弃设计或历史。
