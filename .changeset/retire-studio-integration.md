---
"openxiangda": patch
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-cli": minor
---

退役已停止维护的 OpenXiangda Studio 集成：删除 Project/ProvisioningRun 初始化参数及 Studio 发现、绑定、初始化协议，不再输出 toolchain.studio。通用 JSON/JSONL 输出、CLI 能力发现和模板摘要绑定保留在独立 CLI 契约中。

旧 Studio 专属导出和参数不再兼容。普通 OpenXiangda 2.0 应用的 create、connected development、平台源码托管及 V1 分发行为继续保持；本 Changeset 不发布新 Agent 运行时。
