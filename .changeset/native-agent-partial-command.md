---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
"openxiangda": minor
---

原生助手更新任务使用普通 id/expectedRevision/data 命令结构，不再嵌套另一套 target 值；模型仍只拿记录回执句柄。更新卡片保留字段声明的必填属性而不要求未修改字段出现在 partial patch 中，后续填写实现按同一个字段值协议归一化。
