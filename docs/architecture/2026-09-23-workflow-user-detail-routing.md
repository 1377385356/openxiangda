# 工作流桌面详情进入应用用户框架（PL-21）

证据：合同应用将 `workflows.definitions[].detailRouteCode.desktop` 指向已声明的 `user` surface `approval-detail` 时，本地检查以 `APP_CONFIG_WORKFLOW_DETAIL_ROUTE_SURFACE_INVALID` 拒绝；现用 `admin` 详情深链必须先进入默认后台壳，再由应用重定向。移动详情已支持 `user` surface。

能力所有者：应用声明详情 route 与访问表达式；共享 Native 编译器验证并封入合同；平台 workflow detail-route 服务从当前环境的活动合同解析待办与通知深链；浏览器路由/应用后端继续执行登录与业务授权。无需新增路由表或身份状态。

不变量：桌面详情可引用 `admin` 或 `user` surface，移动详情仍只引用 `user`；两端 route code 均须存在、互异，路径绝对且仅含一个 `:instanceId`，taskId 只作为受限 query；原有 admin 绑定及未声明时的标准路径不变。只在已认证应用入口下导航，不能用 route code 越权访问业务数据。预发/正式前缀由现有环境解析器决定。

影响契约：开发者配置校验、`openxiangda-contracts/native-compiler`、平台服务端 `OpenXiangdaWorkflowDetailRouteV2Service`。旧应用及稳定 1.x 不变；新声明必须在编译器与平台服务端同时升级后发布。若活动合同引用丢失/错端/错形路径，继续 fail closed，不回退到猜测的用户路径。

并发、资源与回滚：深链按活动合同只读解析，最多 100 工作流、500 路由、200 条待办，延续现有限额；部署只改变可接受 route surface，不改既有数据。回滚到旧平台会拒绝新 user desktop 绑定，故应用发布需在平台上线后；平台回滚前须恢复应用原 admin 绑定或停用该新版本。

可证伪验证：同一声明经 devkit 校验、共享编译、服务端解析返回 `/approval-detail/<instanceId>?taskId=<taskId>`；admin 旧路径、移动 user 路径仍通过；未知路由、移动 admin、错误动态参数仍拒绝；真实预发通知与待办以当前登录身份直接打开用户框架并回读目标实例，不能只以 URL 字符串视为验收。
