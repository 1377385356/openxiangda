---
"openxiangda-devkit-core": minor
"openxiangda-cli": minor
---

连接开发代理保留应用登录 cookie、CSRF 和显式调用身份；普通业务操作经过平台可信网关，拒绝时不回退开发者。新增 `dev --identity browser`，退出登录后继续使用应用登录模式。普通本地 Nest 源码调用仍须后续开发 Head 调用协议，当前不将普通用户转成开发者。
