---
'openxiangda': minor
'openxiangda-cli': patch
'openxiangda-contracts': minor
'openxiangda-devkit-core': minor
---

生成式用户标准面：一行 user: true 提供"我的记录 + 提交"用户端页面

- CRUD 视图新增 user 选择（布尔或 { home?, listLabel?, submitLabel? }）：编译器生成 resource-records / resource-submit 两种 user surface 标准路由（双端路径 /my/<resource> 与 /m/my/<resource>），能力分别接线资源 read / create。
- 首个启用资源自动成为登录落地页与根路径（清单 rootEntry + 登录默认路由占位自动改写）；多资源时 user: { home: true } 显式指定。
- 运行时新增"我的记录"标准组件（默认 created_by 展示过滤 + 分页 + 行详情抽屉 + 提交入口，桌面/移动双端）与"提交"标准页（复用生成表单）；GenericResourceQuery 新增显式 createdBy 过滤，不放宽其他系统字段。
- "仅本人"是展示过滤而非授权边界，行级隔离仍由 dataPolicies 声明承担（文档已明示）。
- 未声明 user 面的应用零行为变化。
