# Unit 3：应用源码智能体及原生任务

日期：2026-10-12。方案权威：Claude 06–13，后者覆盖较早的冲突语义。本轮为源码实现与测试，不包含生产部署或 npm 发布。

## 问题证据与所有者

现有 Agent Center 的应用助手提示词/任务只能人工配置，ai.agent 仅用于 Nest 操作；没有后端的 CRUD 应用无法声明自己的业务任务。原生来源已补齐 3Q、2R/2O、2L 和 2H，供智能体使用同样的字段值、查询和选择权限。

智能体定义归应用源码 → 编译器 → AppVersion，单独有摘要的 agentDefinitions 工件。运营事实归 Agent Center 原有 profile 行；数据/行/字段授权及写入归原有 Data API；记录指针归既有工具回执；浏览器身份、环境、部署归既有平台所有者。工作流设计助手与租户平台助手保留现有边界。

## 定义、可用性与版本

应用声明 code/name/purpose/instructions/starters/tasks。文件提示词在本机编译期间有界读取并内联，不能越过工作区或读取协作/凭据文件；提示词最多 16000 字符，每个助手最多 20 项任务。无 agents 的应用保持本轮前的工件字节行为。

source profile 以 tenant/app/code 确定性 id 惰性建立，部署及回滚不写 Agent Center。profile 仅有运营状态；operations.production/preproduction 分别持有暂停与模型连接。是否声明每次由该环境当前 AppVersion 计算，不存 availability。删除一环境的定义不影响另一环境，管理员暂停不被发布/回滚覆盖。source 行保留旧服务器 status=paused 与哨兵能力，旧版本不能误运行。Settings 两个环境并列展示只读版本/摘要/指令/任务，运营字段由管理员改；拒绝 source 字段覆盖。

运行冻结 AppVersion 与定义摘要；每步检查当前可用性/Head。Head 改变 → superseded，保留完成回执，后续消息加载新定义。角色变更按当前权限重新拒绝。form 任务遵守引用写入 readiness；默认 report 环境仅有 view 任务，不能凭包或模型宣称可写。

普通字段值 JSON Schema 的纯规则移至 contracts/native-compiler，原 public 路径直接 re-export；同一 owner 供普通表单、源码任务编译和平台重现验证消费，不放宽 native compiler 的依赖隔离规则。

## 原生任务与一个字段表示

view 绑定已存在、生成 list 的 CRUD 视图；keyword/filter/sort/select 来自同一标准视图查询构建器，并可缩小。模型只给有界过滤提示，不能给 where/select/order。只返回当前可读的视图字段。

form(create/update) 绑定已存在的生成普通变更；mutationOwner 非 native 或视图关闭时编译拒绝。fields 必须属于表单、可写且非系统/审计字段；首批不接文件/图片/签名/子表/富文本/JSON 等无法提供完整单控件卡片的字段。create 依赖字段需列入或有默认值；update 修改绑定字段必须包含依赖引用，允许引用利用保存的不可读绑定。全部依赖传递检查。

新 interaction contractVersion=2 使用普通字段值和命令 schema；旧 v1 字符串卡片验证不变。描述符只有 fieldType/path/label/required/source，不创建 valueKind 或另一份值 DTO。模型标签提示只允许 label，不接受 value/resourceCode/snapshot。精确唯一选择由 2H 各 owner 内部入口证明；写任务非精确单候选仍由人提交。Decimal 精确值只接受字符串，时间必须有 offset。

update 是真实 partial patch：未触碰缺席、设置为普通值、清空为普通 null/空数组表示。可读同值删除，全部无变更不承认命令、不建 binding/receipt/suppressionKey。不可读原值不出响应，不进行判等，显示当前值不可见。卡片 revision 冲突重新读取基线，保留设置/清空状态；确认只列改变字段。

## 回执指针、分页和模型隔离

记录 handle 为 succeeded view/detail 工具回执的 tool id + row index，无记录 id/revision 或密钥。服务端核对同租户、应用、会话和用户，读取 presentation 里的目标后按当前 Head/权限重新读取。回执未保存完整 presentation 不发句柄。会话删除使句柄失效；资源消失或记录不可见给不泄露身份的错误。

更多结果通过 continue=上次 tool id，加载存储的标准化 query、递增 offset，最多 10 页；禁止混入新过滤/排序，Head 改变拒绝继续。排序以 id 作最后稳定项。模型与 presentation 都没有原始 Data/field-source/directory cursor。

