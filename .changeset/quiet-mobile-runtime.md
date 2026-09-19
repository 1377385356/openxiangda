---
"openxiangda": patch
---

由 `openxiangda/react` 在加载移动组件前初始化 Ant Design Mobile 的 px 测量与触摸激活机制，业务应用无需越过包边界直接依赖 `antd-mobile/es/global`，同时继续避免把上游全局视觉重置泄漏到宿主页面。
