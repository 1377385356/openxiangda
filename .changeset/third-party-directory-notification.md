---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
---

事件通知支持从持久化来源组织解析已声明的班级角色接收人；接收范围来自可信事件投影，保留既有 recipientPaths 行为。平台负责目录与投递，应用负责消息内容和业务目标。

事件worker可显式读取平台托管的organization_id归属元数据，以冻结继承规则的真实所属组织；仍禁止写入，不扩大行范围或默认读取字段。
