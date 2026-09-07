# 可复现的后端模板发包范围

2026-09-06；主题：排除本地模板安装和检查产物。

CI pipeline 2614 / job 5912 的完整源码检查与 72 个打包浏览器测试通过，参考应用检查因 `openxiangda-devkit-core@2.0.0-alpha.112` 的实际制品 integrity 不同停止。逐文件比较发现唯一差异是 `templates/backend/node_modules/.bin/*` 的绝对路径和 `templates/backend/.turbo/*` 的执行日志。`files: ["templates/"]` 会将这些本机生成内容带入 tarball。

devkit-core 拥有后端模板源文件，发布入口拥有制品校验。将后端模板发布范围改为维护的 Dockerfile、package.json、tsconfig.json、src 与 test 文件，保持模板内容和应用生成逻辑不变。在所有新候选包的内容检查中拒绝 node_modules、.turbo、.git、coverage 和浏览器测试输出目录；历史包只读比较，不重新解释或修改其字节。

不复制或编辑冻结制品、不手工替换参考 lock integrity、不关闭校验。增加 devkit-core patch Changeset，由 release:version 推导所有依赖版本；更新参考应用锁文件后通过正式 release 脚本重新验收／发布。目录字节比较、污染模板目录后的真实 pnpm pack 和发布边界测试必须证明相同源码生成同样字节且没有本机路径、日志。失败保留结构化错误并停止；已发布版本不可覆盖。

只影响工具链 npm 分发，无平台数据库／应用运行时变更。回退使用先前已发布工具链版本；不能回退已经占用的 npm 版本。
