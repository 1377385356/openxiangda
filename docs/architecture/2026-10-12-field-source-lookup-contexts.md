# 2L：字段来源的筛选与保存记录上下文

日期：2026-10-12。设计依据：Claude 同一会话设计 12（lookup contexts and update-card semantics）。本轮只实现共享选择上下文；不发布包、不部署生产。

## 问题证据与所有者

当前 SurfaceFilterControl 为资源引用发送 operation=update，字段来源服务先要求宿主更新权限，导致只有读取权限的列表使用者不能筛选。普通更新来源接受完整客户端 bindings，无法利用不可读的保存字段，也与引用写入断言的“保存记录合并编辑”不一致。

字段来源及候选仍归 Native field-source owner；记录及行/字段更新授权仍归 Data API/resource/session owner；目录归 directory owner。SDK 控件只传来源意图、记录 id/revision 和真实编辑，不复制权威或私有字段。

## 稳定不变量与受影响契约

- 同一个来源增加 filter；宿主按 read 授权，目标保持完整当前用户角色并集下的读取投影及 RLS。写入 filters/bindings 不用于筛选。
- filterWhere 使用至多 20 个常量 eq/in 条件的数组，只收窄目标身份；不允许绑定，复用现有查询编译器。写入断言不使用 filterWhere。
- filter 拒绝 bindings（包括空对象）及 record/launch/action/task。SDK closed schema 与服务端一致。
- 普通更新可传 record={id,expectedRevision}。Data API 内部入口检查宿主字段/行更新权限，在同一事务读取原记录，校验 revision，校验绑定编辑的类型与写入权限，返回服务端内部保存值。目标查询仍使用未缩窄的原用户角色并集。
- record 与 create/filter/launch/action/task 互斥；已有 task/action/launch 意图保留原所有者。
- 普通更新控件发送记录上下文，只提交实际编辑的绑定字段；原值留在服务端。未完成输入的空绑定使用 null，产生零候选；最终提交仍验证必填规则。agent 部分 patch 及 no-op admission 在 unit 3/4 实现。
- 目录筛选使用现有检索入口的 purpose=filter，允许历史停用项并标明“已停用”。普通选择/写入维持有效项规则。默认目录检索、具名人员选择不变。
- 范围维度筛选由现有 scope-value owner 接受 filter，按 read 的字段/范围授权并包含 disabled 项。SurfaceFilterControl 使用独立的 renderScopeFilter 显示扩展，不再伪装成 update 编辑上下文。
- 静态选项定义没有 retired 标记；本轮不会恢复已经从声明删除的值。

## 失败、并发与资源边界

保持 REPEATABLE READ、现有有界搜索/页大小/游标。资源游标绑定操作、记录版本、环境 head 与有效绑定 digest，每次继续查询重新核验当前权限；目录游标同时绑定用途和授权版本；不能跨筛选/更新或跨版本复用。旧 revision 返回现有 REVISION_CONFLICT；越权/非声明绑定及非法上下文在返回候选前拒绝。lookup 不加写锁、不写业务记录；最终提交继续以 expectedRevision 及普通字段/行/引用断言裁决。

不可读绑定绝不返回 response/cursor；正确候选集合带来的间接推断是设计明确接受的行为。应用端不可读字段不得因缺失值自动覆盖原值。目录仅在显式 filter 用途返回停用历史项，不授予数据写入或成员管理权限。

## 影响及回滚

范围为 V2 contracts/compiler、field-source/Data API 内部入口、directory search、Field Kit 与普通生成表单。1.x 无运行时依赖；不新增表或迁移、不改平台身份/数据权威。含引用/目录字段或来源维度的编译包要求 data.field-source-contexts=1.0.0，部署此契约时服务端必须先于新 SDK；独立回退源码组合。仅 UI 回退会恢复旧筛选限制但不改变保存数据。

## 可证伪验证

只读宿主可筛选；不能读取字段/目标则拒绝；历史不可写目标在筛选可见；filterWhere 仅用于筛选。filter 混入任一写上下文拒绝。更新保存绑定、可写编辑覆盖、不可写覆盖拒绝、过期版本冲突，私有绑定不出响应。目标读取保留完整角色并集，普通查找与断言谓词一致。目录筛选显示停用项、普通查找仍 active-only；游标跨 purpose 拒绝。编译器保持 filterWhere 到 source/surface，浏览器 PC/mobile 实际发出正确上下文。运行 SDK verify:affected 与受影响后端测试/类型检查。此证据不替代真实租户/业务验收。
