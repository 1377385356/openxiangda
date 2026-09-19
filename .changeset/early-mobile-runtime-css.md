---
"openxiangda": patch
"openxiangda-cli": patch
---

在直接加载 Ant Design Mobile 的组件图入口前置最小 px tester CSS，让 Vite 依赖优化后的真实浏览器模块求值也不会早于测量样式；业务应用仍无需直接依赖 `antd-mobile`，且不会引入上游的全局视觉重置。

同步刷新统一分发入口使用的 CLI 精确版本，保持新建、升级与已安装 V2 工作区的工具链胶囊一致。
