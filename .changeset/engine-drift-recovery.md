---
'openxiangda': patch
'openxiangda-cli': patch
'openxiangda-skill-kit': patch
---

引擎钉漂移不再锁死恢复命令，并给出确切恢复路径。

- 统一入口的 `update`、`version`、`changelog` 命令在钉位漂移（项目声明与已安装版本不一致）或依赖未安装时仍可执行：修复命令不能被自己要修复的问题拦住。未安装时回退启动器引擎，`update install --target workspace` 依然能完成安装。
- `WORKSPACE_ENGINE_PIN_MISMATCH` 的错误信息升级为两步恢复指引：先 `pnpm install`（锁文件已指向目标版本时一步修复），钉位互相不一致时用 `openxiangda update install --target workspace` 递归统一全部声明、锁文件与安装。
- 业务命令（check/deploy/dev 等）保持严格 fail-closed 不变；随包文档补充该恢复路径。
