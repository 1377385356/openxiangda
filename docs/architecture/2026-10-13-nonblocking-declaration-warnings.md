# 声明阶段不能把警告升级为错误

本轮问题证据：已发布 SDK 2.66.0 / Devkit 2.63.0 消费一个已有 external AI 操作但未声明结果核对的应用时，context、workflow status 和 check 在 defineOpenXiangdaApp 的声明构造阶段抛出 APP_CONFIG_INVALID。诊断本身是 AI_EXTERNAL_RECONCILIATION_MISSING / warning；后续 validateAppConfig 与 check 已明确只按 error 阻断。

能力所有者是 Devkit 声明校验，不是应用业务操作。修复仅统一声明阶段与后续门禁的 severity 语义：warning 不阻断构造，仍保留在 validateAppConfig/check 输出；真实 error 仍阻断，混合 error/warning 的异常只携带阻断项。外部结果未知仍需原状态核对或人工核实，不新增核对端点、不宣称外部操作可安全重放。

影响限 V2 声明，不修改 V1、平台授权、业务数据、包摘要或已发布的 npm 字节。无并发写入、新状态库或外部请求；资源与失败边界不变。回滚为独立提交；修复源代码不等于已发行。回归应通过构造、loadAppConfig、compileApplicationSources 确认警告保留，并证明真实 schema/声明错误继续失败；受影响门禁在隔离 WSL 运行。
