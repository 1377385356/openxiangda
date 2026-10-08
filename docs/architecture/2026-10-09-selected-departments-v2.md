# PLT-047：具名动作读取已选部门事实

状态：实现候选。架构主题仅为 `directory.selected-departments` 1.0.0；
受管文件 Native 提交校验是后续独立 PLT-048 提交和发布单元。

## 问题、归属和决定

1.0 迁移中的部门选择需要保存平台真实名称与路径；通用 JSON 或客户端标签不能
提供事实来源。平台目录唯一拥有租户组织事实，应用只保存有界展示快照。
在已有 Named Action `platformAccess` 增加 `selectedDepartments`，SDK 只提交
不重复的部门 ID，平台一次返回至多 50 个部门，顺序与输入相同。
必须声明 `name`，可选 `path`、`parent`、`fullPath`；调用者不得扩展字段。

## 不变量、权限和资源边界

编译器与 JSON Schema 保持相同声明，自动协商精确能力；Nest 请求作用域保留
当前动作、请求 ID、固定环境和 Connected Dev 证明。平台要求真实用户发起人、
gateway/Connected Dev 动作证明、当前 Head、租户和现有 directory:read 权限。
任一部门缺失或删除整组失败，不按姓名匹配，不接受标签，不回退应用组织副本。
实际部门范围沿平台已有 tenant/undeleted 选择器关系；没有另一个未实现的
每部门可见范围策略。结果 hash 来自事实与声明投影，时间来自数据库。
快照不是永久权限、审批路由或主数据授权。

## 契约和影响

影响 contracts 类型/Schema/native ESM+CJS 编译器、devkit 声明及双方 bundle、
Nest 业务目录/平台客户端、平台 capability/目录固定接口和中文 backend 专题。
不改变 V1 API、其他租户目录事实或未声明此功能的 V2 业务。新增接口只读，
不新增存储、定时任务、消息、生产数据或授权能力；复杂目录策略另立主题。

## 失败、并发和回滚

过期 Head、证明/发起人不符、缺能力、非法/过多/重复 ID 或结果不匹配均拒绝。
既有目录数据库快照决定结果，不建立另一个身份会话或缓存权威。
部署可独立回退到先前平台/工具组合；回退前撤回要求新能力的声明，保留业务
已存展示快照，不向旧平台发送新请求。已发布包不可覆盖或重选随机版本。

## 可证伪验收和发布输入

同源 ESM/CJS 保留声明且拒绝非法/扩大字段；devkit 双 bundle 与 SDK 强制 bound，
真实平台 service 拒绝非法证明、Head、目录权限、遗漏部门并保持顺序与 hash。
原封存联合候选矩阵通过（contracts 20、devkit 92、Nest 82、platform 229），
此次拆分只运行 047 中间态有界专题测试，最终实现字节保持原封存候选。
上线后仍需真实管理员目录选择与应用完整表单保存验收；单元通过不等于学校上线。

reviewedChangeset：`.changeset/selected-departments-native-facts.md`。
确定性输入为 contracts、devkit-core、nest 的 minor；正常 Changesets 流程决定
精确版本和依赖传播。根包分发、最终晋级验证、发布回执与学校验收由根执行者
在权威最新 master 上冻结；不得在 npm publish 时临时选择版本。
