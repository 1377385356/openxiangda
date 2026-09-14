# 标准待办中心与消息中心视觉重构 v2

状态：2026-09-15 按用户要求执行（标准页面样式重构，PC 与移动端）。

## 问题证据

线上应用（如 `/dev/szgh-v2/work-center`、`/dev/szgh-v2/todos`）中两个标准用户面
观感粗糙：待办中心使用裸 `<h1>`/`<small>` 元素且页面为整片白色卡片，消息中心
工具栏换行错位、摘要素面无层级；更关键的是运行时从未设置基础 `font-family`，
裸元素继承浏览器衬线默认值（Windows 下为宋体），与 antd 组件的中文字体混排发虚，
这是"样式难看"的首要根因。待办中心与消息中心的页头模式互不一致，违反同层
标准页应共享同一视觉语汇的预期。

## 能力归属与决策

- `openxiangda/react` 继续拥有两个标准页面的结构、样式与文案；本轮只重组
  布局与状态呈现，不新增字段、过滤、排序、批量操作或任何第二份查询。
- 基础字体兜底加在 `.oxa-ui-root`（class 选择器，非全局选择器），字体栈读取
  `var(--ant-font-family, <系统中文字体栈>)`、字号/行高读取
  `var(--ant-font-size, 14px)` / `var(--ant-line-height, 1.5714)`：应用通过
  `ui.theme` 传入的品牌字体/字号自动流入裸元素，未配置时保持 antd 默认值。
- 待办中心改为与消息中心一致的「layout 底 + 白色内容卡」层次：页头
  （Typography 标题 + 次级说明 + 图标刷新钮）、Tabs 计数徽标、`size=middle`
  表格卡；移动端吸顶页头 + 卡片列表（标题 15px/600、状态 Tag、次级流程·节点、
  右对齐三级时间、10px 圆角、按下反馈）。
- 消息中心工具栏并入单行控制区（Segmented 左，搜索/查询/仅看未读右对齐且
  禁止内部换行）；摘要卡图标改为主色底圆角方块、数字 tabular-nums；未读圆点
  显式主色；移动卡片改为单列 + 3px 主色未读左缘条，Badge 列在移动端隐藏。
- `scripts/verify-design-workbench.mjs` 的内联 `server.port: 0` 会被 Vite 的
  假值回退解析为默认端口 5173，本机存在其他 dev server 时设计门必然失败；
  改为探测空闲临时端口。该文件属验证基础设施，使本轮强制设计门在本地可执行。

## 稳定不变量

1. 测试锁定的类名与语义全部保留：`.oxa-todo-center-{desktop,mobile}`、
   `.oxa-todo-table`、`.oxa-todo-preview-card` 不得存在、`.oxa-work-center-*`、
   heading `待办中心`/`消息中心`、`tab` 视图、`仅看未读` 开关、`查看详情` 入口。
2. 合同边界不变：分页上限（桌面 12/移动 10）、动态字段裁剪（桌面 3/移动 8）、
   只消费平台解析的 `desktopPath/mobilePath`、不执行审批命令、不缓存跨页数据。
3. 样式只消费 `--ant-*` 原生变量，无 `html/body/#root/*` 全局选择器、无自建
   调色板命名空间；应用主题仍是唯一视觉输入。
4. 移动端行为不变：请求序号淘汰旧响应、失败保留旧数据并可重试、回执失败不
   阻断目标页自身鉴权。

## 失败、并发和资源边界

- 纯呈现变更：无新网络、存储、定时器或权限面；字体/字号变量缺省时回退栈与
  antd 默认值一致，未配置 `ui.theme` 的应用视觉仅随组件默认值走。
- `flex-wrap: nowrap` 仅作用于桌面控制区内部行，移动端仍由 grid 规则接管，
  窄屏不产生横向溢出。

## 受影响合同和回滚

影响 `packages/openxiangda` 浏览器源码与验证脚本；平台 Server、public
contracts、模板应用与 1.x 均不变。回滚恢复上一版 `openxiangda` 包即可，无
数据迁移。Changeset：`openxiangda` patch。

## 本轮验证结果

- `pnpm verify:affected`：12/12 任务通过（check/test/build）。
- `pnpm test`（openxiangda）：202/202 通过；`node --test scripts/test/*.test.mjs`：
  104/104 通过；`scripts/sync-developer-guidance.mjs` 无生成物漂移。
- `pnpm design:check`：PC（1440×1080）与移动走查通过，`browserErrors: []`，
  主题作用域与相邻应用不受影响。
- 浏览器走查证据（真实组件 + Playwright 路由 mock，改前/改后）：
  `docs/design/standard-centers-restyle-v2/`，覆盖待办中心与消息中心的
  桌面 1440×1080 与移动 390×844（@2x）视图及空态、未读、分页态。
