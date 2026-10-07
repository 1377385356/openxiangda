# 冻结工具发行与主线前进

证据：c62044f0 的七个冻结候选通过全部源码、安装包、178 个浏览器和独立参考应用检查后，远端 master 合入已评审的隐藏字段修复，末尾 exact-tip 检查拒绝记录验证结果。候选仍完整包含在权威主线，制品、源码和参考应用均未变化；当前规则把无关后续提交当作冻结制品失效。

Owner 是既有工具发行状态机、冻结 manifest 和 Git 主线。新候选冻结前仍要求干净 master 精确等于 origin/master；已有同 HEAD 的合法冻结回执允许远端主线前进，必须验证候选 HEAD 仍是权威 master 祖先。不能修改 manifest HEAD、tarball、源文件、版本或参考应用证据来恢复。源提交被 force-push 移除、脏源码、错误分支、失配回执或发布版本冲突仍失败。原版本可用性、dist-tag 并发、发行锁、原字节发布和 GitHub 来源检查保持。

本轮先将实际新增的根包 Changeset 按正式版本流程纳入新候选；新候选再冻结一次。保留 c62044f0 的原 manifest、tarball 和通过记录作为未发布候选证据，不将它标为已发布，也不重复使用新 HEAD 的旧证据。修正发行守卫单独提交；没有新 npm 包 API、运行契约、密钥或数据库变化。

验证采用真实 Git 历史：冻结前必须精确主线；冻结后后续普通提交允许；force-push 移除旧候选拒绝；回执 HEAD/格式失配不获得宽松准入。随后按既有 release:plan、verify:release、release:publish 运行；新包内容变化仍按正式计划验收。回退此脚本只恢复更严格的准入，不撤回已发布制品或删除发行证据。V1 与平台运行服务不受影响。

第二轮证据：f953c2f2 的 release:plan 已正式冻结七包 manifest，但它尚未创建 planned receipt；参考应用准备期间主线推进到 3a8360d4，验证入口因仍存在旧 HEAD 回执而再次拒绝。冻结事实的唯一 owner 是既有 manifest，不应以稍晚生成的验证回执作为唯一判断。入口在预期 Git 缓存路径读取同 HEAD、同 registry、完整公开包集合且逐包摘要校验通过的 manifest，允许祖先准入；缺失 manifest 继续要求 exact tip，失配或损坏直接拒绝。release:plan 在生成新制品前同样检查干净 master 和主线关系，已有 manifest 仅复用原字节。它不将任何验证状态提升为 validated，也不跳过实际门禁。

补充验收覆盖 plan→参考准备→主线前进→首次 verify 的空隙，以及 HEAD/registry/包集合/字节损坏和未冻结状态。新源提交按正式 Changesets 纳入已评审的变量显示修复，重新冻结该新候选一次；旧候选记录仍不冒充新候选证据。修复限于发行编排，不增加 npm API 或平台部署状态。
