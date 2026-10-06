---
"openxiangda": minor
"openxiangda-skill-kit": patch
---

新增 openxiangda/expressions 纯表达式入口，供浏览器和原生 Node ESM 后端共享 WorkflowExpression 与既有计算器，避免共享业务契约带入浏览器客户端依赖。应用继续只依赖统一根包，不直接安装内部契约包。
