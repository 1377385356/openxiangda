# ADR: OpenXiangda 2.0 唯一开发入口与智能体合同

状态：Accepted
日期：2026-08-23
范围：2.0 CLI、创建模板、唯一 Skill、资源与字段权限声明

## 问题证据

- 机器上的裸 `openxiangda` 仍可能解析到稳定 1.x，而 npm 上的 2.0 CLI 是独立的 `openxiangda-cli` 包；依赖 PATH 会让智能体进入错误产品。
- 当前 Codex 安装目录仍可能残留早期拆分的 architecture/frontend/backend 等 2.0 Skill，其中包含 Umi、RoleSession、本地 PostgreSQL 和 Workflow 主路径，与当前 Vite/Refine、当前用户角色并集和远程平台 Data API 的产品方向冲突。
- `openxiangda-skill-kit` 的源码已经只发布一个 Skill，但新应用没有工作区内的智能体合同，因此全新智能体仍可能依赖机器级旧说明。
- Data Resource 仍接受 underscore 资源代码，字段权限仍接受 `write` 并回退到 create/update；这些都是未正式发布 alpha 的兼容分支，会让同一语义继续存在两种声明。

## 决定与能力所有者

1. `openxiangda-cli` 仍是 2.0 唯一 CLI 包，但应用内只通过锁定依赖调用：`pnpm openxiangda <command>`。创建前使用当前 Skill 发布的精确 CLI 坐标；移动 tag 的缺陷证据和版本所有权由 `deterministic-cli-bootstrap-v2.md` 接替。2.0 文档和 Skill 不再指导执行裸全局命令。
2. 创建模板携带根 `AGENTS.md`，它与唯一 Skill 的 workspace reference 内容完全一致。新智能体即使没有机器级 Skill，也会取得正确架构合同。
3. `openxiangda-skill-kit` 只安装或原子替换 `openxiangda-v2`。它不识别、迁移或清理任何旧 Skill；旧目录不是 2.0 产品输入，由当前机器一次性删除。
4. Resource code 只允许 lower kebab-case。underscore、大小写资源代码直接在 schema/check/平台 prepare 阶段失败。
5. 字段写权限只使用 `create` 和 `update`。删除 `write` 及所有回退逻辑；未声明字段策略时 create 继承资源 create，生成器为 update 物化显式拒绝，受限字段再分别声明 create/update capability。
6. 不提供旧命令、旧 Skill、旧资源代码或旧字段策略的 alias、迁移器、兼容 export、运行时开关和自动兜底。

## 稳定不变量

- 前端固定为 Vite、React Router、Refine Core 和 Ant Design。
- 普通 CRUD 只走 Native Data API；NestJS 只承载跨资源事务、业务不变量和外部副作用。
- 当前用户身份是登录用户和一个当前应用角色；生成壳在应用个人菜单中切换角色并隐藏
  opaque RoleSession 传输，业务代码不选择或保存 RoleSession，也不保存平台 Token。
- 一个资源、字段、Surface、权限和 AI Schema 只有一个声明来源。
- 1.x CLI、1.x 应用和 1.x 平台接口不在本次修改范围内。

## 失败、并发与资源边界

- 工作区没有锁定 2.0 CLI 时立即失败，不回退到 PATH 上的 1.x。
- Skill 安装只原子替换一个精确目录；不扫描或删除前缀匹配目录。
- 资源/字段策略错误在任何平台写入、镜像构建和部署前失败。
- 本主题不读取业务数据、身份 Token 或 Secret，不修改 K3s 工作负载。

## 回滚边界

2.0 尚无正式历史应用，因此本主题只允许前向修复，不提供兼容回滚。若实现错误，恢复整个工具链和平台组合到上一个已验证 commit；已经发布的 npm 字节保持不可变，但不会获得兼容维护。

## 可证伪验证

1. 全新模板存在与唯一 Skill reference 字节一致的 `AGENTS.md`，并只出现工作区锁定 CLI 调用。
2. Skill manifest 精确包含 `openxiangda-v2`，安装器只替换这一个目录。
3. underscore 或大小写 resource code 在 contracts、compiler 和平台 prepare 中稳定失败。
4. `fieldPolicies.write` 在 contracts/compiler/平台配置中稳定失败；默认 update 被生成器显式物化为拒绝，受限字段的 create/update 分别校验。
5. 全新应用通过 create/check/test/build，源码不包含 Umi、RoleSession、Workflow、Function CRUD 或兼容适配器。
