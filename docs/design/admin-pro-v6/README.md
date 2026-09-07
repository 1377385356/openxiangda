# OpenXiangda Admin Pro v6 设计基线

状态：2026-08-16 已评审，作为 Ant Design Pro v6 全量切换的实现输入。

这组设计是信息架构、视觉层级、布局几何、密度、操作顺序和状态表现的可执行验收合同。最终实现必须使用锁定的 Ant Design Pro v6、ProComponents 与 Ant Design 6 公共 API，并以真实浏览器、可访问性、协议和截图回归共同验收。业务数据不要求与稿件相同，但不能用组件库默认样式、临时 CSS 或“仅参考信息架构”解释明显的视觉与交互偏差。

## 设计参数

- 模式：2.0 全量重构，不保留旧 Shell 或旧页面兼容层。
- 视觉变化：3/10；动效：2/10；信息密度：6/10。
- 外观：Ant Design 默认组件。
- 形状：控件与内容面统一 8px 圆角，细边框优先，阴影克制。
- 操作：一个操作面只有一个主动作；错误、空、加载和重试是必需状态。
- 内容：普通用户只看到业务标签，内部 UUID、环境 key、角色/权限 code、流程节点 key 和原始 JSON 不进入默认页面。

## 已评审界面

| 界面 | 文件 | 评审结论 |
| --- | --- | --- |
| 工作台 | [workbench.png](./workbench.png) | 保留 ProLayout、环境入口、标签缓存、待办、快捷入口和受限聚合；实现时把四色大图标收敛为单一主色/必要语义色。 |
| 标准数据管理 | [data-management.png](./data-management.png) | 使用 ProTable 搜索、服务端排序/分页、列配置、密度和行操作；空状态只在无结果时替换表格，不与有数据列表同时出现。 |
| 流程提交 | [workflow-submit-modal.png](./workflow-submit-modal.png) | 页面只保留“提交申请”主按钮；点击后 prepare 并在 Modal 展示真实审批路径，确认后用稳定幂等键启动流程。 |

示例业务统一使用企业采购申请，只作为验收载体；采购领域代码不得进入 `openxiangda-admin`。

完整重建阶段、能力所有权和机器验收见[最佳实践模板重建计划](../../architecture/best-practice-template-rebuild-v2.md)。
