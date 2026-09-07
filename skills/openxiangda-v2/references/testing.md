# 检查与真实业务验收

## 统一检查 {#check}

```bash
pnpm openxiangda check --json
```

CI、离线开发或尚未发布的候选包使用 `pnpm openxiangda check --local --json`，MCP 对应 `check_app.local=true`。它仍执行完整纯规则、生成、静态检查、测试与构建，但不请求平台；结果明确为 `validationScope: local`，不能证明现场权限、密钥和模型兼容。默认 check 仍预检目标，正式 deploy 始终执行现场预检，不提供跳过参数。

默认目标为测试环境。CLI 与 MCP `check_app` 使用同一执行器：先在本地完成配置和完整契约校验，再核对目标平台的校验实现与只读环境条件，随后生成文件、执行静态检查、测试和构建。明确检查生产目标时指定 `--environment production`。

结果中的 AppSpec/lifecycle 单独列出需求与设计缺口；普通 check 可以继续验证尚未完成的实现。正式测试发布前核对总纲、关联变更、权限、性能预算和 AC 计划，测试部署之后再执行真实角色验收。生产晋级按 [AppSpec 报告](appspec.md)核对指定测试版本的实际结果。

本地与平台使用同一份纯校验规则，并核对实现摘要和配置投影摘要。必需登录提供方、目标环境的密钥可用性、已有模型的物理字段约束和应用管理权限会在构建前检查；预检不读取密钥明文、不创建物理表、不修改环境。现场变化仍由平台在真正执行时复核。

检查会写本地生成结果并按需初始化后端，不是只读操作。前置阶段失败后，下游阶段标为 skipped，不继续构建或上传。保留错误码、pointer、details 和下一步，修正原因后重试。

源码、锁文件、依赖安装状态、工具链、构建环境和输出摘要均未变化时，检查自动复用已通过的 check/test/build，并在阶段结果标记 `reused: true`。目标平台的权限、密钥和模型条件每次重新预检。检查期间输入发生变化会停止并要求重新检查。缓存只保存摘要；缺少锁文件、外部本地依赖、符号链接、文件过多或无法核对时执行完整检查。手工修改 node_modules 不属于受支持的依赖管理方式，应修改依赖声明并重新安装。

成功检查返回 `sealedArtifact.state: check-did-not-seal`、`sealed: false`、`usableForDeploy: false`。旧 AppPackage 不是当前检查结果。要发布测试环境可直接运行 deploy，它已包含完整检查；不要连续重复执行 check、test 和 build。

## 按变化范围验收 {#acceptance}

应用测试归当前项目维护。模板不限制页面数量、源文件数、总行数、业务类名或登录布局；初始模板与通用组件的模拟响应回归由工具链发行门禁维护。类型、声明、构建制品和实际运行性能仍需按各自规则验证，源码行数不能替代性能测量。

Web 默认保留开发服务回环访问检查。按需 Nest 使用 `tsx --test` 发现项目中的业务测试；没有用例时只有零项测试，不能当成业务已验收。浏览器目录 `apps/web/e2e/` 起初只有编写说明，添加本应用的 `*.spec.ts` 后运行 `pnpm test:e2e`；真实角色验收绑定 AppSpec 和指定测试版本。

修改资源时验证声明、PC/移动字段语义及受影响的新增、详情、修改、删除、筛选、导出和版本冲突。用允许角色验证成功，用禁止角色验证页面、操作、行和字段边界；存储值及审计应符合声明。平台内部的数据库和性能回归由平台维护者负责，应用不重复搭建平台数据库测试。

只改文案时验证受影响页面。复杂事务、并发和值转换使用聚焦测试。浏览器验收实际操作并检查错误，不能用模拟响应或空页面加载代替真实角色验收。

匿名访问另验证续填、上传、校验、幂等提交、own.list/own.read；另一浏览器应无法获取前一浏览器的记录。工作流按已启用功能检查发起、处理、历史详情和消息跳转，不为未启用通道增加测试负担。

## 可选临时身份 {#temporary-identities}

需要平台协助创建真实测试身份时，使用短期本地计划：

```json
{
  "schemaVersion": "openxiangda.preproduction-acceptance-plan/v2",
  "environmentKey": "preproduction",
  "expiresInMinutes": 240,
  "actors": [
    { "key": "allowed", "roleCodes": ["resource_admin"] },
    { "key": "denied", "roleCodes": ["resource_viewer"] }
  ]
}
```

```bash
pnpm openxiangda accept --plan .openxiangda/acceptance-plan.json --json
```

示例角色需替换为应用实际角色。计划和返回的一次性登录链接不提交仓库。accept 不自动部署，也不是 check/deploy 的必填步骤；未运行应明确注明。

## 记录结果 {#evidence}

记录源码/包版本、AppVersion、环境、角色、预期及实际结果、必要请求标识。区分本地检查、分发安装、部署激活与业务验收。某项未执行时说明原因，不将其写成通过。

## 并发执行

同一工作区的公共 check 和测试 deploy 共享本地互斥锁，前一个命令结束后才能启动下一个。出现 WORKSPACE_OPERATION_BUSY 时等待当前进程完成；异常退出时先确认锁中进程已经退出，再移除提示中的锁文件。锁只保护工具执行，不阻止编辑器修改源码；检查和部署期间应暂停其他写入。平台部署状态仍以 status/logs 为准。
