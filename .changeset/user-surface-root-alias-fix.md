---
'openxiangda': patch
'openxiangda-cli': patch
---

修复 2.18.0 中用户标准面应用整页渲染为空白的问题：当 rootEntry 直接别名资源 records 路由（登录落地即"我的记录"）时，运行时清单校验器错误地把这一设计形状判定为路径冲突并抛出 OPENXIANGDA_ROUTE_MANIFEST_INVALID，导致 React 根本无法挂载。现在校验器与设备协商都接受"根入口别名恰好一条标准路由对"的编译器形状；认证路径与其它任何落地路径冲突仍然拒绝。新增浏览器验收 user-surface.e2e 覆盖该形状（挂载、本人过滤列表、提交表单、双端切换），并为 mock 平台补齐单条记录读取端点。
