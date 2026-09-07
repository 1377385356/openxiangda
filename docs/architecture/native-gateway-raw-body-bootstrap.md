# Native 网关原始请求体启动合同

## 问题证据

OpenXiangda 2.0 网关断言把 HTTP method、path、规范化 query 和原始 body 字节一起签名。标准应用模板使用 NestJS + Fastify，但启动代码没有启用 Nest 的 `rawBody`，导致所有携带 JSON body 的自定义操作在进入控制器前被网关拦截为 `OPENXIANGDA_GATEWAY_RAW_BODY_REQUIRED`。直接 Data API CRUD 不经过应用后端，因此此前的 CRUD 回归没有覆盖该缺口。

## 能力所有者与稳定不变量

- `openxiangda-nest` 是应用后端启动与网关断言接收的唯一所有者。
- 所有非 GET/HEAD 网关调用必须以平台签名时使用的原始字节进行校验；解析后的对象不能重新序列化代替原始请求体。
- 新应用不再自行拼装 NestFactory/Fastify 启动选项，而是调用 SDK 的标准启动器。
- 2.0 不提供缺少 raw body 时的兼容降级，也不跳过 body 签名。

## 合同设计

`openxiangda-nest` 导出 `bootstrapOpenXiangdaApplication`：

1. 固定创建 NestJS Fastify 应用；
2. 固定启用 `{ rawBody: true }`；
3. 启用 shutdown hooks；
4. 统一解析应用端口和监听地址；
5. 返回已经监听的应用实例，允许测试和扩展继续使用标准 Nest API。

应用模板的 `main.ts` 只负责传入根模块。这样 raw body、Fastify 与监听生命周期不会在每个应用里重复实现或被遗漏。

## 失败、资源与安全边界

- 原始请求体仅由 Nest 在请求生命周期内保留，仍受现有 HTTP body 限制，不建立第二份持久状态。
- 网关断言继续 fail-closed；缺少原始字节仍返回 401，不根据解析对象猜测签名内容。
- 启动失败直接阻止应用 Ready，不产生部分可用的业务端点。
- 变更只影响 2.0 新应用模板与 `openxiangda-nest`，不存在 1.x 或历史 2.0 兼容边界。

## 回滚边界

回滚 SDK 与模板提交即可恢复旧启动方式；已生成应用使用其锁定包版本和源代码，不发生隐式运行时切换。

## 可证伪验收

- SDK 集成测试通过标准启动器发送 JSON POST 后，必须观察到与请求字节完全相同的 `request.rawBody`。
- 新生成工作区的 `main.ts` 不再直接使用 NestFactory/FastifyAdapter，并且必须调用标准启动器。
- 源码 CLI 黑盒在安装临时工作区前必须构建完整本地候选包，模板不能偶然读取旧 `dist` 导出；打包与发布校验继续使用独立 tarball 证明。
- 访客预约、会议预订、选课三个真实自定义 POST 操作必须通过网关断言并完成业务规则。
- 篡改或缺少网关断言时仍必须失败，不能因本次修改绕过认证。
