# npm 发布与 Git 托管分离

用户在 2026-09-06 明确纠正：“发布 npm 和 gitlab 没关系”。此前把正式发包限定为 GitLab CI 是错误的实施前提。本决定取代 2026-09-05-ci-publication-boundary 与 gitlab-12-release-executor 中关于 CI 独占发布的要求。

npm registry 是包内容和 dist-tag 的权威，维护者在可信本机执行现有 release:version、verify:release、release:publish。Git 继续负责精确主线源码、包版本与标签记录，GitLab 和镜像 CI 只负责源码验证，不再配置发布 runner 或保存 npm 凭据。不引入直接 npm publish 或运行时选版本的旁路。

保留全部真实门禁：评审 Changeset、干净同步的 master、机器推导版本、独立应用候选锁、冻结 tarball/完整性、验证回执、发布前后 registry 读回。同一发行只有一个维护者进程；在途回执只能以原 HEAD、原制品恢复，不重打包或覆盖已发布字节。Git 标签仍记录对应源码，不以 CI job 成败代替 npm 是否成功。包验证失败不得使用 CI 或本地直发绕过。

本次临时项目 runner 及此次新增的发布变量撤销，已发布版本保留。无平台、租户、数据库、运行时变更；撤销此决定需要明确的新发布需求。验证检查 CI 仅做源码、正式发布脚本门禁保持、公共包与参考锁一致，再按原计划部署和真实验收。
