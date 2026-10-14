# 当前用户家校班级目录

状态：实施；用户已授权平台能力升级与隔离 worktree。

问题证据：平台已投影家校角色的来源班级 ID，但浏览器/Nest 只能读角色事实，无法取得权威班级名称、校区、学段和年级。应用不得建立第二份学校/班级目录或相信提交者传来的名称。

所有者：平台组织目录。新增本人目录 GET /platform/organizations/me/directory-classes 与精确 Named Action POST /applications/:appCode/directory/current-classes；浏览器和 Nest 通过正式 SDK 消费同一投影查询。

不变量：租户、当前人及工作组织只能来自平台会话或已核验 invocation/dev-session。查询每次重新验证活动组织、安装、成员、主体及来源角色事实，并把班级的 corpId 与组织绑定。同一来源班级 ID 在兄弟学校不能串用。仅返回当前人的 teacher/head_teacher/guardian/student 班级，管理员权限不扩张来源目录。区分 directoryClassId(UUID) 与 sourceClassId(来源范围字符串)，不返回人员、unionId、raw 或安装秘密。

契约：DirectoryClassPage 包含有界名称/来源 ID/本人 roleCodes，最多200项，以班级UUID游标分页；具名动作显式声明 platformAccess.directoryClasses.maxIds(1..20)，只解析1..maxIds个不重复的来源班级。任一班级不可见时整体拒绝，不部分成功。内部 actor 加入来自原证明的 activeOrganizationId；事件/标准流程没有可信工作组织时不能消费此能力。新增 capability directory.current-classes 1.0.0；旧应用不声明时编译产物不改变。

并发与失败：目录查询的 SQL 同时检查主体/事实/成员/安装活动状态。页面响应绑定捕获的用户、组织与会话 epoch；切换丢弃旧响应。目录快照仅用于派生标签，提交仍通过 Native 事务 actor-authority 和行权限重新检查，不把快照当授权令牌。不添加缓存、轮询、目录写入口或手机号匹配。

资源边界：分页200，选择20，SQL参数化并按id排序；现有租户+corp+class和主体/事实索引可用，独立PG验证兄弟校相同sourceClassId、撤销事实/成员/安装及分页。无SQL迁移，无稳定1.x行为变动。响应严格解析；不支持应用传入user/org/corp/env覆盖证明。

回滚：加法契约，未部署能力时要求预检失败；回退不得发布依赖新能力的应用。保留权威主线精确提交后才正式发SDK/镜像。

可证伪验收：真实PG多来源角色去重/分页/角色或成员撤销/跨租户跨校ID隔离，HTTP拒绝额外身份参数，编译器拒绝缺声明与超限，Nest精确证明/全部ID匹配，Browser组织切换在途隔离，最终真实样板间同步、真人允许/拒绝与应用submit单独验证。
