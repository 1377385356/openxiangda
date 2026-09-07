# OpenXiangda 2.0 工具链维护规范

## 仓库职责

本仓库实现 2.0 引擎与 openxiangda 统一分发入口。经 2026-09-07 用户确认，只有根包分发层负责 V1/V2 工作区识别和独立引擎分派；1.x 业务仍由独立工具维护，V2 编译器和运行时不加入 SDD、资源发布或业务兼容层。分发决策见 `docs/architecture/2026-09-07-stable-distribution-generation-routing.md`。产品方向以 `docs/architecture/product-north-star-v2.md` 为准，开发者交付整改见 `docs/architecture/2026-09-06-developer-guidance-lifecycle.md`。

默认路径是业务无关的模型、显式 CRUD、当前用户权限、本地连接开发和简单交付。客户例子不定义平台模型。标准审批、通知和真实后端业务动作按需启用，不进入未启用这些能力的默认应用。

## 开发与架构

- 使用 Node.js 24 和 package.json 锁定的 pnpm。根包 openxiangda 是应用消费入口，物理包独立版本化，组合由机器确定。
- 在权威 master 上开发，先同步并检查工作区；保留其他任务未提交内容。每仓库单个写者，提交子模块后更新平台根仓库 gitlink。
- 涉及实现契约时先记录问题证据、能力所有者、不变量、影响、失败/并发、资源与安全边界、回滚和可证伪验收。未明确的权限、数据和外部副作用决定先解决。
- 一个提交只处理一个架构主题；相邻发现另行处理。优先可独立回退的更改，明确稳定 1.x、其他租户和生产的影响范围。
- 日常运行 pnpm verify:affected，发布候选运行 pnpm verify:release。公开包变更附 Changeset，不在发包时临时选版本。

## 应用边界

- React 应用消费平台 PC/移动组件。标准业务字段使用 Field Kit；PC 使用 Ant Design，移动使用有作用域的 openxiangda/mobile。应用的文档重置和局部样式由应用管理。
- 普通 CRUD 由平台 Data API 执行。真实事务、业务不变量或外部集成才启用 Nest；使用标准启动器和 SDK。
- dev 运行本地 Web、回环代理和按需 Nest，连接远端测试平台，不要求本地 Docker、数据库或模拟平台。
- 当前用户与角色并集由平台提供。Perspective 只缩小读取范围，不改变写入、工作流或业务动作授权；断言、凭据修订和授权快照是内部传输事实。
- 平台唯一拥有身份、授权、数据、环境与部署状态。应用不复制这些权威，不修改生成契约或绕过受支持的扩展点。
- 标准后台使用组件默认外观，不生成全局配色偏好或第二套主题状态。自定义用户页使用受支持的布局和局部样式，Tailwind 工具类不向共享运行时引入 preflight。

## 资料维护

中文使用专题在 docs/ 维护；Skill 参考、根包资料与 MCP 正文由同一源生成。入口 Skill 只负责任务分流，AGENTS 平台段只保留稳定项目约定。命令名、字段名和错误码保留稳定标识，面向用户的说明使用中文。

应用全流程记录统一使用 AppSpec：总纲与变更关联需求、架构、权限、性能、验收和交接。普通检查可用于发现缺口，测试发布核对设计与计划，生产晋级核对原测试版本的实际验收；不编造用户确认或通过证据。当前规则见 docs/appspec.md，完整实施方案在平台根仓库 docs/architecture/openxiangda-v2-guided-development-lifecycle.md。

资料变更验证真实示例、发布包路径、MCP/CLI 行为和版本，不使用固定英文句子充当行为测试。历史 ADR 标注状态，维护者测试语料不进入应用开发的必读资料。

## 发布

2026-09-06 已确认 npm 发布与 GitLab 无关，详见 `docs/architecture/2026-09-06-npm-release-ownership.md`。可信本机维护者串行执行正式发包，GitLab/镜像 CI 只验证源码，不保存 npm 凭据。

1. 评审 Changeset，在干净且同步的 master 执行 release:version。
2. 评审生成版本差异，提交并推送；运行 pnpm build、pnpm reference:install:from-build 安装验证候选参考应用，评审其差异并提交推送参考仓库 master，再执行 release:plan。
3. verify:release 冻结同一候选 tarball 并产生验证回执。
4. release:publish 只发布回执中的字节，按原制品恢复中断，读回 registry 内容和标签。
5. reference 锁文件同步单独执行；平台组合固定精确主线提交与镜像摘要，按已有运维入口部署。

源码检查、包发布、站点部署和业务验收分别报告。生产晋级复用成功测试版本，不重复构建。生成 dist、模板副本、构建文档与工具缓存不提交。
