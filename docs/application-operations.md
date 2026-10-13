# AI 应用运行自助操作

开发者 AI 使用当前平台账号和工作区绑定直接完成事件、环境凭据和消息中心维护。
用户已授权的诊断及修复无需再让用户点击管理页面。平台仍核验已有应用管理权限；
首次账号登录沿用原认证流程，开发者身份不自动获得管理员权限。

## 发现和执行 {#discovery}

```bash
pnpm openxiangda context --json
pnpm openxiangda admin context --environment production --json
pnpm openxiangda admin operations --json
pnpm openxiangda docs application-operations
printf '%s' '{}' | pnpm openxiangda admin execute events.status --environment production --input - --json
```

`admin operations` 读取本地目录，每项给出 `operation/inputSchema/effect/permission/recovery`。
`admin execute <operation> --environment <test|production> --input <file|-> --json` 直接执行。
输入文件或标准输入只放目录中的 **input** 对象，最多32KiB，不放密码。
执行必须明确环境；test映射平台preproduction。应用、站点和身份来自当前工作区及会话，
拒绝任意路径、自报appCode、tenantId、actor和environmentKey。

MCP先调用 `application_operations`，再调用 `application_operation`：

```json
{"operation":"events.status","environment":"production","input":{}}
```

CLI与MCP共用输入Schema、服务和平台错误。成功结果在 `data.result`，环境在 `data.environment`。
配置与恢复在已授权范围内直接执行；health访问外部健康接口并保存元信息。
操作目录不证明远端接口已部署或当前用户有权，执行结果由平台决定。

## 原执行健康 {#execution-health}

从 `admin operations` 发现 `diagnostics.execution-health`，输入只提供原 kind 和 UUID：

```bash
printf '%s' '{"kind":"event-delivery","id":"<原投递UUID>"}' | \
  pnpm openxiangda admin execute diagnostics.execution-health --environment test --input - --json
```

kind 为 timer、date-trigger、event-delivery 或 legacy-schedule；legacy-schedule只接受production，V1工作区仍由原V1引擎维护。按当前工作区 appCode 和原登录身份的应用管理权限只读查询，不传tenant、任意URL或恢复动作。

`admission`、`due`、`claim` 分别表示当前准入、原周期和claim；暂停可能仍有有效旧claim，未来/夜间周期不是卡住。lease过期或 `needs_review` 先核对原owner、退出证明与效果回执，不重放旧周期。timer当前按原事务行锁调度，预留lease字段不会被解释为executor空闲。缺记录/超时/schema缺失明确为未知，HTTP200只是诊断响应。

目标平台需要提供此受管诊断路由；404先核对平台版本，不创建业务shim或替代执行。原requestId/commandId/DeploymentRun/fileId诊断继续用于原操作读回；健康投影不替代业务验收。

## TEST 文件语义观察 {#semantic-audit}

原平台管理员从目录发现 `diagnostics.semantic-audit`；只接受test。以下input的版本、Head修订、resourceCode均取自当前应用的实际TEST目标：

```json
{
  "requirementId":"native.file-value.v2-envelope",
  "resourceCode":"records",
  "expectedAppVersionId":"11111111-1111-4111-8111-111111111111",
  "expectedHeadRevision":1,
  "limit":50
}
```

把input交给 `admin execute diagnostics.semantic-audit --environment test --input <文件> --json`，或通过原MCP `application_operation`。版本/Head变化先刷新目标；不递增修订猜测当前状态。最多100行、32个file/image字段、单行文件值投影16KiB、20个原因样本。分页用原nextCursor传afterRecordId；后续页不冒充同一完整资源快照，工具不自动无限扫描。

`satisfied`、`violations`、`incomplete`、`unknown`分别描述本次快照；报告始终 `admission: observe-only`。即使complete且satisfied也不是激活许可；dataLogicalRevisionId是定义版本，dataRevision明确为空。报告没有文件名、正文或原错误正文。signature.file遵循自身Omit协议，不误当file/image数组。

此观察不证明文件存在/下载授权或历史权限/流程兼容，不自动转换或删除。需修复时交原repair owner评审精确before-image和目标；生产不在此入口范围。404仍先核对实际平台能力；旧SDK版本不能仅凭本文认定已安装该新操作。

## 事件高水位与指定恢复 {#events}

