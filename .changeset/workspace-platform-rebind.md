---
"openxiangda": patch
"openxiangda-cli": minor
"openxiangda-devkit-core": minor
---

新增 `openxiangda link` 命令：默认只读展示工作区平台绑定、登录态匹配与 git origin 归属；`link rebind --base-url <平台>` 提供此前缺失的受支持换绑路径，替代手改 `.openxiangda/link.json`。

- 换绑只改本地绑定（appCode 取自工作区声明、baseUrl 归一化、清空旧站点环境列表），不调用平台 API、不修改 git remote、不迁移登录凭据；换绑后按 login → create（幂等初始化）→ source status/setup --import 顺序完成站点切换。
- 安全边界保持：appCode 不一致拒绝（`OPENXIANGDA_LINK_APP_CODE_CONFLICT`）、目标与当前一致时幂等、`OPENXIANGDA_PLATFORM_SESSION_MISMATCH` 系列提示全部指向显式换绑命令。
- 文档：getting-started 新增「跨站点与平台换绑」章节与交接/跨站点场景表；决策记录见 docs/architecture-decisions/workspace-platform-rebind.md；CLI 参考与 Skill 资料随注册表再生成。
