---
'openxiangda': minor
'openxiangda-cli': patch
'openxiangda-devkit-core': minor
---

列表排序声明与发布验证提效

- 模块列表视图新增 sortableFields（GAP-MODULE-001）：与 filterFields/searchableFields 同构；defaultSort.field 隐式可排序且重复容忍；引用未声明字段报编译错误；低层声明语义不变。
- 发布验证分级细化：验证计划按浏览器应用实际加载的字节判定浏览器矩阵（根包 src/browser 等前端入口、contracts 非 native-compiler 路径）；devkit-core 回归 Node 侧（build+参考应用，不再强制 e2e）；根包增加映射分支（此前未映射走 fail-closed 全量）。
- 浏览器阶段缓存指纹只包含浏览器捆绑包（openxiangda 与 contracts 浏览器入口，排除 native-compiler 除 data-audit-access 外的字节）；其余候选包字节变化不再使浏览器证据失效，候选版本仍由规范化锁覆盖。
