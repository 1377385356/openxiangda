---
"openxiangda": patch
"openxiangda-contracts": minor
"openxiangda-devkit-core": patch
"openxiangda-skill-kit": patch
---

日期事件复用订阅payload.fields声明可信Native来源投影，共享字段、敏感项及schema
结构检查；固定日期封套与运行时来源值分开验证，不伪造人员样本。投影来源保留为
平台生成字段，并通过events.date-source-projection能力协商拒绝不支持的旧平台。
