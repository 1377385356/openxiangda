---
'openxiangda-contracts': patch
'openxiangda-devkit-core': patch
---

固定审批 handler 可显式选择工作流决定流转。具名事务仍核验原任务、令牌、权限、
字段和修订，由内核依据保存后的事实执行会签或分支，应用无需复制下一节点逻辑。
新增独立能力协商，默认精确流转及原结果恢复保持。
