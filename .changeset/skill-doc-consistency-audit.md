---
'openxiangda': patch
'openxiangda-devkit-core': patch
'openxiangda-mcp': patch
---

Skill 文档一致性审计修复（2.20.0 速查表内容丢失事故回填 + 平台能力缺口补齐）：

- 声明速查表回填 2.20.0 丢失的行级策略四行（角色并集取最宽、matchMode AND 多角色规则告警、created_by/updated_by current_user 行规则、匿名 requiredFields 警告），并把 requiredFields 措辞从"允许更严"修正为与编译器 warning 及服务端 REQUIRED_FIELD_MISSING 拒绝行为一致；本次直接修改 docs/ 源文件，随 `pnpm docs:generate` 再生成。
- 补齐平台已实现但文档缺失的能力：/view（生产）与 /dev（预发）浏览器入口（testing.md）；mutationOwner 运行时错误行为与 OPENXIANGDA_NATIVE_DATA_CAPABILITY_MISSING、WORKFLOW_OWNER_REQUIRED、OPENXIANGDA_WORKFLOW_CORRECTION_* 错误族（frontend.md）；events.timers 与 events.dateTriggers 声明及 events.schemas 形状（workflow-events.md）；spec add-capability 子命令（appspec.md）。
- 一致性修正：upgrading.md AppSpec context v3→v4；cli.md 由渲染器补充统一入口自带命令（version/update/changelog/migrate/support）说明；development.md 事务守卫清单补 record-match 与 databaseNowAssertion、batchAggregateNativeResources 链接指向 data-access；getting-started.md 修正裸 `auth` 写法并按 create 实际行为更正会话向上继承说明（.git 边界停止）。
- MCP 工具输入 schema 补齐 additionalProperties:false（appspec_context、appspec_verify、administration_context、workflow_node_configurations、check_app、deployment_status），与其余工具一致。
