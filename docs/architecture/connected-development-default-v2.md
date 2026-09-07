# Connected development is the OpenXiangda 2.0 default

状态：2026-08-22 增量 overlay 首切片已完成 live 验收

## 决策门禁

| 项目 | 决定 |
| --- | --- |
| 问题证据 | 当前 `openxiangda dev` 启动本地平台模拟器和 Docker PostgreSQL，生成本地 OAuth、事件 Secret 和持久状态；它不能快速验证真实平台数据，也违背已确认的 CRUD 黄金路径。 |
| 能力所有者 | 平台拥有登录、远端环境、业务数据和短期 Dev Session；CLI 拥有本地进程与 loopback proxy 生命周期；Vite 拥有前端 HMR；Nest 拥有本地自定义动作。 |
| 稳定不变量 | 工作区 appCode 必须与 link 一致；登录会话只能发往 link 的同一平台；有 preproduction 时优先并向用户显示为 test；否则连接 production 并持续显示正式数据警示；普通 CRUD 始终由远端 Data API 执行。 |
| 受影响合同 | `openxiangda dev` 默认语义、CLI flags/JSON 输出、devkit connected proxy、官方模板开发代理和 Nest connected-development 当前用户入口。 |
| 失败与并发 | 未登录、未 link、应用不存在、没有可用远端环境或 Dev Session 创建失败时，在启动任何子进程前失败；任一 Web/Nest 子进程异常退出时终止全部子进程并撤销 Dev Session；同一工作区的第二个进程依靠端口占用明确失败，不建设 lease。 |
| 安全与资源边界 | 所有本地监听只绑定 `127.0.0.1`；开发 access token 与 Dev Session token 仅保存在内存，不写文件、不进入日志或返回值；proxy 只将登录凭据发送到 link 校验过的 origin；首版只访问已发布资源。 |
| 回滚边界 | 旧本地平台、Docker/PostgreSQL 和本地数据生命周期已破坏性删除。回滚必须整体回退对应工具链提交；不影响 1.x、其他租户、平台已发布版本或远端业务数据。 |
| 可证伪验证 | 无 Docker 可执行文件时 `dev` 仍可启动；远端请求含 Bearer 和 `x-openxiangda-dev-session`；`/api` 与 App API 路径进入本地 Nest；test 优先；production 页面持续显示警示；SIGINT/子进程退出不留孤儿且执行 revoke；`--json` 不混入状态日志；任何输出均不含 token。 |

## 首切片合同

```text
openxiangda dev
  -> load workspace + .openxiangda/link.json
  -> validate/refresh OpenXiangdaDeveloperSession
  -> list remote environments, prefer preproduction as test
  -> create a 30-minute published-resources Dev Session(manifestDigest)
  -> start loopback connected proxy + Web HMR + Nest watch
  -> /service/* -> linked platform + developer bearer + dev-session header
  -> /api/* -> local Nest
  -> linked /openxiangda-app-api/* -> local Nest
  -> refresh the Dev Session before expiry
  -> revoke and terminate children on exit
```

平台 Manifest overlay 尚未进入本切片。CLI 保留 Manifest digest，并通过一个集中式
Dev Session header provider 注入 token；平台以后支持 overlay 时只替换会话创建结果，
不改变 Vite、Nest、Data Client 或业务代码。

## 增量 overlay 首切片决策（2026-08-22）

| 项目 | 决定 |
| --- | --- |
| 问题证据 | live `openxiangda dev` 已能连接 test，但会话返回 `manifestOverlay=false`，本地新增字段必须先 deploy，仍阻断最短 CRUD 迭代。 |
| 能力所有者 | CLI 编译并提交当前 config bundle；平台 Dev Session 在 Redis 持有短期 overlay；Native Data 继续拥有唯一物理表、Data API 和 RLS。 |
| 稳定不变量 | 不创建第二个 Head、AppVersion、逻辑数据 revision 或授权状态；无 Dev Session header 的请求始终读取当前发布 Head；行权限继续由当前发布 Head 的 RLS 判定。 |
| 受影响合同 | Dev Session create 增加 `configuration`；成功会话返回 `mode=manifest-overlay`、`manifestOverlay=true`、`additiveSchemaSync=true`；Native Data Resource 仅为该会话合并资源声明和字段权限。 |
| 允许的增量 | 首切片只允许 preproduction 中已发布资源新增 nullable 字段/索引，以及这些新字段的字段权限；资源操作 capability、data policy、既有字段类型和既有字段权限不得变化。 |
| 失败与并发 | overlay 非增量、digest 不匹配、资源未发布或 production 请求在启动本地子进程前失败；物理列使用 `ADD COLUMN IF NOT EXISTS` 幂等准备；多个会话只允许兼容的同名字段。 |
| 安全与资源边界 | configuration canonical JSON 不超过 512 KiB，资源不超过 100、每资源字段不超过 500；overlay 只存在于 Dev Session Redis TTL，token 仍只在内存和 header 中。 |
| 回滚边界 | 撤销/过期 Dev Session 立即移除逻辑 overlay；已新增的 nullable 物理列作为无引用的加性基础设施保留，后续正式 deploy 幂等接管，不删除业务列。 |
| 可证伪验证 | 同一应用新增一个未发布 nullable 字段后直接 `openxiangda dev`，Data Resource detail 能看到字段且 create/update/read 成功；不带 Dev Session 的远端请求看不到字段；退出后新会话撤销。 |

该切片故意不做新资源、删字段、改类型、row-policy overlay 或 production overlay。它先关闭
“一个字段修改后无需 generate/deploy 即可在本地页面生效”的黄金路径；更大的 overlay
必须在此合同通过 live 验收后另开架构主题。

## 首切片 live 验收结果（2026-08-22）

- 本地黄金应用使用 `openxiangda-cli@2.0.0-alpha.60`、`openxiangda-devkit-core@2.0.0-alpha.36`、`openxiangda-nest@2.0.0-alpha.34` 启动连接开发。
- `dev-sessions/current` 返回 `mode=manifest-overlay`、`manifestOverlay=true`、`additiveSchemaSync=true`，并声明 `instruments.maintenanceNotes` 为增量字段。
- Native Data Resource 元数据即时包含 `maintenanceNotes`；不执行应用 deploy，直接完成该字段的 create → update → read/list → delete，最后测试记录数恢复为 0。
- 物理列按幂等可空字段同步，正式发布仍由 AppPackage/deploy 负责；本次 live 会话未改变 Head/AppVersion。

## 最小验收

1. 登录并 link 一个已有 preproduction 发布版本的应用，执行 `openxiangda dev --no-open`。
2. 修改 Web 与 Nest 源码，确认 HMR/watch 生效；从页面请求 `/service` 和 App API，分别确认远端 Data API 与本地 Nest 响应。
3. 停止 Docker 后重复启动，命令仍应成功；终端、`--json` 与进程参数不得出现 access token 或 Dev Session token。
4. 发送 SIGINT/SIGTERM，确认 Web/Nest 子进程退出且平台 current Dev Session 已撤销。
5. 对只有 production 的验收应用重复启动，确认终端警示且页面顶部警示在路由切换后持续存在。

平台暂未启用或部署 Dev Session API 时，命令会在启动子进程前返回平台机器错误及
`remediation`；这不是回退到本地数据库或伪造开发身份的理由。
