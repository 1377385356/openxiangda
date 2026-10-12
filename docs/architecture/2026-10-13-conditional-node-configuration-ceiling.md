# 条件人员覆盖的整个规则值与校验上下文

状态：实现中，承接已确认条件人员方案；不代表平台 capability 已开启。

所有者：contracts 拥有配置形状、全叶子事实/上限校验；平台配置服务拥有 AppVersion 来源、实际人员、CAS、激活版本与在途版本。浏览器的校验上下文只能用于提示，不是平台授权证据。

不变量：`assignee` 是一个完整值，`cases` 和 `otherwise` 不做合并，条件顶层不能混入平铺人员的 min/max/routing。条件 patch 只有在具备明确的 definition/nodeId/已发布来源上下文时通过共享校验；旧调用缺上下文明确拒绝，不把纯形状通过当作授权。可新建标准来源的类型取自原节点 `administration.assigneeProviders`（平铺旧节点保留原默认 provider）；复杂来源只能原样复用冻结默认或权威已发布来源。范围维度也由平台权威上下文提供。

审批方式和按钮仍通过既有配置校验；条件校验使用 patch 后的节点 mode，因此未选中的连续主管链也约束 sequence。CC、emptyPolicy skip、缺少/可选/未可用事实、未发布复杂来源全部拒绝。20 cases/16 KiB，禁止嵌套，每个叶子的实际人员和角色由平台另外检查。

本阶段只增加正式类型和共享纯规则入口。不自行新增配置表/业务数据，不发布生产，不向平台 capability 宣称端到端已完成。后续必须正式 npm 回读、平台消费原包、所有 pinned versions 的来源/事实校验、隐私 source DTO 与 PC 画布往返验证后启用。

验收：现有平铺 patch 行为不变；缺上下文拒绝；whole-value 条件通过且不变更输入；mode/未命中叶子/otherwise/CC/skip/权限/来源/事实/大小边界均拒绝。独立 Changeset，回退是撤新增 conditional patch 类型与第五参数校验；已有 flat 配置没有数据迁移。