遇到 `EVENT_V2_BACKPRESSURE_HIGH_WATER` 先读 `events.status` 的admission：采样新鲜度、
触发条件、当前值、阈值、恢复条件和消费者健康。再用 `events.subscriptions`、
`events.deliveries`、`events.journal`、`events.audit` 定位订阅、原事实及投递。
分页默认20/最大100，按服务器cursor继续，不无限遍历历史。
按原requestId或commandId核对事务，见[部署与诊断](./delivery.md)。未观测到、超时或503
不能证明未提交，不换键重建业务数据。

Native记录事件才能使用 `ordering:record`。订阅错误先修正应用声明并正常部署，
再用 `events.replay` 恢复指定原deliveryId：

```json
{
  "deliveryId":"11111111-1111-4111-8111-111111111111",
  "reason":"原订阅配置已修复并部署，恢复该投递",
  "idempotencyKey":"event-recovery:original-operation-id",
  "useCurrentSubscription":true
}
```

示例UUID换成实际查询结果。false使用原订阅规格，必须显式选择。
平台核对类型、过滤和排序事实，只恢复该订阅投递并保留历史审计，不重建会员。
未知结果先查投递/审计，保留同键同请求。低于阈值且取得新鲜采样后自动恢复写入；
没有清队列或提高容量阈值的应用操作。验证单笔事务回执及列表后再继续授权导入。

## 环境凭据复用 {#secrets}

遇到 `APPLICATION_V2_SECRET_NOT_CONFIGURED`，分别在test及production执行 `secrets.list`。
只返回名称、状态、revision、hasValue和有效期等元信息。来源用途已经验证且有效时，
在目标production执行 `secrets.copy`，首次正式部署前也可操作，无需询问或读取明文：

```json
{
  "sourceEnvironment":"test",
  "reason":"正式环境复用已验证的集成凭据",
  "idempotencyKey":"secret-copy:original-operation-id",
  "secrets":[{"name":"integration-client-secret","sourceRevision":3,"expectedRevision":0}]
}
```

名称和修订取自两侧实时列表；目标不存在用0，覆盖用目标实际revision。最多50个唯一名称，
同应用跨环境原子复制，任一冲突拒绝整批。目标拥有独立加密版本，来源轮换不自动覆盖。
未知结果保留原键和完整请求，先回读，必要时显式同键重试。确认的409先刷新两侧基准、
核对后形成新操作，不能只递增revision强行覆盖。
随后执行 `deploy --environment production --from <成功测试运行ID> --dry-run`。
环境变量注入需新部署才读取目标版本；动态Secret服务沿用原读取规则。
工具不会自动复制所有项；测试凭据是否适用于真实生产由已确认的集成用途决定。

## 通知渠道与默认路由 {#channels}

先读 `notifications.diagnostics/channels/rules`。缺少标准模板/规则时执行
`notifications.bootstrap` 再回读。已有健康渠道可直接选默认，不必重新配置或获取密码。
新增/更新分别用 `notifications.configure-external-http` 和 `notifications.configure-dingtalk-oa`。
完整参数见目录inputSchema；新渠道revision用0，更新用实时revision。配置只接受Secret引用，
不接受token、明文clientSecret或收件身份。External HTTP支持HMAC、OAuth2客户端凭据和mTLS。
正式启用沿用服务器 `confirmProduction:true`，表示该请求明确选择正式环境，无需管理页。

以下仅演示结构，真实providerCode、baseUrl、identityRealm、功能和Secret引用来自已授权集成，
不能直接把示例地址发送到生产：

```json
{
  "bindingCode":"organization.default","expectedRevision":0,"status":"active","confirmProduction":true,
  "config":{
    "schemaVersion":"openxiangda.notification.external-http-channel/v2",
    "providerCode":"organization","baseUrl":"https://notify.example.com","identityRealm":"organization",
    "auth":{"mode":"HMAC_SHA256","keyId":"primary","secretRef":"notification-hmac"},
    "callback":{"enabled":false,"maxSkewSeconds":300,"actionTokenTtlMinutes":60},
    "features":{"interactiveActions":false,"readReceipt":false,"todoSemantics":true},
    "requestTimeoutMs":10000
  }
}
```

配置后执行 `notifications.test`：

```json
{"bindingCode":"organization.default","channel":"external-http"}
```

这是协议/凭据健康检查，不发实际收件通知。随后执行 `notifications.set-default`：

```json
{"bindingCode":"organization.default","expectedRevision":2,"expectedBindingRevision":1}
```

