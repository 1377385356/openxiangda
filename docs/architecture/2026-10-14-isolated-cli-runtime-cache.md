# 隔离 CLI 门禁的宿主运行时缓存

状态：实现并通过影响验证，2026-10-14。此修复只涉及维护者验证宿主，应用登录和业务授权不变。


本批原 CLI 创建生命周期单独运行通过，综合门禁在 source-build/180 秒依赖安装阶段失败。隔离 HOME 的测试仍保留登录/凭据隔离；Corepack 只持有包管理器二进制，显式 COREPACK_HOME 必须经 Turbo passthrough 保持同一固定版本缓存。夹具内源码候选构建并发限制为 2，依赖仍真实安装，所有创建/开发/部署/回滚断言不减少。复用 Linux 包管理器缓存不复制 node_modules、不改锁和工具版本、不扩大业务身份范围。记录原失败和实际复跑；发布读取同一固定版本与候选字节。

验收：普通源码构建通过；原单独 CLI 生命周期通过。综合门禁先失败于 source-build，再暴露180秒安装超时；明确 Corepack passthrough、固定缓存、候选构建并发2后，`verify:affected --concurrency=2` 使用真实 origin/master 变更基线完成27项任务，含完整CLI生命周期。失败没有作为通过；发布不使用开发期的 prefer_offline 配置。
