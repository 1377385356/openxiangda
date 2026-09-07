# OpenXiangda 2.0 按需正式环境

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：2026-08-16 已正式发包并完成 reference-environment 全新应用在线验收。

## 问题证据

当前 `app provision` 会同时创建预发和正式环境，参考应用部署后也容易同时保留两套后端工作负载。大多数 2.0 应用长期处于开发或试验阶段，不会正式投入使用。提前创建正式环境、运行凭据、环境状态和 Kubernetes 工作负载没有业务价值，还会增加资源占用、运维噪音和发布失败面。

## 能力归属

- 应用身份、环境注册、DeploymentRun、环境 Head 和运行期启停状态由平台控制面唯一拥有。
- Git 仓库和 AppPackage 只拥有源码、声明与不可变 AppVersion，不保存环境是否已创建或正在运行的事实。
- CLI、MCP、AI 和 Admin 管理端只是控制面客户端，不自行推导或补写正式环境。

## 决策

一个 2.0 逻辑应用默认只创建稳定的 `preproduction` 环境。`production` 是可选的长期环境，仅在开发者首次执行明确的“发布正式版”操作时惰性创建。

1. `app provision` 幂等创建应用身份、应用最高管理员授权和预发环境，不创建正式环境。
2. 日常 `deploy` 只向预发部署新的不可变 AppVersion。
3. 首次 `promote <preproduction-deployment-id> production` 选择一个已在预发成功运行的 AppVersion，创建正式环境并把同一个 AppVersion 发布到正式环境。发布过程不重新构建制品。
4. 后续 `promote` 复用已有正式环境，只更新其环境 Head。
5. 预发和正式工作负载均支持显式启动、停止。停止只把期望运行副本降为零，不删除环境、业务数据、审计、Secret 元数据或历史 DeploymentRun。
6. 从未正式发布的应用永远没有正式环境、正式 RoleSession、正式 OAuth/Secret 运行态或正式后端 Pod。

## 稳定不变量

- 一个应用始终恰好有一个预发环境，最多有一个正式环境；环境 key 创建后不可改。
- 同一个 AppVersion 从预发发布到正式，前端、后端镜像、配置和数据契约摘要保持完全一致。
- 预发与正式的业务数据、角色成员、范围授权、OAuth 客户端、Secret 值、Workflow 实例和 Event receipt 相互独立。
- 首次正式发布不复制预发业务数据。需要初始化数据时使用应用明确声明、可审计且可重试的 seed/import 操作。
- 环境不存在、环境已停止和环境发布失败是三种不同状态，网关和管理端必须返回可区分的结果。
- 1.x 应用、流程、自动化和既有发布模型不读取也不写入该生命周期。

## 控制面契约

| 操作 | 结果 |
|---|---|
| `app provision` | 创建应用身份和预发环境 |
| `deploy preproduction` | 构建或提交 AppPackage，并把候选 AppVersion 部署到预发 |
| `environment start/stop preproduction` | 启停预发工作负载，环境事实保持不变 |
| `promote <deployment-id> production` | 首次惰性创建正式环境，或复用已有正式环境，发布预发验证过的同一 AppVersion |
| `environment start/stop production` | 显式启停正式工作负载，不删除正式环境 |

管理端应用列表至少显示“仅预发、预发运行中、预发已停止、正式发布中、已发布、正式发布失败”，并提供与状态匹配的确定性操作。普通用户页面不展示环境 UUID、AppVersion ID、workflow code 或内部错误码；这些信息只进入应用管理员诊断面板。

## 失败与并发

- 首次正式发布使用稳定 operation/idempotency key，并以 `tenant + app + production` 唯一约束防止双击或并发会话创建两个正式环境。
- 发布先验证源 DeploymentRun、AppVersion 摘要、平台 capability、必需 Secret 和集群资源，再创建 Kubernetes 工作负载。
- 数据库注册与 Kubernetes 就绪不能伪装成一个跨系统事务。正式环境先进入 `provisioning`，只有候选工作负载通过 readiness 后，才在一个数据库事务中激活环境 Head 和发布成功状态。
- 候选失败时不产生正式活动 Head，不影响预发，也不覆盖既有正式版本。首次失败可以保留同一个正式环境身份和失败记录，重试继续使用该身份。
- 资源不足必须在创建 Pod 前返回明确的 CPU、内存或配额诊断，不能停留在无提示的 Pending。

