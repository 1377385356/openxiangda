---
"openxiangda-contracts": patch
"openxiangda-devkit-core": patch
"openxiangda": patch
"openxiangda-cli": patch
"openxiangda-mcp": patch
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
---

修复显式开启受控资料删除的action-owned模型无法授予资料删除能力的问题。双编译器仅允许该删除能力用于维护入口，普通Native创建/更新/删除仍由原mutationOwner限制；未声明或显式关闭的模型继续拒绝对应授予。补充带真实角色声明的消费回归。
