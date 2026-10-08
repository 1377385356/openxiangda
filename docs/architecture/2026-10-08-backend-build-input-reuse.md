# 按后端输入复用应用镜像

状态：实施与开发验证完成，附独立 Changeset；npm 发行尚未执行。主题：V2 应用发布的后端构建成本。

## 问题证据与所有者

一次仅调整前端登录入口的发布耗时 523009 ms，其中 backend-image 为 442323 ms。
BuildKit 日志显示安装依赖 188.3 秒、下载 621 个包（reused 0），生产 deploy
106.8 秒，编译 1.9 秒；实际传入上下文仅 3.25 MB/0.9 秒。主要问题是重复构建与依赖处理。
当前短期 OCI 候选成功即删除，输入摘要覆盖整个 Docker context，配置摘要也参与候选键。

devkit-core 拥有本机构建及制品缓存。平台既有 begin/complete 回执拥有镜像状态、鉴权
和配额，DeploymentRun 仍是发布状态唯一所有者。不新增平台数据库、API 或部署状态缓存。

## 稳定不变量与影响契约

- 不用 Git revision 推断构建输入；包含未提交文件、权限和链接。构建前后再次计算摘要。
- 只对逐字匹配的当前官方模板及历史官方模板（允许生成的后端目录替换）使用已审查的
  输入集合：根 manifest/锁/workspace/tsconfig、后端目录、contracts、vendor。识别时允许
  历史 Node 公共引用和相同 tag 的用户指定镜像源引用；实际原文件字节仍参与摘要。
  Dockerfile 与有效 ignore 规则始终进入摘要。自定义 Dockerfile 保留完整上下文摘要，
  不解析任意 shell 或猜测 COPY/RUN 的依赖；可用专用 dockerignore 明确缩小实际上下文。
- 编译配置不再作为独立的镜像输入：真正进入镜像的生成 contracts 文件已纳入摘要；
  新配置仍独立编译、预检、密封并由平台验证。身份、平台、应用、环境、工具版本仍隔离。
- 成功的已封存 OCI 可短期复用；每次先校验全部 blob，再用原 digest/manifest 调用现有
  begin。只有平台当前鉴权通过且返回 ready 才接受远端 reference；远端缺失则上传原字节。
  不存储远端 ready/reference，不以本地成功推断平台仍可用。
- 保留既有上传失败恢复。`OPENXIANGDA_BACKEND_IMAGE_CACHE=false` 禁用成功制品复用和
  保留，但相同输入的未完成上传仍恢复；不提供绕过校验或权限的快速发布。
- 模板安装保留原 manifest，不在镜像中删 root devDependencies；使用 frozen lock，
  pnpm/Corepack 持久 cache mount 与 prefer-offline。生产 deploy 共享 store 和 registry
  metadata 缓存，使用 prefer-offline；保留应用既有非注入 workspace 的 legacy deploy
  行为。依赖范围、版本、脚本禁用策略保持原合同，不通过改写锁设置强制绕过 pnpm 门禁。
- 当前模板的公共 Node 镜像按用户默认使用 docker.xuanyuan.run/node:22-alpine，保留版本。
  不改已有客户 Dockerfile、Docker daemon 或运行中的 builder。

## 失败、并发、安全与资源边界

沿用用户私有目录、候选心跳租约、全局容量租约、8 槽/8 GiB/24 小时和上下文扫描预算。
封存后按实际 OCI 字节加元数据收缩预留空间；容量变更在全局租约内原子写入。
成功复用预留单镜像上限加最多 516 KiB 元数据；超过 8 GiB 总本机预算时维持原失败恢复
模式，不降低平台接受的镜像上限。
成功缓存不延长原 TTL，防止可变外部输入永久不再求值。禁用成功复用使用独立键域，
避免误用已有完成制品。继续沿用现有 sealed 描述格式，不保存远端成功状态，旧工具仍能读取并回收。
无 token、密钥或业务正文进入描述文件；每次网络调用先检查租约。缓存损坏、源码漂移、
权限拒绝及容量问题明确失败；本地保留失败不把已确认的远端成功改成失败。
BuildKit 依赖缓存由当前 builder 管理，不重启或清理其他任务的缓存。

真实构建发现 pnpm 10.15.1 legacy deploy 即使已有完整 frozen install，仍需 registry
metadata，直接 offline 会冷构建失败；现代 deploy 要求源工作区与锁文件真实启用
injectWorkspacePackages。为避免改变应用本地依赖链接和构建同步合同，本轮不迁移该
设置。保留 legacy 首次 metadata 解析，持久缓存消除后续重复网络；不宣称生产 deploy
已经是完全冻结且离线的依赖解析。后续若迁移注入模式须独立验证本地开发/构建同步。

稳定 1.x、无后端应用、生产晋级和旧 Registry 直推路径不变。新增行为只在已有身份隔离
的 V2 平台上传路径生效。平台继续最终验证配置和制品，其他租户不共享候选键或权限。

## 回滚与可证伪验证

回滚 devkit 只恢复成功后删除制品/全上下文摘要；不改平台数据或已有版本。旧模板保留
在工具资产中仅用于识别已发布输入边界，不自动覆盖应用源码。

验证须证明：成功后前端/文档/配置改动零 Docker 调用，仍取得平台原摘要回执；后端、
contracts、锁、vendor、Dockerfile、ignore、身份/环境变化需新构建；未知 Dockerfile
采用全上下文；平台丢失镜像可恢复原字节；403 不重建也不绕过；篡改 OCI 零网络；禁用
成功缓存需重建且仍恢复未完成上传；多候选按实际字节有界且活动租约不可回收。
真实 Docker 模板构建核验 frozen install、持久包/metadata 缓存和生产 deploy，用第二次
依赖层失效构建的 reused/downloaded 计数验证缓存，不将受控回执当成客户上线证明。

## 开发验证证据

42 项镜像复用、上传、构建、模板及初始化测试通过。真实 Buildx/OCI 验证使用隔离的
三包 workspace 和受控平台回执：仅修改前端后，Docker 路径设为不存在仍读回原摘要，
复用约 80 ms、零新增分片，执行记录的 backend-image-build 为 skipped。
修改后端后重新构建约 8.4 秒；安装层 1.7 秒，reused 19/downloaded 0，生产依赖
整理从首次 metadata 缓存未命中的 18.2 秒下降到 1.5 秒，无新增包下载。
这些时间是小型 fixture 的构建/复用证据，不是客户应用完整发布耗时承诺。
公共 Node 镜像通过用户既有 Docker Desktop 凭据从指定镜像源拉取，未改变 builder 或
共享 Docker 配置。初轮开发门禁 19/20 项通过，CLI 黑盒创建安装遇到临时 HOME 下
180 秒依赖安装超时；已保留全部检查。门禁的其余 19 项通过（devkit 534 项通过、
2 项既有跳过）；保留当前网络代理的独立 CLI 重试通过 19 项测试及真实
login → create → dev → check → deploy → status → logs → rollback 黑盒流程。
最终补跑本轮 42 项相关测试和 devkit 类型检查通过；中文资料/Skill 校验、VitePress
构建和 npm pack dry-run 确认新 Docker/识别资产进入发行物。
发行前仍按独立 Changeset 执行正式版本物化及 release:plan/verify:release 门禁；
本轮未消费仓库其他待发 Changeset，也未修改或发布客户应用。