## 资源边界

| 应用状态 | 默认运行后端数 |
|---|---:|
| 预发已停止且从未发布 | 0 |
| 正在预发验证 | 1 |
| 已发布且预发已停止 | 1 |
| 正式运行并同时进行预发验证 | 临时 2 |

平台可以为长期未访问的预发应用提供自动停止策略，但不能自动删除环境或业务数据。正式环境不做自动停止，除非开发者明确配置。

## 回滚边界

- 该变化只调整 2.0 新应用的环境创建时机和控制面命令语义，不删除已经存在的正式环境。
- 已有双环境 2.0 测试应用可以继续运行，后续通过显式清理任务停止或删除无用的正式工作负载。
- 实现阶段必须采用可独立回滚的数据库和 API 变更；回滚时允许恢复“provision 同时创建两环境”的旧行为，但不得删除惰性创建后产生的正式环境事实。

## 可证伪验收

1. 新应用执行 `app provision` 后，数据库和控制面查询只返回预发环境，Kubernetes 中没有正式 Deployment 或 Pod。
2. 预发部署成功后首次执行 `release production`，平台创建唯一正式环境，并发布与预发完全相同摘要的 AppVersion。
3. 并发执行两次首次正式发布，只能产生一个正式环境和一个活动 Head；另一个请求幂等复用或返回稳定冲突。
4. 首次发布因资源不足或 readiness 失败时，预发 Head 不变化，正式环境没有活动 Head，也没有残留运行 Pod。
5. 停止预发后副本数为零，再次启动恢复相同环境和活动版本。
6. 1.x 发布、流程和自动化回归测试结果不受影响。

## 当前实现

- Platform Server migration 为 Native 环境增加 `runtime_state`，并把 `start`、`stop` 纳入同一 DeploymentRun 状态机和并发唯一约束。
- provision 默认只创建 `preproduction`；首次 promotion 由平台事务性确保唯一 `production` 环境。
- K3s 执行器只缩放当前 Head 指向的 Deployment。状态只在目标副本就绪或归零且 Head 未变化后提交；停止后的 App API 返回稳定的 503 错误码。
- CLI 提供 `environment status/start/stop`；MCP 提供只读环境资源以及 `environment_status`、`start_environment`、`stop_environment` 三个工具。
- AppPackage 自动要求 `environment.on-demand-production` 与 `environment.runtime-lifecycle`，旧平台会在上传制品前被能力协商拒绝。

## reference-environment 在线证据

- 全新应用 `openxiangda-v2-lifecycle-acceptance` provision 后只存在
  `preproduction`；AppVersion 为 `0c4f6be5-9797-52fd-96f0-d54ecc232a20`，
  包摘要为 `05460ac2e35bd08e36fe289436002d5dc00d6967b2634c70488a95725f34b113`。
- 同一预发环境完成 stop→0、start→1/1 Ready、再次 stop→0，三次操作都由
  Durable DeploymentRun 驱动，未重建 AppPackage，也未手工修改 Deployment。
- 首次显式 promotion 才创建唯一 production 环境
  `56da498c-d0c4-5505-8bee-77980b1cc473`；promotion run
  `55282b6f-e3d9-54b1-bb80-259dee4adc66` 激活上述同一 AppVersion 与包摘要。
- 验收结束时预发为 stopped/0 副本，正式为 running/1 Ready Pod；应用池仍受
  原 `2.5 CPU/4Gi` 配额约束，没有为通过验收临时提高资源上限。
- 正式 `/view/openxiangda-v2-lifecycle-acceptance/admin`、reference app 和
  legacy instrument reference app Admin 均返回 HTTP 200，证明新生命周期没有进入 1.x 路径。
