# 工作区依赖输入边界

状态：实施，整链路 A2。证据：原胶囊扫描递归所有非构建目录，`.local` 下历史运维工程的 `package.json` 会阻塞当前应用，即使不属于 workspace 或官方 Docker 输入。

所有者：devkit 的 workspace/capsule 扫描器；Docker 输入规则继续由 `backend-image-inputs` 拥有，扫描和 OCI 输入摘要共用同一规则。CLI 只消费诊断。

不变量/合同：root manifest、包管理器声明的工作区、这些包的本地 file/link 依赖及实际后端有效 context 内的 manifest 都检查。显式隐藏工作区、未提交包、ignore 中被 workspace 声明的包仍检查。不把 gitignore 当依赖排除器。没有工作区声明时保持原保守递归。未知 Dockerfile 保持完整有效 context，不猜 shell 依赖。

并发/失败：超预算、不合法 YAML/glob、本地链接越界或缺失均明确拒绝；循环依赖按真实路径去重。扫描不写应用数据，期间源码变更仍由原构建输入校验处理。支持当前 pnpm 与 package.json workspaces 的 glob/排除语义；复用标准解析器，不手写 YAML。

资源/安全：最多 100,000 扫描项、2,000 manifest、单 manifest 1 MiB、配置 256 KiB、60 秒；真实目录链接不能逃出工作区；不跟随 node_modules 或 Git 对象。

影响：仅 V2 维护工具的本地预检；V1/线上应用没有运行态变化。诊断补具体输入错误，不改变严格版本胶囊。

回退：恢复保守全树扫描；保留全部 `.local` 文件和运维证据。可证伪验证：历史目录不误判；显式隐藏包、实际 context、链接闭包仍拒绝未固定依赖；超预算/越界/排除语义测试；原 devkit 测试通过。
