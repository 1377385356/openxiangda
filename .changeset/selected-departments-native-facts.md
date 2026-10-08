---
'openxiangda-contracts': minor
'openxiangda-devkit-core': minor
'openxiangda-nest': minor
---

具名业务动作可声明 selectedDepartments，并通过请求作用域目录服务有界读取
所选部门的真实名称和可选路径快照。声明、Schema、双编译器、动作契约和 SDK
共同协商 directory.selected-departments 1.0.0；平台复核真实发起人、Head、租户
及 directory:read，任一部门缺失则整组失败。

架构主题：PLT-047。部门范围沿已有租户/未删除选择器关系，快照不授予永久
业务权限。平台能力需随对应服务版本部署；真实应用目录选择验收另行记录。
