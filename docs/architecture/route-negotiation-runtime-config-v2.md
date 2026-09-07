# OpenXiangda 2.0 版本化路由协商与登录入口契约

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：2026-08-31 架构门，进入实现。

## 问题证据

union reference app 预发布的应用渲染器已经有独立移动登录页：显式访问
`/dev/union-example/m/` 可以进入 `/m/login`，390×844 的提交控件完全在视口内；但
同一浏览器从应用根入口访问 `/dev/union-example/` 时，平台仍按 URL 前缀把请求送到
桌面 `/login`。这不是应用 CSS 或应用登录组件问题，而是平台 Server 在
`runtimeBrowserDevice()` 中只根据 `/m` 路径决定设备族，无法感知根入口的真实
viewport。平台也没有返回 `Vary: User-Agent`，所以不能把 User-Agent 当作权威修复。

同时，2.0 浏览器包当前只允许五种标准 route kind，并把 `768px` 写在 SDK 常量中；
应用因此被迫维护自己的几十组 PC/mobile route 配对。这个边界不适合已存在的
标准资源和业务 route，也使登录入口、根入口、旧路径替换和返回上下文无法由一个
平台契约统一处理。

## 目标与所有权

- Platform Server 负责发布一个版本化、可缓存校验的 browser-entry/route manifest；
  `openxiangda` runtime 负责在 Router 建立后根据 manifest 做纯函数协商。
- 应用只声明 route code、PC/mobile path、surface、参数和登录 renderer；应用不再
  维护标准 route pair 表，也不根据角色或 User-Agent 猜设备。
- 1.0 `/view`、旧应用认证控制器和旧数据库不进入本轮。

## 稳定契约

### 1. Manifest

`AppRouteManifestV2` 升级为 `v3`（2.0 测试阶段允许破坏性替换），新增：

```ts
interface AppRouteManifestV3 {
  schemaVersion: 'openxiangda.application-route-manifest/v3';
  appCode: string;
  devicePolicy: {
    kind: 'viewport-family';
    mobileMaxWidthPx: number;
    desktopMinWidthPx: number;
  };
  rootEntry: {
    code: string;
    desktop: string;
    mobile: string;
  };
  authentication: {
    desktop: { routeCode: string; path: string };
    mobile: { routeCode: string; path: string };
  };
  routes: readonly AppRouteManifestEntryV3[];
  digest: Sha256Digest;
}
```

`mobileMaxWidthPx + 1 === desktopMinWidthPx`，范围为 320..1600；union reference app 首个候选
使用现有 `900` 边界，不能由 SDK 再写死 768。Manifest 的 `rootEntry` 和
`authentication` 必须引用已声明的静态 route；每个 paired route 显式携带
`desktop`、`mobile`，不通过 `.mobile` 命名或 `/m` 前缀推断。动态参数只按同名参数
传递；不能证明语义身份时返回 `undefined`。

### 2. 浏览器协商

`negotiateStandardRoute(index, location, targetDevice)` 保持纯函数：

1. 仅匹配 Router basename 后的 pathname；search、hash 和 Router state 原样保留。
2. target device 由 `manifest.devicePolicy` 与 `window.innerWidth` 得出；窗口尺寸
   改变允许双向 `replace`，但只在 Router listener 建立后执行。
3. 一个 source pathname 必须得到唯一语义 entry；零个或多个候选都不导航。
4. replace 设定 `state: location.state`，以 source URL+target device 做单飞键；
   用户新的导航或下一次 viewport family 变化会清理该键。
5. 非标准应用 route、登录 callback、带非法参数的路径不参与协商。

### 3. 根入口与登录

Server 的 `/dev/:appCode/` 只返回 browser-entry contract，不在 HTTP 层猜
viewport，也不把根入口永久重定向到桌面登录。未认证时客户端按 manifest 选择
`authentication.desktop` 或 `.mobile`；平台登录 transaction 仍绑定所选 device、
returnTo、appVersion 和 environment。显式 `/m/...`、显式桌面路径保持确定性；
首屏还未有 viewport 时使用 desktop，随后在 Router listener 建立后按 manifest
协商一次。Server 可以对显式路径做 302，但不得对根入口按 User-Agent 伪造设备。

## 失败、资源与安全边界

这是内部企业用户场景，只保留必要的输入边界：manifest 64 KiB、route 512 条、
path 2048 字节、参数 32 个；digest 不匹配或 schema 无效则显示可重试错误。协商
不访问网络、不保存身份、不新增 token 或设备指纹，也不改变现有 Data/Workflow
授权。登录既有 CSRF、cookie 和会话合同保持不变；本轮不增加零信任策略。

## 迁移与回滚

2.0 测试阶段直接删除 v2 route manifest schema 和固定 768 常量；compiler、SDK、
模板及 union reference app 同步升级到 v3。1.0 `/view` 不加载该包。发布前可回退整个
`openxiangda` 包；发布后只能将应用和平台一起回退到同一 immutable combination，
不做字段别名或双轨解析。

## 可证伪验收

1. 编译器对 union reference app 全量 route（含登录、根入口、Workflow、资源和业务成对路径）
   生成唯一 manifest/digest；旧应用自建 pair 表在 lint 中被拒绝。
2. 320、899、900、901、1440px 和缺失 viewport 覆盖双向协商、参数、query/hash/
   state、重复 effect、未知/歧义 path。
3. 真实认证浏览器验证：桌面根入口到 `/login`、390px 根入口到 `/m/login`，显式
   `/m` 不回桌面；登录后 PC↔mobile task/instance/business route 保留返回上下文。
4. Server 未认证根入口、静态资源和 API 的 status/content-type/body digest 分别
   回读；1.0 `/view` smoke 与 union reference app app release 一起通过。

