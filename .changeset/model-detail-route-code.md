---
'openxiangda-devkit-core': minor
---

模块模型声明支持资源级详情路由（GAP-MODULE-002）与未知属性 fail-closed

- `AppDataModelDeclaration` 新增 `detailRouteCode`（desktop/mobile route code）：模块化声明可以表达 Workflow 详情接管消费的资源级详情路由绑定，`materializeApplicationModules` 完整透传到输出资源，低层 `data.resources[].detailRouteCode` 语义与既有校验（user surface、单动态参数、read capability 对齐）不变。
- 模型声明上的未知属性不再被静默丢弃：投影输出 `APP_MODEL_KEY_UNKNOWN` 错误 diagnostic（指向 `modules[i].models[j].<key>`）并使编译失败。
- 本次改动位于 devkit-core 声明投影层，contracts 共享纯校验器字节不变，`configuration-compatibility/v2` 的 validatorDigest 不变；资源级 detailRouteCode 校验沿用既有规则。
