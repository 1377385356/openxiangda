# 维护验证保留显式网络配置

2026-09-26 正式发布验证两次在 CLI 黑盒 create 的真实 pnpm install 达到
180 秒上限。同一黑盒直接运行通过。原门禁复现时观察到：源包构建完成，
应用本地 overrides 已写入，lock/node_modules 尚未生成，pnpm 子进程对
GitHub 的直连处于 SYN_SENT。相同 xlsx 0.20.3 制品用现有代理下载 HTTP 200，
禁用代理则连接超时；Turbo dry JSON 明确显示 strict 环境没有传入代理变量。

维护仓的 Turbo 配置显式透传标准大小写 HTTP/HTTPS/ALL/NO_PROXY 及 npm
proxy 配置。网络路由仍由操作者拥有，仓库不选择代理地址、不注入凭据、不改
用户全局配置，也不启用 loose 环境。透传值不写日志、制品或应用模板。
已有包版本、内容、锁文件和安装超时保持不变，不能通过跳过真实安装让门禁变绿。

该改动仅作用于维护仓 build/check/test 子进程，不改变应用运行时协议、公共
SDK 权限或客户服务器；不需要平台升级。代理缺失或失效仍会按既有有界诊断失败。
回退只需移除透传表；需要代理的维护机可能再次无法完成真实依赖安装。

验收在同一正式 Turbo 路径执行完整 CLI login/create/dev/check/deploy/status/
logs/rollback，随后按原发布门禁运行冻结候选，验证过的依赖字节不重选版本。
本次下载对照的 xlsx 制品 SHA256 为
`8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`；
它是对现有依赖的网络诊断，不是本次新增或替换的供应来源。