两个revision分别来自workflow.standard规则和渠道。冲突先回读核对。默认只影响当前环境
的标准工作流通知；自定义规则仍由原owner维护。正式隐式路由不选Fake，Fake成功只证明模拟。

## 原通知失败与恢复 {#notification-recovery}

`notifications.messages` 按correlationId或recipientUserId查原消息，默认20/最大100；
`notifications.message` 传原messageId，读取recipients/deliveries/attempts/审计。
平台受理、渠道发送、已读和待办关闭分别核对，不能把受理当成老师已经收到。

| 证据 | AI下一步 |
| --- | --- |
| 凭据缺失/禁用/过期 | secrets.list核对；用途合适时secrets.copy，随后test |
| 默认未设置或规则缺少 | rules/channels核对，必要时bootstrap，再set-default |
| 通道协议或联通失败 | 核对原集成接口、鉴权引用和功能，configure修正后test |
| RECIPIENT_CHANNEL_IDENTITY_NOT_FOUND | 核对目标平台用户及identityRealm对应外部账号；由现有身份目录/消息服务owner维护映射，不创建虚假老师身份 |
| 共享队列、数据库或网络故障 | 保存requestId、环境、消息/投递ID及状态证据，交给平台基础设施owner |
| 403权限不足 | 由应用管理员授予已有管理权限，不获取服务器root或密码替代 |
| 404新接口不存在 | 核对工具及平台版本，升级对应能力，不用临时SQL绕过 |

修复后查 `notifications.dead-letters`，可按messageId限定。确认原任务仍有效且授权包括
实际通知恢复，再执行 `notifications.replay`，只传指定deadLetterId。这可能真正发送通知。
平台保留原消息、目标和审计；不重建通知或批量恢复历史待办。
网络中断后查询原死信/消息；已恢复后的404不能当成未执行，不自动连续重放。
已投递或被新修订取代的消息遵守服务器原有规则。

## 升级与验收 {#verification}

已有项目使用精确锁定版本；升级后运行 `skill install --workspace <应用目录> --force` 并
重启MCP。应用AI不需要本地平台、数据库、Docker或学校服务器账号。
先做只读诊断、无实际收件人的健康测试及CAS拒绝验证，再验收单笔回执/落库/实际投递。
不要用批量导入或历史群发测试恢复。首次会话授权、权限委托和外部身份owner边界沿用原合同。


## TEST 验收数据收尾 {#acceptance-data}

需要回收的验收先从目录选择 `acceptance-data.prepare`，显式提供原 requestKey、当前 TEST AppVersion/Head、actors；默认 100 条累计创建和 240 分钟，最高 1000 条/一天。目录的 actor schema 与原身份规则一致。普通验收身份未 opt-in，不自动归入可回收批次。平台仅接受简单 Native CRUD；workflow、文件、事件、通知、外部效果或压测批次继续使用各自 owner。

创建结果中的 runId 和一次性登录链接用于本批真实身份操作。文件中仅存下列 input，当前 workspace 提供应用、站点和身份：

```json
{"runId":"<原批次UUID>"}
```

先执行 `admin execute acceptance-data.stop --environment test --input <文件> --json`；超时先用 `acceptance-data.status` 核对原 run，stopped 表示后续批次写入被拒绝。用户/成员仍保留；会话撤销 pending 不改变已经提交的 stop 栅栏。再执行 `acceptance-data.preview-cleanup`，核对 actionCount、remainingRecordCount、manifestSha256 和原 repairReference。

真正执行只传原 preview digest：

```json
{"runId":"<原批次UUID>","manifestSha256":"<预览SHA256>","mode":"canary"}
```

在已经授权清理的范围运行 `acceptance-data.execute-cleanup`，核对金丝雀原回执，再把 mode 改为 remaining。丢响应先 preview/status，不换 run 或 digest；pending 清单复用原 repair。每份计划最多100条/1MiB，终结后重新 preview 下一批。外部修改、坏凭证、变化 Head、未知/预算结果及部分失败不会返回 purged。只有完整读回 `cleanupState: purged` 和剩余0表示此批 owned Native 数据验空；registry、参与者、凭证、审计和原修复回执保留。

MCP仍通过 `application_operations/application_operation` 使用同一目录，不提供任意URL或重建来源。生产、旧数据、其他run不接受此入口。目录可用不代表目标平台已升级；404核对版本，不用直接SQL旁路。
