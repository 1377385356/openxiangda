# 应用管理与有效配置

平台的应用管理控制台维护应用成员、角色授权和流程运行参数。应用自身声明的 `/admin` 业务菜单展示业务页面，两者职责不同。可见入口和可执行操作以当前用户与目标环境返回结果为准。

## 发现当前入口 {#context}

```bash
pnpm openxiangda admin context --environment test --json
```

MCP 对应 `administration_context`。先检查返回的管理能力与入口，再进入平台标准管理页面。普通开发者不因拥有源码就自动获得成员管理或流程配置权限；拒绝时联系有权管理员，不伪造用户、租户或权限头。

## 查看流程节点配置 {#workflow}

```bash
pnpm openxiangda admin workflow <workflowCode> --environment test --json
```

MCP 对应 `workflow_node_configurations`。workflowCode 来自当前应用声明。管理员运行配置可能已经覆盖开发默认值；不要只看本地文件推断线上处理人。已创建任务保留其冻结配置，后续节点进入采用适用的新运行配置，具体版本以接口返回为准。

生产读取必须显式指定 production。两个命令均为只读发现，成员/角色和流程参数修改通过已授权的标准管理入口执行。

## 业务页面中的角色管理 {#role-management}

确有业务需要时，使用 `openxiangda/core` 的角色管理 SDK。目录提供可管理角色、动作与授权范围；业务角色只能维护管理员已委托的范围。进一步委托要求 management.delegate，并受已有目标角色及动作子集限制。

成员和委托修改带 UUID operationId、原因，更新/撤销带最新 expectedRevision；冲突后重新读取。应用不另建授权表、选择 actor 或自行保存权限快照。SDK 和当前用户数据边界见[权限](./data-authz.md)。
