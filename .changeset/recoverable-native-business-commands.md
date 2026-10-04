---
"openxiangda-contracts": minor
"openxiangda-nest": minor
"openxiangda-devkit-core": patch
---

为具名业务动作新增 Native 数据命令提交和原结果只读恢复。原操作键绑定当前真实用户、动作和业务输入；平台沿现有 Native 回执保存原版本结果，SDK 不自动重试写入。编译器严格校验 dataCommands 声明并自动要求 data.business-commands 能力。
