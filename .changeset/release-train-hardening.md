---
'openxiangda': patch
'openxiangda-cli': patch
---

materializeApplicationModules 从 openxiangda/config 公共出口再导出；发布火车三项加固。

- `openxiangda/config` 新增 `materializeApplicationModules` 再导出：模块化迁移（GAP-MODULE 系列验收脚本、data.resources → defineApplicationModule 迁移工具）不再需要引用 devkit dist 文件路径。
- 打包验证对 `openxiangda docs --json` 类命令改为静默捕获（成功时仅打印字节数摘要）：整篇文档内容的超长单行 JSON 不再进入发布日志，消除日志噪声与管道风险。
- 发布进程锁自动探活回收残留锁：持有者进程已死（如被杀的 runner/终端）时不再需要人工核对 pid 后手动删锁。
- 新增 `pnpm release:prepare`：把"物化版本 → 提交 → 推送"收敛为一条命令并给出发布触发命令。
