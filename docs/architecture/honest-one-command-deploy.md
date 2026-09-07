# 一命令部署实现合同

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

状态：2026-08-27 已实施。根仓 `openxiangda-2.0-honest-one-command-deploy.md` 是产品与跨仓决策权威；本文只冻结 v2 工具链实现边界。

## 临时网络故障决策

- 问题证据：真实预发应用在 Buildx 内由 Corepack 下载 pnpm 时收到 `fetch failed`、TLS socket disconnect 与 `ECONNRESET`。应用源码和 Dockerfile没有失败，平台也尚未创建 DeploymentRun，但旧 CLI 把它归为不可重试的通用构建错误，迫使 AI 从头判断发布状态。
- 能力 owner：开发端 CLI 是后端镜像构建和推送的唯一 owner；平台仍只接收由 Buildx metadata 证明的不可变 digest，不参与客户端重试。
- 稳定不变量：只有归类为 `OPENXIANGDA_BACKEND_IMAGE_PUSH_FAILED` 的临时网络故障自动重试；鉴权、Docker daemon、Dockerfile、构建逻辑和 digest 错误不自动重试。一次 deploy 最多执行 3 次 Buildx，复用同一候选 tag，退避总时长上限 1 秒。
- 并发与失败：重试只在当前进程内串行发生，不创建第二个发布会话。3 次失败后返回脱敏的稳定错误码、`retryable=true` 与同一个 `openxiangda deploy` 后续动作。
- 安全与资源：Docker credential store 仍是唯一凭据 owner；日志不进入 CLI 结果或平台。上限为额外 2 次 Buildx 调用，复用本机 BuildKit layer cache，不扩大平台写入面。
- 回滚边界：重试逻辑完全位于 artifact upload 和 DeploymentRun 之前，可独立删除并恢复为单次构建，不涉及平台数据回滚。
- 可证伪验证：测试必须证明 `ECONNRESET`/fetch/TLS disconnect 被识别、前两次网络失败后第三次可成功且 tag 不变、连续网络失败恰好调用 3 次，而鉴权和通用构建错误只调用 1 次。

## 大制品上传等待决策

- 问题证据：union reference app 的 34,072,037-byte 前端制品通过公网持续上传时，主机 Nginx 在 304 秒记录 HTTP 400/0 bytes；K3s 网关没有收到请求，内容寻址查询也证明该制品未落库。前三个小制品均已成功，DeploymentRun 尚未创建。该边界与 Undici 默认 300 秒响应头等待一致。
- 能力 owner：Devkit Control Plane Client 是制品 HTTP 传输的唯一 owner；平台继续拥有单制品 50 MiB 上限、摘要复算、对象存储和 DeploymentRun，不增加第二套上传 API 或状态库。
- 稳定不变量：AppPackage、artifact digest、multipart 路径、服务端幂等去重和“全部制品成功后才创建 DeploymentRun”保持不变；普通控制面请求继续使用默认超时，只为有 50 MiB 上限的 artifact upload 配置 30 分钟响应头等待和 5 分钟响应体等待。
- 并发与失败：一次 deploy 仍串行上传一次；传输中断不会创建 DeploymentRun，重新执行同一命令时已成功的内容寻址制品自动去重。非平台 JSON 错误被稳定归类为 `OPENXIANGDA_ARTIFACT_UPLOAD_FAILED`、`retryable=true`，服务端明确返回的 4xx/5xx 继续原样保留。
- 安全与资源：Bearer 凭据仍只发往已绑定平台；诊断只保留 digest、kind 和底层错误码，不回显 token、URL query 之外的数据或制品内容。单请求仍受平台 50 MiB 上限约束，长等待不改变服务器容量。
- 回滚边界：该变更只在 CLI 的 artifact 请求 dispatcher 内，可回滚到上一版客户端；没有数据库、对象存储结构、网关或应用运行态变更。
- 可证伪验证：单元测试证明底层 headers timeout 被稳定归类且可重试；正式 release gate 验证打包后的依赖闭包；真实 union reference app 34 MB 制品必须上传成功并生成新的 Ready DeploymentRun，否则本轮不算完成。

## 不变量

- 日常部署入口只有 `openxiangda deploy`。公开 CLI 不接收 image tag、digest、registry repository 或凭据，也不新增 build/image 命令。AI 原生入口的 `deploy_app` 复用同一自动合同；`build_app` 与 `deployment_plan` 明确是未密封预览，三个 MCP 工具同样不接收 image coordinate。
- 平台 capabilities 始终返回 `deployment.backendImageBuild` 四键：`owner: "developer-cli"`、`available`、`repositoryPrefix: string | null`、`platform: "linux/amd64"`。未配置 repository 时 prefix 为 `null`；已配置 prefix 但当前 runtime mode 不可运行后端时仍可返回 `available=false`，CLI 统一在零 Buildx、零平台写前失败。
- CLI 只把已校验的 app code 追加为 `<repositoryPrefix>/<appCode>-server`。prefix 不得包含 scheme、凭据、tag、digest、空路径段或非 canonical 大写字符。
- CLI 使用工作区根目录作为 context、声明的 backend root 下官方 `Dockerfile` 与模板 `.dockerignore`，执行 `docker buildx build --push --platform linux/amd64 --provenance=false`。只有 Buildx metadata 给出合法 `sha256` 后才密封 AppPackage。
- Docker credential store 是 registry 凭据的唯一客户端 owner。CLI 不读取 Docker config，不把 Docker 输出、凭据或可变 tag写入 stdout、AppPackage 或 DeploymentRun。
- 平台 capabilities 预检、Docker/Buildx、构建、推送或 digest 失败都发生在 artifact upload 与 DeploymentRun 创建之前；CLI 会在单次命令内对临时网络故障做上述有界重试，耗尽后仍使用 `openxiangda deploy`。

## 验证

contracts 固定四字段 shape；Devkit 单测覆盖 target 校验、官方 Dockerfile/context、Buildx 参数、digest、缺 Docker/Buildx、daemon、registry auth、网络/push 有界重试与 metadata 失败；CLI 黑盒覆盖未配置仓库零 Docker/零平台写、认证失败零平台写且不泄密、成功路径仅提交 digest，以及旧 `--backend-image` 的稳定拒绝。
