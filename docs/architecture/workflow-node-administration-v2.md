# Workflow 节点管理的开发者读取契约

2026-09-06；对应平台服务端 `docs/architecture/workflow-node-administration-v2.md`。

后台允许维护节点名称、说明、固定人员和角色，平台保存可审计修订；流程结构继续由代码发布。AI 如果只能读取本地定义，会误以为默认审批人就是当前生效的审批人，因此需要明确的远端读取能力。

Workflow 平台服务是节点运行配置的唯一权威来源。公共 contracts 定义原始默认值、覆盖、当前有效值、修订及历史；ControlPlaneClient 使用已登录开发者及当前工作区，不引入新凭据、数据库或管理状态文件。`openxiangda admin context` 读取当前应用管理能力，`openxiangda admin workflow <workflowCode>` 读取指定环境的节点配置；均只读，默认测试环境，生产必须显式指定。

2026-09-06 管理入口合同补齐：平台身份与现有角色管理授权仍是唯一权威。context 返回 application_super_admin、delegated_role_manager 或 application_management，并返回 authorizedPages。受托角色管理员只获得角色成员页；尚无活动版本但拥有应用管理权的用户只获得版本发布页，此时 appVersionId 和 headRevision 为 null、unpublished 为 true。客户端不得把入口可见性推导成数据超管，不得为缺失活动版本编造修订或回退到生产环境。该投影不写数据、不新增权限状态；各实际操作仍复核原有权限和版本。公共 DTO 的可空版本、授权种类和导入额度与服务端保持一致；客户端测试验证原样保留这些差异和禁止响应，不影响稳定 1.x，回退仅涉及此版本的客户端合同。

查询失败不回退为本地定义，也不能把“无法读取”当成“没有覆盖”。该命令不改变角色、参与人、流程结构或远端数据。UI 保存继续由服务端执行真实权限、修订和幂等检查。后台设置作用于之后进入的节点，包括既有实例的未来节点；已经生成的待办固定其原配置。发布和回退须由平台检查节点语义与所选角色兼容性，不能静默覆盖后台参数。

这是新增开发者只读命令，不改变普通 CRUD、默认模板、应用登录、1.x 或其他应用。可独立回退 CLI；存在配置的应用不允许回退到忽略配置的流程引擎。验证包含路径和环境编码、拒绝无法识别的操作、CLI 发现、类型检查、Skills／模板入口一致性及仓库 affected/release gates。

开发验证：`pnpm verify:affected` 24 个任务全部成功，devkit-core 215 项测试通过。命令文档由生成器更新，Skills manifest 与本地安装同步刷新；包发布及部署验收另行记录。
