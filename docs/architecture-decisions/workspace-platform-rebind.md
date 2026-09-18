# 工作区平台换绑（link rebind）

## 问题证据与能力所有者

`.openxiangda/link.json` 把一个应用工作区绑定到唯一平台站点，`login` 与 `create`
在校验失败时 fail-closed，防止凭据跨平台发送。文档明确禁止手改 link 文件绕过检查，
但截至 2.21.0 没有任何受支持的换绑路径：应用从 A 站点迁移到 B 站点发布时，开发者只能
手工编辑 `link.json`（违背文档）或整体新建 checkout。同时交接、跨站点发布与换绑的
操作说明只散落在错误提示里，使用者无从发现正确顺序。

能力所有者：CLI 拥有工作区绑定与登录态文件（`link.json`、`session.json`）的生命周期；
平台拥有身份、应用、环境与部署状态。换绑命令只改本地绑定，不在任何平台产生远端副作用；
新平台上的应用初始化仍由 `create` 幂等完成。

## 稳定契约与不变量

- `openxiangda link` 默认只读展示当前绑定（appCode、baseUrl、登录态匹配、origin 归属）；
  `openxiangda link rebind --base-url <平台>` 显式换绑。
- rebind 只写入 `link.json`：`schemaVersion: 2`、`appCode` 取自当前工作区声明、
  `baseUrl` 经 `normalizePlatformBaseUrl` 归一、`environments` 清空（旧站点环境列表
  对新站点无意义，由后续 create/dev 重新获取）。不调用平台 API，不修改 git remote，
  不迁移、复制或删除任何登录凭据。
- 单工作区单平台不变量保持：rebind 之后旧 session 文件对任意命令仍被
  `assertPlatform` 拒绝；必须重新 `login --base-url <新平台>` 才能继续。
- `link.json` 记录的 appCode 与当前工作区声明不一致时拒绝换绑
  （`OPENXIANGDA_LINK_APP_CODE_CONFLICT`）——该目录属于另一个应用的检出，
  换绑会静默破坏来源追踪。
- 幂等：目标地址与当前绑定一致时只读返回，不重写文件。
- 可逆：`link rebind --base-url <原平台>` 即恢复；`link.json` 随仓库提交时也可用
  git 还原该文件。
- git origin 指向其他平台仓库时只产生诊断与下一步提示（`source setup --import`），
  不自动改写 remote——源码迁移需要新平台凭据，属于 `source` 命令的职责。
- 命令注册表风险等级为 write-local（仅本地文件写入）。

## 失败、并发、安全与边界

- URL 非法或携带凭据片段时由 `normalizePlatformBaseUrl` 拒绝
  （`OPENXIANGDA_PLATFORM_URL_INVALID`）；拼错但合法的地址在换绑当下无法被本地发现，
  失败在下一步 `login` 的 whoami 或 `create` 的幂等初始化处暴露，且可随时 rebind 回退。
- 并发：与既有 `linkApplication` 相同的直接写入语义，遵循仓库单写者约定；
  不引入新的锁或迁移协议。
- 安全：换绑不发起网络请求，旧平台 token 不会被发送到新平台；命令不读取、
  不打印任何凭据内容。
- 边界：`link.json` 读取沿用 dev 路径的 JSON 解析与 schema 校验；`environments`
  清空后由 create/dev 重建。

## 回滚与可证伪验收

- 回滚：rebind 回原平台，或 `git checkout -- .openxiangda/link.json`（文件随仓库
  提交时）；会话与远端状态未被触碰，无需平台侧恢复动作。
- 可证伪验收：
  - 单测覆盖 status（缺失/正常/会话不匹配）、rebind（幂等、appCode 冲突拒绝、
    URL 归一化、environments 清空、诊断生成）。
  - CLI 注册表测试的命令清单包含 `link`，且 `src/commands/link.ts` 存在。
  - `pnpm verify:affected` 通过；`docs:generate` 后 `docs/reference/cli.md` 与
    skill 参考一致。
