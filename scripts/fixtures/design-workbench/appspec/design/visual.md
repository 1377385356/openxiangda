---
schema: openxiangda.appspec/design/v1
id: DES-VISUAL-WORKBENCH
title: 事项工作台设计能力样例
status: draft
type: visual
assets:
  - appspec/design/system
  - appspec/design/prototypes/workbench
---

# 事项工作台设计能力样例

## 界面模式

采用任务主从列表与办理表单，设计理由和完整视觉语义在 system/DESIGN.md；无客户模型和真实后台写入。

## 布局与多端

宽屏保留列表和详情，手机从列表进入详情并可返回；表单复用同一字段定义的 PC/移动控件。数值仅在 system/tokens.css。

## 原型与状态

prototypes/workbench 是可运行 React 原型源码，组件依赖来自同一仓库候选；manifest 固定设计能力和包版本。状态演练覆盖空、加载、失败、拒绝、长标题和提交失败。它是维护者验收样例，不作为已获用户确认的生产应用。

## 可访问性

语义标题、原生按钮、字段标签、可见焦点与键盘动作；实际浏览器检查记录在样例 verification.md。未做屏幕阅读器或真实业务验收时不得宣称通过。
