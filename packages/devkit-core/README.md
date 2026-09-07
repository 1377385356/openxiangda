# openxiangda-devkit-core

CLI 与 MCP 共用的应用服务：加载声明、编译契约、能力预检、统一检查、制品密封、部署及状态查询。本包还提供同版本中文资料读取，以及 CLI/MCP 共用的环境和生产晋级参数处理。

Connected Dev 在回环地址运行前端、可选 Nest 和连接代理，开发会话令牌只保留在内存。平台负责身份、授权、业务数据和部署状态；本地编译器负责确定性产物。

应用通过 `openxiangda` 根包消费能力。使用说明运行 `pnpm openxiangda docs`。
