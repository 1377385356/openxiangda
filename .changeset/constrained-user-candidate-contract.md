---
'openxiangda-contracts': minor
'openxiangda-devkit-core': minor
---

新增人员字段的代码候选声明 `userCandidates` 和流程绑定的 `candidateField` 引用。应用编译器与服务端共享校验器统一检查职责、范围、字段类型、事实投影及办理页范围修改冲突，并自动要求 `data.user-candidates@1.0.0`。

本变更只交付合同与编译校验。运行时尚未开放该能力；未广告完整能力的平台须拒绝部署，不能降级为通讯录选人。范围查询、事务校验、SDK和双端组件将在同一能力完成后接入。
