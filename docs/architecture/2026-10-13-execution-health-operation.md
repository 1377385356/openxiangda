# 原执行健康的只读操作入口

平台已有应用管理权限范围的 execution-health 投影，可按原 UUID 分别表达准入、未来周期、暂停、claim、租约过期及人工核对。Devkit 的固定 application-operation catalog/transport 是 CLI 与 MCP 的 owner；增加 `diagnostics.execution-health`，不让 AI 拼任意 URL、选择恢复策略或重建执行。

输入仅原kind/id和已有environment，32KiB总输入预算不变；legacy-schedule只接受production，仍不能把1.x工作区交给V2引擎或编译器。角色/租约/token继续平台内部拥有，当前用户只沿原应用管理授权读取。

固定GET路由，无新状态、写入或自动重试。catalog明确权限、原owner和未知结果边界；未观测到或lease过期不能作为重放依据。关闭该目录项可独立回退；稳定V1引擎、其他租户、生产执行无变化。验证固定请求路由及环境、closed输入和原HTTP错误，开发gate使用verify:affected；无npm/站点发行。
