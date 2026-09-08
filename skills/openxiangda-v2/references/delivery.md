# 部署、生产晋级与恢复

应用开发者从工作区执行 `pnpm openxiangda`。平台负责应用版本、运行状态和恢复决定。工具链自身的 npm 发布由平台维护者负责，应用项目无需复制发包脚本或平台验证矩阵。

## 测试部署

托管源码应用通过 `pnpm openxiangda source push -m "本轮变更说明"` 完成提交与推送。
发布系统在平台绑定仓库中核验精确源码提交，并沿用 AppVersion 的源码和制品摘要关联。
本地构建仍是当前交付方式；源码提交存在不等于平台已独立验证制品由该提交构建。

发布前，先将本轮源码、生成契约及必要记录合入并推送仓库的远端默认主分支，然后从干净且同步的主分支工作区发布。工具从 origin 的远端 HEAD 识别主分支，不把任务分支的 upstream 当作主线。未提交、未推送、未合并或落后主线的问题会在构建和上传前返回；工具不会自动合并分支或覆盖其他会话的改动。

开发开始时先同步主线并读取项目现状，开发完成包括提交、推送与主线整合。每个工作区保持一个写者；需要并行时使用独立目录并明确各任务范围。日常 dev/check 仍可验证未提交源码。没有 Git 远端的项目应先建立并绑定仓库再发布。

准备部署时直接执行 deploy，它已经包含兼容性预检、生成、检查、测试和构建。只想检查代码时使用 [check](testing.md)，无需在 deploy 前重复运行全套检查。

测试发布还会核对 [AppSpec](appspec.md) 的需求依据、架构、权限、性能预算和验收计划。缺失时给出具体记录位置，先补实际设计；首次测试部署不要求预先完成线上业务验收。

```bash
pnpm openxiangda deploy --dry-run --json
pnpm openxiangda deploy
pnpm openxiangda status --json
pnpm openxiangda logs <deployment-id> --json
```

默认目标为 `test`，平台内部标识为 `preproduction`。只读预览不生成构建产物、不上传制品、不提交 DeploymentRun；因此预览成功不能证明代码已通过检查。正式检查使用本地完整校验，再通过目标平台的 `configurationCompatibility` 核对同源规则、密钥、已有物理模型和登录提供方等只读条件；失败时停止后续步骤。只有启用了自定义 Nest 后端的应用才需要构建后端镜像及对应 Docker 环境。

平台启用镜像上传后，`deploy` 在本机用 Docker Buildx 导出 OCI 镜像，再使用当前平台登录态分片上传。开发者只需应用部署权限，无需登录平台管理员的镜像仓库或取得推送凭据。已完成的镜像层按摘要复用，中断后重新执行同一条部署命令可恢复上传；平台核验镜像完整性后才进入应用发布。尚未升级的旧平台保留其原镜像构建合同；新平台已声明上传能力但未启用时，命令会明确报告平台配置缺失。

生成的不可变 AppVersion 绑定前端、可选后端、配置契约和制品摘要。默认提交后持续跟踪同一运行，直到平台成功、失败或取消，最多观察 15 分钟。`--no-wait` 只提交，适用于已有状态跟踪器的自动化；此时返回运行 ID 不代表部署完成。

构建、上传及平台执行都会显示当前阶段和耗时，长步骤每 10 秒反馈一次。平台的准备、部署、切换和健康检查状态来自原运行。观察超时或连接中断不会取消部署或重建候选，使用下面的命令继续跟踪：

```bash
pnpm openxiangda status <deployment-id> --watch
```

网络响应不确定时先查询原运行，不凭本地输出创建重复部署。平台部署成功后，仍需执行真实角色的业务验收。

相同源码候选重试时，工具会重新核对本地验证证据、封存清单和制品字节，复用仍有效的构建结果及后端镜像；已上传内容按摘要查询并复用。只有环境条件改变时不需要重建源码制品。输出损坏、输入变化或缓存缺失时自动回到正式检查和构建。缓存位于 `.openxiangda/build/`，不是新的部署状态源；提交响应不确定时使用原候选和幂等键，已有失败运行按其 recovery 恢复。

## 测试环境验收

至少记录应用版本、目标环境、真实角色、复现数据、预期和实际结果。按改动范围检查页面、权限、业务规则和失败路径；详见[校验与验收](testing.md)。

| 证据 | 能说明什么 |
| --- | --- |
| 本地 check 成功 | 本次声明兼容，检查、测试和构建通过 |
| 包密封完成 | 存在可识别的不可变候选版本 |
| DeploymentRun 成功 | 平台完成该版本的部署流程 |
| 真实角色的页面与业务操作通过 | 对应场景在目标环境可用 |
| 生产晋级成功并回读 | 生产使用指定测试版本；仍需核对实际入口与关键业务 |

构建成功、提交成功和真实业务验收是不同证据，报告时分别给出实际状态。

## 生产晋级

生产必须复用已成功部署到测试环境的同一版本，不能从当前源码直接重建：

先按真实操作保存 `appspec/verification/<测试运行ID>.json` 并提交、推送到主线。晋级会从测试源码提交读取原验收计划，核对报告的运行 ID、包摘要、AC 场景与性能证据；主线后来的需求不改变已测范围。

性能若由用户明确延期，按 [AppSpec 延期记录](appspec.md)填写有证据的 `performanceDeferral` 并保留原测量。晋级阶段明确显示性能未通过；功能 AC 和其余版本/权限门禁继续执行。仅升级验收工具和补充报告不会重建原测试制品。

