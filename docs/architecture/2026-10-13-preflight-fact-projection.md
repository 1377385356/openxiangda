# 配套与任务预检事实投影

状态：实施，A3 的本地事实与 owner 反馈。已有 `validateAppConfig` 聚合声明闭包缺口、shared native compiler 严格校验及 target-readiness 聚合能力/目标缺口继续拥有规则；不在 CLI 复制校验器。

证据：context 主要展示执行 devkit 的版本，缺少应用实际安装根包及其内部 BOM、真实路径和锁摘要；目标错误虽保留 requestId/pointer，缺少具体领域 owner 与操作顺序。

所有者/合同：根包依赖 manifest 拥有精确内部组合；包管理器锁拥有 integrity。devkit 只读取实际安装文件与锁，报告 observed/missing/unavailable，不从源码版本推定已安装版本或 npm 已发布。现有 validatorDigest 精确守卫不放宽。

不变量/并发：只读快照带 observedAt；本地安装观察不证明 registry 或目标可用。缺包和第三种版本逐项显示，不自动升级或重写锁。owner 建议是原 diagnostics 的投影，不授予权限、不新增运行状态。

资源/安全：七个官方 V2 包及最多 1 MiB manifest、8 MiB 锁；不探查 V1 引擎、凭据或任意外部包代码。无法解析保留 unavailable。包路径来源于 Node 安装搜索路径，真实路径读回；不执行包入口。

回退：移除新增 context/diagnostic 字段，不影响严格 compiler/目标门禁。验证：不同实际包/BOM版本报告 mismatch；缺包/缺锁不伪造 observed；锁 integrity 只取对应版本；目标原错误及 requestId 保留；已存在的全闭包 validator 测试继续运行。
