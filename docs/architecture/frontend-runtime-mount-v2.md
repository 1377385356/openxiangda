# OpenXiangda 2.0 前端运行时挂载路径（已废弃）

> **SUPERSEDED / 历史证据（2026-08-21）**：本文的 Umi、`openxiangda-admin` 和旧 gateway mount 合同已被 [Vite / Refine 决策](./frontend-stack-decision-v2.md)取代，不再是当前模板、Skill 或 AI 开发依据。当前行为以模板 `runtime-meta.ts`、`/view/:appCode/`、`/dev/:appCode/` 及受验证的 current-user 合同为准；以下正文只保留审计。

状态：2026-08-16 已实现待发布，当前发布阻断项。

## 问题证据

同一个 Native 2.0 前端制品会先挂载在
`/service/openxiangda-apps/{appCode}/preproduction/`，通过验收后再原样挂载到
`/view/{appCode}/`。平台已经在返回的 `index.html` 中注入 `<base>` 和
`openxiangda-runtime-base`，但官方 Umi 模板仍以 `basename=/` 创建 browser
history。应用加载后，根路由重定向会把预发地址改写成域名根目录；静态资源已经加载，
但后续路由、刷新和身份初始化不再处于该应用的环境挂载路径。

这不是单个参考应用的页面错误，而是官方模板与平台动态挂载契约不闭合。把模板改为
hash history 可以规避跳转，但会降低正式地址质量，也会把已有 browser route、标签页和
深链接语义全部改成另一套协议，因此不采用。

## 能力归属

- Platform Server 是环境、活动前端修订和运行时挂载路径的唯一所有者。
- Platform Server 通过受控的 `index.html` 装饰写入
  `meta[name="openxiangda-runtime-base"]`；应用、CLI 和 AI 不自行拼接环境 URL。
- `openxiangda-admin` 是 Umi/React Admin 的平台适配层，唯一负责把平台挂载路径转换为
  Umi runtime `basename`。
- 应用只在 `src/app.ts` 注册官方适配函数，不复制解析、校验或环境判断逻辑。

## 决策

1. 继续使用 Umi browser history，不改为 hash history。
2. `openxiangda-admin` 提供纯函数读取并校验平台注入的 runtime base，再提供 Umi
   `modifyContextOpts` 适配函数。
3. 官方模板在 `src/app.ts` 注册该适配函数；开发者页面和业务路由仍只使用以 `/` 开头的
   应用内路径。
4. 本地开发没有 runtime meta 时稳定回退到 `/`。
5. runtime base 必须是同源绝对路径，不接受协议、host、query、fragment、反斜杠、控制字符
   或超长输入。无效输入关闭到 `/`，不导航到外部 origin。
6. 前端制品、AppPackage 和 AppVersion 不包含环境专用 base；预发到正式晋级仍复用完全相同
   的制品摘要。

## 稳定不变量与契约

- 环境挂载路径只由当前 HTTP 响应中的平台 meta 决定，不由 localStorage、构建变量、角色、
  URL query 或应用业务数据决定。
- Umi 的路由定义、`useNavigate('/path')`、Admin 菜单路径和标签页路径始终是应用内路径；
  SDK 只在 history/router 边界加一次 basename。
- `/service` Data API、App API、OAuth2 和身份端点仍是平台同源绝对服务路径，不拼入前端
  basename。
- 深链接和刷新必须回到同一环境的前端修订；预发路由不得落入 production，production
  路由不得落入预发。
- 该契约只作用于 Native 2.0 前端，不修改 1.x View、流程或自动化路由。

## 失败、并发与安全边界

- runtime base 在 React/Umi 创建 history 前同步解析，不产生异步竞争或第二份状态。
- 多标签、多角色切换和环境同时存在时，每个 HTML 文档只消费自己的 meta；标签之间不共享
  mutable basename。
- 平台漏注入或输入非法时回退 `/`，页面可以显示确定性诊断；SDK 不猜测 appCode 或环境。
- 解析最长接受 2048 字符，只允许以单个 `/` 开头的 pathname，并规范为尾部 `/`。
- 适配函数不读取 Cookie、token、用户资料或业务数据，不扩大身份和授权边界。

## 资源与性能边界

该方案只增加一次同步 meta 查询和 pathname 校验，不增加请求、缓存、数据库状态或运行实例。
前端仍只产出一份可复用制品，不为预发和正式重复构建。

## 回滚边界

- SDK helper、官方模板注册和文档属于一个独立发布主题，可通过回退对应
  `openxiangda-admin` 与 `create-openxiangda` 版本撤销。
- 平台现有 `<base>`/meta 注入保持兼容，不需要数据库迁移或 Platform Server 发布。
- 已生成的 2.0 测试应用可显式采用 helper；不自动改写 1.x 或其他历史应用。

## 可证伪验收

1. 纯函数对预发和正式 base 返回规范 pathname，对外部 URL、query、fragment、控制字符和
   超长输入回退 `/`。
2. 官方模板继续声明 browser history，并注册 SDK 的 Umi runtime context 适配器。
3. 生产构建在注入预发 meta 后访问应用根路径，浏览器 URL 保持在预发挂载路径；导航、回退、
   深链接刷新均不离开该前缀。
4. 同一前端 artifact 晋升 production 后，在 `/view/{appCode}/` 下通过相同场景。
5. 两个环境的身份请求分别携带正确环境语义，控制台没有未处理异常、资源 404 或无效 JSON。
6. 全量 2.0 release gate、仓库外参考应用构建与线上 preproduction→production 验收通过。
