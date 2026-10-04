---
"openxiangda-contracts": minor
"openxiangda-devkit-core": patch
"openxiangda": patch
---

固定流程定义支持 `instanceCommands.withdraw.reasonRequired:false` 保留选填撤回原因。省略仍必填，截止事实规则保持，管理员终止仍必填；显式选填要求匹配的 `workflow.optional-withdrawal-reason@1.0.0` 平台能力，实例继续使用冻结版本。
