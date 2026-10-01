---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda": minor
---

审批节点可显式声明管理员可修改的模式、人员来源和按钮上限。编译器和平台共用有界校验及投影，任务冻结有效配置，公开 SDK 提供配置读写及 CAS/幂等回执；新声明要求平台 workflow.node-administration 能力。字段行为继续由应用页面与代码维护。

浏览器 SDK 复用平台现有 `/admin` 控制器和当前应用环境，保留直接 API 的权限拒绝与稳定请求回执。
