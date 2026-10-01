---
"openxiangda": patch
"openxiangda-cli": patch
---

修复 StrictMode 同一提交内 effect 清理、重挂载重复读取 current：取消观察立即生效，共享 owner 在一个微任务内确认无人接管后释放，身份安装必须仍有活跃观察者。原读取预算、最后退订取消、退出和真实作用域失效边界保留。