模型 result 仅含标签、格式化 scalar 和 handle；客户端 presentation 持有有权查看的原始值、记录身份及链接。已核实现有 worker 历史 SQL 只选 t.result，未选择 presentation；新增测试同时检验即时返回、储存 result 与后续 transcript 均不含记录身份/引用值/游标。

## 命令承认、失败与并发

工具传输承认记录 call id/原始请求 hash，状态 running。只读标准化后，在单一事务中承认 canonical typed command，存其 hash/invocationKey/intentDigest/receipt scope，转 dispatching，才允许实际分派。running 无 binding 的中断是确定未执行；dispatching 中断才是未知。

同用户跨会话 suppressionKey 由 tenant/user/app/env/capability/canonical(target id,data) 计算，排除 expectedRevision。dispatching/未解决 unknown 上以唯一索引保证并发相同命令只承认一次；成功即释放，人工或权威核对通过原有回执路径释放。confirm 仍必须由当前用户签认，worker 不能签认。

## 安全、资源与回滚

目录、关联、范围均使用原有当前用户角色并集，不增 active RoleSession 或新凭据。源文件引用、任务数、字段/数组/输出大小、查询页数、owner 精确读取两项和现有租户/用户配额均有界。参数化 SQL，不执行模型脚本。SDK 公共变更附 Changeset，SQL 只走正式迁移链。v1、其他租户及无 agents 的应用用回归测试证明不受影响。

可回退新增原生能力；source 哨兵保证旧 server 不会执行新 profile，新增回执与 interaction 版本保留可读。删除复制的助手模块会移除应用入口，身份/数据/部署权威不变。

## 可证伪验证

### 3C / 3D 决策门（Claude 14，2026-10-12）

证据：现有人员候选 Native 入口在原事务中授权字段、保存记录及 revision；通用目录不能证明角色候选资格。范围字段是普通 scalar，直接格式化会泄露范围 ID。Claude 14 据此修订路由，Codex 已读 owner；scope.resolveExact 使用 owner SQL 等值比较且 limit=2。

能力 owner：编译器从字段声明与 data-policy 的 dimension/valueSource 派生选择器路由（directory/user-candidates/field-source/options/scope），owner 在运行时重新授权。指令与 coverage 固定在版本制品中，不接受客户端路由。普通 command/card 值形状不变。record-scoped candidate 的 native create 明确编译拒绝；update 保留 saved record/revision；修改 scope 时依赖 candidate 必须在卡片上清空。多维 scope 字段保留卡片，不向模型开放提示或原值。

契约：增加 descriptor.selector 与只读 task coverage，hint 按 route；共享 compiler、SDK 调用方及平台重现同一份 authz 输入。scope 输出按当前读取权威批量取标签，不能解析时显示不可见。人员 exact 入口只内部使用，复用 Native 授权分支，不新增 HTTP exact 参数或流程/动作伪上下文。

阶段边界：3D 先完成 source read 任务真实 worker 路由、describe 提示投影、存储 result/presentation 分离以及 Head 变化的 superseded。native form 在完整 interaction v2 与规范化后命令承认完成前保持不可执行、不宣告 capability。默认 report readiness 不扩大任何写权限。

失败/并发/资源：每步重读定义及 Head；变更终止新工具调用并保留已有业务回执。仍由既有 run lease/fence 和 receipt owner 排他；不增加身份/数据/路由 owner。exact 两条、分页十页、scope resolve 每批50值、每页最多100行及48000字节 presentation，禁止无限查找。回滚为撤回新增路由/能力，旧 profile 哨兵仍不可运行；stable 1.x、无 source agents 的制品与旧 v1 卡片不变。

可证伪检查：非角色用户不可通过 candidate 写提示；former member 可用于 read filter；record-scoped create 拒绝；scope scalar hint 不接受 ID；多维 scope 无模型提示；descriptor 篡改无效；即时 result/存储 result/下一轮 transcript 均不含业务 ID/revision/cursor；read 任务仅当前权限字段，Head 变化停止；旧路径回归。源码验证与 npm、部署、真实模型/角色/业务验收分别记录。

分别验证编译、源码运行、模型固定工具协议、真实模型、浏览器、真实角色及业务读回。Unit 3 首先在固定工具调用下证明：合法/非法声明；双环境独立与回滚；Settings 不改 source；只读任务/阻断写 readiness；unique/ambiguous 与错误值无命令；句柄拒绝外部会话/用户；无记录身份进入 model/history；部分更新/no-op/隐藏值；并发唯一承认；未承认中断与已承认 unknown 的区别；Head 变化 superseded；旧 v1 路径不变。Unit 4 再实现 facade、headless SDK、Field Kit 卡片及访客助手，完成真实模型与业务验证。
