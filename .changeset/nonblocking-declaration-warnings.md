---
"openxiangda-devkit-core": patch
---

修复声明构造器把 warning 误作为无效配置而阻断的问题；外部 AI 操作缺少结果核对仍在 check 输出警告，真正错误仍阻断，不改变未知结果或业务授权语义。
