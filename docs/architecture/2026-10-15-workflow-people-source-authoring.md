# 完整原生人员来源与有界参数编辑

## 问题、用户目标与当前证据

用户要求教师可灵活配置全部审批流、完整部门/主管等来源与中文变量参数，并先本地统一验证再发布。当前DepartmentSupervisor虽在新节点来源中可选，但不在conditional leaf family；已发布节点patch只能接受指定人员/角色。人员编辑器只复制精确来源，不能改level、终点、连续办理或无人策略。服务端投影还会删去非角色字段，单改UI无法实现目标。

## 唯一所有者及决定

平台仍唯一拥有身份、当前AppVersion发布目录、组织/成员解析、共享草稿、CAS/原结果、在途快照及发布。应用声明实际事实/来源/中文名称。V2 authoring新增peopleSources：每项包含中文title、原生entry与parameters；parameters仅能给本provider已有字段指定枚举或整数范围。目录由已发布源码生成，浏览器不能新增目录、模板、参数上限、业务provider或授权范围。无声明保留旧的精确来源行为。所有新/已发布/条件人员统一同一纯校验，不用假条件持久化普通来源。

部门主管加入标准conditional leaf，使用已有运行解析器；departmentIdFrom等路径必须处在当前节点可用事实中。逐级主管沿用现有from/until/continuous/missing协议，连续必须sequence，部门/人员缺失失败关闭。应用扩展四流时保留已有节点ID/目标/默认来源、具名步骤、source-base和历史版本。发起人部门上下文及新增事实只能由代码显式声明，不能从中文或未发布模型猜出。

## 参数、失败与权限边界

默认entry的未开放字段不变，provider、scope dimension、routing、委托规则和业务关系实现不能通过通用输入改写。范围值只给代码明确枚举；min/max只能在默认来源的接收人数上限内收紧，保持1..200及min<=max。任何非法/未知字段、源、路径、非整数、越界、伪造上下文或未发布角色均拒绝。UI保留不完整输入以供修复，不自动规范化旧值、不渲染即写入，不让英文编码成为教师选择说明。

普通patch、conditional和画布仍分别遵守原幂等/CAS/失权/未知结果保护。服务端按模板准入的完整来源投影，不能再删去主管字段，也不能给它套上另一旧来源的scope。主线、npm七包、共享validator、正式平台组合/应用TEST必须配套；旧服务端不被UI虚报为支持。无需SQL；1.x、不启用V2流程的应用、其他租户不改变。当前任务不发起/重放历史审批、通知、签署或财务，不晋级production，不触碰现场未保存草稿。

## 可证伪验证与回滚

共享契约：模板/源码schema、同provider参数范围、人数上限、未知与恶意结构拒绝；部门主管条件叶；普通已发布/条件/新节点一致；错误node/context、未发布参数、错mode及未来步骤事实拒绝。SDK：真正选择来源与所有参数、普通/条件切换、dirty/CAS/unknown/readonly、中文名称与exact typed值。后端：真实validatePatch和配置投影、冻结current-task与后续-entry读回、角色/目录失权和原结果。整图：首节点插入/删除、补正重审入口、保存、连线/鼠标、AI真实proposal→预览→确认→应用→保存。最后统一发行/TEST及真实角色，不能用组件或纯函数通过冒充整体验收。

回滚UI可独立撤回；源中已采用新authoring字段后不直接回退到不理解该schema的旧内核。保留兼容内核及历史AppVersion/flow绑定，使用正式回执回滚，不删迁移/历史/原操作。本文记录开发授权内的实现决定，不是用户业务验收通过，也不是新发布成功。

## 本地证据和剩余门禁（2026-10-15）

57共享契约断言、18实际SDK辅助/SSR断言与当前SDK类型检查已通过；新增未来事实、组织上下文、范围维度和不执行accessor的负例。Space5实际源码组件验证部门字段/level/fallback与主管链until/continuous/missing的exact typed数据，及禁用保留；是无真实角色夹具。新服务端明确nativePeopleAuthoring能力，旧平台缺该标志时已发布节点保持旧编辑路径。原始leaf禁止部门的负例改为非法level0并增加合法dept正例，未删关闭/范围断言。

实际已发布节点编辑器经本地合成HTTP完成6组可重复回归：普通/条件切换后完整参数保留、503冻结与相同原operationId/请求恢复、CAS双修订重读且整体保留来源、条件规则原生叶保存、连续主管自动保存sequence、只读与旧平台标志关闭。测试发现并修复native provider未注册导致切换和保存丢值的表单生命周期问题。可用现有Ego TaskSpace运行workflow-native-people-editor.ego.mjs，不另建浏览器，不替换非夹具页面，不覆盖脏/未知输入。合成HTTP不证明真实服务、组织解析、模型或角色通过。

独立后端克隆干净master1daa7fcc已准备本主题变更，原脏子模块不动。源级依赖映射调用真实validatePatch/project，4新增和9既有conditional authoring断言通过；原node-configuration完整服务套件在Mac旧依赖缓存因uuid/v4及http-errors依赖解析失败，未宣称套件通过。完整Linux依赖、后端类型/完整套件、UI普通/条件切换与HTTP保存未知结果、四流源码接入、AI真实模型、正式七包/平台组合/TEST/角色验收仍未完成。

网络独立发现：CONNECT代理和raw桥ready各200；Node24需在命令范围使用NODE_USE_ENV_PROXY=1。auth status已真实authorized，未抽取/更改会话；workflow status仍报PLATFORM_TRANSPORT_FAILED，不能把授权有效当作source状态或完整业务通过。后续继续官方已授权开发代理与只读诊断，不回到向日葵、不绕证书/用户操作保护。
