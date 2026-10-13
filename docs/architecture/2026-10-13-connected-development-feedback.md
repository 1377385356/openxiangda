# Connected Dev 客户端反馈接续

证据：服务端已有 `openxiangda.connected-development-feedback/v1` 拒绝投影，但devkit丢弃pointer/configurationRunId和分类；默认nextAction一律重跑dev。生产fallback仍输出“会话独立配置”提示。

owner：服务端原配置/overlay/session owner决定准入。客户端只验证schema和固定category/nextAction组合，投影已发生的拒绝，不复制差异判定、不生成运行键、不自动部署。旧平台或未知反馈转向检查文档，不能推定原输入可无限重试。现有登录/绑定提示保持。

不变量：错误码、HTTP传输信息、原requestId/run/cause和字段pointer按有界白名单保留。字段pointer与HTTP endpoint分别表达，不能覆盖成同一含义。新反馈禁止原输入直接重试时diagnostic.retryable=false，即使原状态503。远端字符串不能进入shell命令；nextAction只来自本地固定映射。旧平台错误不能冒充已支持新分类。

安全/失败：只投影诊断，无新增网络、写入、数据库或授权。未知投影不授予部署权限。预算沿服务端原owner，不因用户询问而扩容。V1不受影响。回滚独立移除客户端投影与文档；原业务状态不变。

验证计划：补全部类别、畸形/未知反馈、原运行和pointer保留、503不重试、命令注入文本隔离，以及实际dev失败外壳回归；正文生成从单源生成。按本轮统一交付要求，新增检查进入最终verify:affected/release，不逐小提交重复完整矩阵。
