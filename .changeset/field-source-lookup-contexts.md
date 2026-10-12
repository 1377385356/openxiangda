---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda": minor
---

资源引用列表筛选使用独立的读取意图，支持只读用户及历史不可选引用；声明可用 filterWhere 收窄筛选身份。普通更新关联控件发送记录 id/revision 及实际编辑，由服务端合并保存绑定，不返回私有字段。目录和范围筛选支持停用历史项。新 SDK 的普通更新上下文需要平台先升级，本次为源码实现，未发布 npm 包。
