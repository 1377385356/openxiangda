# Resource Reference JSON 语义 v2

## 问题证据

- `resource-ref.single` / `resource-ref.multiple` 当前保存 `{ label, value, resourceCode, snapshot }` JSON，界面按 `value` 查询目标资源并用其余字段显示。
- “snapshot”容易被误解为平台验证的关系快照或外键事实，但平台没有也不需要为该 JSON 建立签名、关联版本或级联一致性存储。
- 用户明确选择维持直接 JSON 存储，不引入可信关联快照。

## 决策

### 能力所有者

- 业务记录中的 resource-ref JSON 由当前资源记录拥有，Native Data API 只做结构、类型和大小校验并原样持久化。
- 被引用资源仍是其自身事实源；需要最新或可信数据的业务动作必须按 `resourceCode + value` 重新读取目标资源。

### 稳定不变量与受影响合同

1. `value` 是稳定比较键；`label`、`snapshot` 和 source 描述只用于显示、搜索回显和历史可读性。
2. 平台不保证引用目标存在、未删除、未变更，也不保证 snapshot 来自目标资源。
3. `source` 是编译期选择器/查询声明，不是数据库外键、访问授权或完整性证明。
4. 平台不新增签名、可信摘要、级联更新、级联删除或后台同步。
5. 权限判断不能信任 resource-ref JSON 中的 label/snapshot；需要权威判断时必须重新读取目标资源并执行相应业务规则。

### 失败、安全与资源边界

- 结构不合法、字段超限或 resourceCode 与声明不符时拒绝；合法 JSON 直接保存。
- 删除目标记录不会自动修改引用记录；UI 应保留已保存显示值并允许用户按业务需要重新选择。
- 本决策不建立第二状态源，回滚只涉及文档、Skill 和字段提示。

## 可证伪验收

1. 保存后读回的合法 resource-ref JSON 与输入规范化结果一致，不出现平台生成签名或隐藏关联记录。
2. 修改/删除目标资源不会隐式重写引用记录。
3. SDK 文档和 AI Skill 明确禁止把 snapshot 当作授权、金额、状态或其他可信事实。

