---
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
"openxiangda-skill-kit": patch
---

统一多值字段创建时的必填判定：附件、图片等数组的不可为 null 存储不再把可选业务字段变成必填。公开策略、默认表单和 AI 输入说明消费同一规则，缺少真正必填字段时返回精确路径与字段标识；需要配套升级平台共享编译器。