该版本的源码提交必须仍包含在权威远端主分支中。主分支后来有新提交，不会改变本次晋级的制品。若任务分支采用 squash/rebase 合并，应在最终主线提交上重新冻结并验证测试候选，不能继续晋级合并前的提交。

```bash
pnpm openxiangda deploy --environment production --from <test-deployment-id> --dry-run --json
pnpm openxiangda deploy --environment production --from <test-deployment-id>
pnpm openxiangda status --json
```

预览会精确读取指定测试运行的封存配置并核对生产密钥、模型和登录条件，返回源运行、版本与摘要。主线后来变化或版本较旧，不会使预检改用当前源码或最近版本列表。测试运行失败、版本缺失或条件不符时直接失败。平台在真正晋级时再次权威校验。生产参数不接受测试环境的 `environmentId` 或 `idempotencyKey`。已有生产发布授权时可继续执行；授权不明确时先准备版本、预览及验收证据，再确认具体发布对象。

## 失败、重试与回滚

`logs` 返回首个失败 `rootFailure`、最近失败 `latestFailure`、候选状态、尝试账本与 `recovery`。无失败时对应字段为 null。按平台给出的 `recovery.nextCommand` 处理；只在 `recovery.cancelAllowed` 为真时取消。已激活的运行不能用 cancel 撤销。

```bash
pnpm openxiangda retry <deployment-id>
pnpm openxiangda cancel <deployment-id>
pnpm openxiangda rollback --to <app-version-id>
```

环境版本回滚不保证撤销数据库业务写入；数据修复需要单独计划与验证。暂停与恢复默认作用于测试环境；生产必须显式选择：

```bash
pnpm openxiangda stop
pnpm openxiangda start
pnpm openxiangda stop --environment production
```

stop 保留数据与配置，start 从当前不可变版本恢复。不要把暂停、取消、回滚当作同一种操作。

## 自动化与错误定位

CLI 的 `--json` 输出单个 `openxiangda.cli-result/v2` 对象；失败包含 code、message、retryable、remediation、nextCommand，以及适用的 pointer/details。自动化依据 code 和结构化字段决策，不解析中文描述。

`check`、`deploy` 和持续状态观察的结果带 `data.execution`，包含本次操作 ID、总耗时及各阶段状态和耗时。阶段进度写到 stderr，保持 `--json` 的 stdout 可解析；`--json-events` 则通过 `command.status` 返回同源结构化进度。MCP 客户端提供 `progressToken` 时收到标准进度通知；不订阅通知仍能从最终结果读取阶段摘要。MCP `deploy_app.wait` 默认 true，`deployment_status.watch` 可继续观察原运行。

兼容性错误会列出当前工具链与目标平台的版本、能力和契约要求。按定位修复声明或升级目标平台，不删除真实业务要求、改写摘要或绕过权限来让预检通过。应用所需能力由规范化声明派生，应用不能手写一份能力列表冒充平台支持。

`OPENXIANGDA_CONFIGURATION_VALIDATOR_MISMATCH` 表示工具链与平台的校验实现不配套，应按发布说明升级对应版本；它会在构建、镜像推送和制品上传前出现。模型类型不能原地替换时，按提示设计新字段及数据转换；必需密钥缺失时配置目标环境后继续，不修改源码伪装问题已解决。

MCP 的 check_app、deployment_plan、deploy_app 使用与 CLI 相同的环境与生产晋级参数规则。完整参数以[CLI](cli.md)与[MCP](mcp.md)为准。

## 构建前运行配额

`deploy --dry-run`（MCP `deployment_plan`）会只读查询目标 TEST 的运行配额，输出 `runtimeCapacity` 的核验时间、所需增量、各配额剩余量和缺口。`sufficient: false` 表示当前不足；`null` 表示无需新增或未核验，必须结合 `basis` 与 `capacity.checked` 阅读。专用命名空间未检查不能当成资源充足。

正式 deploy 在检查脚本和镜像构建前预检；平台缺少配套能力或无法核验时明确停止。配额快照不预留资源，实际执行再次检查。已有可验证密封候选会携带摘要和幂等键，平台识别 `existing-run` 时返回原运行，不把它当作新副本；观察或恢复原运行使用 status/retry。不要为绕过配额创建新包或切换目标环境。

## TEST 单副本维护替换

平台配额只允许一个后端副本时，可显式选择维护替换。它会停止当前 TEST 后端，期间应用不可用；成功后激活新版本，失败时由原 DeploymentRun 恢复旧后端。恢复尚未完成时继续占用原运行，status/logs 显示恢复阶段与首个失败，不允许用新部署或取消跳过恢复。

先运行 `openxiangda deploy --environment test --strategy maintenance-replace --dry-run --json` 查看前驱版本、Head revision 和停止后的容量估算，再使用相同参数去掉 `--dry-run` 提交。计划不预留资源。只有已存在、身份匹配的单副本 TEST 后端才可使用；前端应用、新应用和 production 不支持。默认仍为 rolling，不会因配额不足自动停止实例。

策略属于部署幂等请求。默认维护幂等键含策略，显式幂等键不能在不同策略之间复用。已有运行通过 status/retry 恢复；持续恢复中的运行保持 preparing/maintenance-recovery-required，平台会重试恢复，恢复失败时保留原运行与错误。
