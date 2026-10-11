# 源码模板与业务场景

## 选择与创建 {#create}

模板是应用源码的初始化，不是不可编辑的 SDK 页面。后台、PC 用户端、移动用户端和登录外观分别选择布局；公共登录行为继续由 SDK 提供。既有 builtin:application 保持基础空应用。

先运行 `openxiangda template list --json`，或读取 MCP template_list。已确定业务和授权创建时直接初始化，无需为模板选择增加确认。

```bash
openxiangda create ./visitor-app --base-url <测试平台> --scenario visitor
openxiangda create ./records-app --base-url <测试平台> --scenario crud --style graphite-blue
openxiangda create ./visitor-app --base-url <测试平台> --scenario visitor --admin topbar --pc workbench --mobile task-list --login centered
```

with/without 接受逗号分隔模块。未知场景、布局、风格、模块及缺失依赖在物化前报错。访客默认包含 time-slot、pass-and-checkin、party-directory、my-records；没有应用后端或工作流。移除依赖模块时必须同时移除依赖它的模块。创建到已有工作区只恢复原来源；不能换一套模板覆盖应用源码。

## 源码所有权 {#ownership}

后台外壳位于 apps/web/src/frames/admin/AdminShell.tsx；PC/移动 frame 位于同目录；登录布局位于 apps/web/src/login；样式位于 apps/web/src/theme；后台资源页位于 apps/web/src/admin。开发者可复制、修改、替换、重构，平台不会自动覆盖这些文件。通用模板修复由各应用选择采用。

唯一后台通过 ui.admin.shell 挂载，菜单和路径来自平台已授权模型。保留 SDK 的路由及权限边界。应用页面通过 resourcePages 的 resource/view/list/detail/form contribution 挂载；未声明的页面沿用 SDK fallback。用户端通过 standardUserSurfaces 和普通页面贡献使用同一个应用路由。

## 修改列表 {#resource-list}

从 openxiangda/resource 导入 useResourceListController 和 ResourceListActions、ResourceListQueryBar、ResourceListAdvancedFilter、ResourceListAppliedFilters、ResourceListTable、ResourceListBatchBar、ResourceListOverlays 等块。控制器拥有数据、查询、列偏好、选择和获准动作；页面决定布局。columnRenderers 可替换可读列展示。移动端使用 useMobileResourceListController 与对应块。SDK 默认页使用相同边界。

resourcePages: { visits: { default: { list: VisitListPage } } } 按资源和视图注册。应用组件获得 definition、paths、mode 和 variant；路由先核验生成声明、读取/动作能力，再渲染贡献页。隐藏列不授予权限，新增视觉动作仍由服务器校验。

模板带 check:imports，解析真实 TypeScript 导入并核验包 exports；不允许私有 dist/src 深导入。资源 detail/form 先提供已有块，独立控制器继续扩展。

## 登录与验收 {#login}

登录模板消费 SDK 提供的 methods、state、error、passwordLogin、startSso、startDingTalk。支持账号密码、组织配置的 SSO/钉钉、验证码挑战、恢复身份和错误反馈；不建立第二个登录态，不显示未配置的入口。

访客角色起点：host 可邀请且读取自己创建的记录；front_desk 可进入唯一后台并登记到访，数据范围由平台策略约束。区域及角色为示例，接入实际组织前按业务修改。简单 CRUD 场景提供表单、我的记录和后台数据管理。

验收分别记录本地编译、浏览器、测试平台、实际角色和业务回读。模板初始化和设计图不是已部署业务。先 check，再按已授权环境验证邀请→接待→状态回读，桌面及 390px 均覆盖。参考[页面与标准组件](./frontend.md)、[无账号访问](./public-access.md)和[校验](./testing.md)。
