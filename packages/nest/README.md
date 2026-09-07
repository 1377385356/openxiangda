# openxiangda-nest

OpenXiangda 2.0 的可选业务后端 SDK。普通 CRUD、标准审批与通知优先使用平台能力；确有自定义服务端业务时，通过根包 `openxiangda/nest` 使用本 SDK。完整中文指南运行 `pnpm openxiangda docs backend`。

全局 Guard 验证平台网关证明，`@CurrentUser()` 提供已验证的用户、角色并集和能力并集。`@OpenXiangdaOperation()` 绑定声明的业务动作并在入口授权。动作内的 `OpenXiangdaBusinessDataApiService` 使用应用服务端执行权限，不再次按调用者普通 CRUD 权限过滤；业务范围必须由动作本身校验，审计保留发起用户及动作。

使用 `bootstrapOpenXiangdaApplication` 启动后端，它负责原始请求字节、代理信任、关闭钩子及监听协议；应用不另建启动器。SDK 自动传递平台请求 ID，不手写身份或权限镜像。

`OpenXiangdaStandardOperations` 封装会议冲突、课程容量与重复选课、访客重复预约等事务。访客 `duplicateMatch` 是非空的真实值对象，和 data 来自同一不可变请求；不是字段名数组。重试使用相同事务及 idempotencyKey，平台返回既有结果以避免重复数据和事件。

业务动作内的 `OpenXiangdaBusinessNotificationService.send()` 使用平台管理的应用身份。签名事件与日期触发处理器使用 sendFromEvent()，由平台从不可变事件 data 解析收件人与文案。`OpenXiangdaNotificationService` 是具有 `app:notification2:send` 的管理调用路径，高级钉钉卡片为显式启用的通道；应用不管理机器人凭据。
