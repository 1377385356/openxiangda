# Connected dev 后端读取当前生成契约

状态：基于本机真实复现的实现决定；用户已授权直接修复平台与工具链。

问题：新增业务operation后，dev编译器更新contracts/src/generated.ts，后台包仍经exports.import读取旧dist。真实Nest装饰器收到undefined operation并在requiredCapability处崩溃。手动build contracts再重启可恢复，但不应成为开发者必须记忆的前置步骤。

归属：devkit-core拥有开发子进程启动与契约生成时序。contracts包已声明openxiangda-source导出条件，workspace-loader已使用此条件；本次让本地后端Node使用同一条件，不建立第二份契约或改写生成文件。

不变量：只在connected dev启动的后端子进程追加--conditions=openxiangda-source，保留既有NODE_OPTIONS。Web进程、CLI父进程、生产构建与部署镜像不添加条件。无此条件导出的包沿用原有import解析。平台身份、session、overlay和operation授权不变，开发凭据不进入子进程环境。

失败/并发：当前源码不能加载时沿用开发进程失败与撤销session流程，不降级至旧dist。同一工作区仍为一个写者，已冻结overlay新增operation仍需重建会话；本变更不实现声明热发布。

安全/资源与回滚：不新增网络、进程、构建或缓存；只追加一个Node解析条件。稳定1.x及生产进程不经过此入口。回滚单个启动环境变更即可；应用可暂时用官方contracts build恢复开发。

可证伪验证：真实Nest子进程使用带不同source/dist内容的@app/contracts包，只有当前source拥有新operation；即使dist存在也必须加载source。保留调用者NODE_OPTIONS的效果，同时已有frontend-only、身份隔离、readiness、撤销与跨Head拒绝测试继续通过。运行verify:affected后保存实际结果。

验证结果：2026-10-03 本机 `pnpm verify:affected` 通过，20/20 任务成功（16项匹配缓存），devkit-core 419/419、CLI 18/18，真实 Nest source-contract fixture通过；CLI黑盒 login/create/dev/check/deploy/status/logs/rollback成功。前轮验证进程因宿主重启丢失，未计为通过，本轮重新取得完整退出结果。该修复为源码，尚未进入仪器应用锁定的63d82d24发行。
