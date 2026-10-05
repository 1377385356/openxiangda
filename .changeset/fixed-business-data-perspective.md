---
"openxiangda-nest": patch
"openxiangda-skill-kit": patch
---

修复具名业务 Data API 将用户读取 Perspective 转发给受信 Native 业务主体而被拒绝的问题。固定动作证明、当前办理人事务校验和原请求读取视角保持，普通 Data API 继续继承读取范围。
