# 原 TEST 验收数据批次的工具入口

后端 verification owner 已提供 preparing/active/stopped 来源、原 Native receipt 归属、stop fence、原 repair canary/remaining 与验空 adapter。原 application operations 目录统一拥有 CLI/MCP 的操作发现和有界输入。新增固定 TEST 操作，不另建 cleanup CLI、任务账本、身份前缀判定或远端通用 HTTP 通道。

应用和平台目标继续来自当前 workspace；tenant、actor、appCode、原 environmentKey 不能自报。prepare 显式 requestKey、当前 AppVersion/Head、1..12 参与者和期限/配额。参与身份由原权限 owner 管理并保留。status/preview 是只读；stop 使用原 owner 栅栏；execute 只传预览 digest 和 canary/remaining，不从 AI 输出再拼 before-image。旧 acceptance 无 run，不自动回收；本入口拒绝 production。

失败/并发：同 requestKey 保留原计划与 TTL；停止超时先读 status；修复丢响应先读 preview 的原 repairReference，再同 digest 继续。pending 清单不被新清单替换。仅原 owner 完整读回 purged 表示本批 owned Native 数据验空；不证明参与者删除、全应用为空或客户业务验收。其他 tenant/V1、workflow/files/events/notifications/external/load-cohort 不纳入首轮。

输入由现有 32KiB closed schema 校验，prepare actor/role/department 数量有界；prepare 的 TEST platform key 由映射注入，其他 cleanup POST 不添加服务器契约不接受的字段。敏感一次性 loginUrl 沿用原验收入口，不写长期文档。回退移除操作目录 adapter，保留平台原 registry/receipt/audit/repair。公开 devkit 包附 minor Changeset；不物化版本、不执行发行或客户清理。

验证：真实 transport 到固定路径，未知 app/tenant/actor/body 字段及 production 拒绝，prepare 的环境映射，execute 不接受 plan/任意 URL，MCP/CLI 共用 schema；verify:affected 和文档/正文/MCP生成一致性。平台执行由后端独立 PG/迁移门禁验证，工具输入测试不冒充站点和业务验收。
