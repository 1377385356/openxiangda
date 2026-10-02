---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda-nest": minor
"openxiangda": minor
---

增加固定版本的持久 Workflow action 节点、闭合输入输出、步骤事实来源与同源图投影。步骤使用原 Events 签名/领取/持久回执，结果保存后受阻仅重试流程推进；效果处理器每次核对原执行键，旧版本合同保持稳定。新增共享管理恢复组件与公开SDK，保留普通事件协议、固定拓扑和页面字段逻辑。平台必须提供 workflow.durable-business-step，内核与正式SQL同批交付。本批仅本地包测试，不发布npm。
