# 稳定字段值合同与 UI 依赖边界

状态：2026-08-16 已实现待发布

本决策是[稳定字段数据协议采用与声明分层决策](./stable-field-protocol-adoption.md)的实现收口，只调整 OpenXiangda 2.0 包所有权和应用依赖图，不改变字段值、数据库、Data API 或 1.x 运行时协议。

## 1. 问题证据

独立参考应用的 NestJS 后端只从 `@app/domain` 导入 `PurchaseRequestRecord` 类型，但当前依赖链为：

```text
@app/server
  -> @app/domain
    -> openxiangda-field-kit
      -> antd
      -> antd-mobile
      -> React peer/runtime dependency tree
```

`pnpm --filter @app/server deploy --prod --legacy` 实测生成约 253MB、195 个生产包，并报告 `antd-mobile`/React peer 依赖。`@app/domain` 使用 Field Kit 的唯一原因是三个稳定值 TypeScript 类型；后端不渲染任何组件，也不执行 Field Kit codec。

这不仅增加镜像构建、传输、解压和漏洞扫描成本，也违反已确认的不变量：稳定字段值协议必须是不依赖 React 的跨前后端共享合同。

## 2. 能力所有者

| 能力 | 唯一所有者 |
| --- | --- |
| 稳定字段值形状 | `openxiangda-contracts` |
| DataResource、Data API 与工作流跨进程合同 | `openxiangda-contracts` |
| 值归一化、格式化和平台文件/组织控制器 | `openxiangda-field-kit` |
| Desktop/Mobile/Readonly/List/Detail renderer | `openxiangda-field-kit` |
| 应用业务记录与输入类型 | 应用 `packages/domain`，只组合 contracts 类型 |
| NestJS DTO、业务校验和写入 | 应用 `apps/server` |

`openxiangda-contracts` 不依赖 Field Kit、React、Ant Design、浏览器 API 或 Node 专属运行时。Field Kit 可以从 contracts 导入并重新导出稳定值类型，方便 UI 代码使用，但不能成为这些类型的事实源。

## 3. 稳定不变量与受影响合同

跨前后端值形状由 contracts 统一导出，Field Kit 不复制定义：

- `LabeledValue`、`ResourceReferenceValue`
- `UserReferenceValue`、`DepartmentReferenceValue`
- `DataFileRef`、`DataImageRef`
- `StableSignatureValue`
- `StableAddressValue`、`StableLocationValue`

受影响的公开面只有 TypeScript 导出所有权：

1. `openxiangda-contracts` 根入口和 `/browser` 入口新增上述类型。
2. `openxiangda-field-kit` 继续重新导出上述类型，现有前端源码无需迁移才能工作。
3. 官方模板和参考应用的 `@app/domain` 改从 `openxiangda-contracts/browser` 导入，并删除对 Field Kit 的生产依赖。
4. Web 应用仍直接依赖 Field Kit，并继续使用其 Desktop/Mobile 组件、codec、附件与平台数据能力。
5. 官方 NestJS Dockerfile 只安装 `@app/server...` 的 workspace 闭包，并在复制源码前禁用 lifecycle script；源码复制后显式执行所选 workspace 的 build，再以已构建产物生成生产目录。前端源码可以仍在 Git 仓库中，但不进入后端依赖安装和构建步骤。

数据库物理类型、JSONB 形状、查询运算符、索引、Data API 请求、业务 API、AppPackage schema 和平台部署合同均不变化。

## 4. 失败、并发与安全边界

- 这是编译期所有权迁移，不新增并发状态、缓存、迁移表或运行时分支。
- contracts 与 Field Kit 的声明不一致必须由 TypeScript 和包测试直接失败，禁止复制两份相似接口。
- 服务端模板的生产依赖边界必须静态拒绝 React、React DOM、Ant Design、Ant Design Mobile、Umi、Admin 和 Field Kit。
- 前端仍必须通过 Field Kit 提交稳定值；本次瘦身不授权应用后端或自定义页面发明新的人员、部门、地址或附件格式。
- 不增加新的网络权限、Secret、数据库权限或容器特权。后端运行镜像只减少无关依赖。
- Docker 依赖层只复制根/服务端/domain/contracts manifests 与 lockfile，避免普通前端源码修改击穿后端依赖缓存。安装阶段使用 frozen lock，不能在镜像构建中改写解析结果。
- Field Kit 的实质变更要求候选 tarball、新应用浏览器构建/E2E、模板生成检查和独立参考应用；它本身不触发本地 PostgreSQL 生命周期、Skills 或文档门禁。只有这些领域也发生变化时才运行对应昂贵门禁，避免把“未映射包”当作理由重复执行无关历史校验。

## 5. 资源上限与回滚

服务端部署闭包不得包含 `openxiangda-field-kit`、`antd`、`antd-mobile`、`react`、`react-dom`、`@umijs/*` 或 `openxiangda-admin`。生产目录大小记录为趋势指标，不作为跨 pnpm/Node 版本的唯一正确性判断；依赖闭包门禁才是稳定约束。

回滚单位是 contracts/Field Kit/creator 的一个版本组合，以及参考应用的一个 Git/AppVersion。由于值协议和数据库未变化，回滚不需要数据迁移。1.x 代码、镜像、流程和自动化均不在改动范围内。

## 6. 可证伪验收

1. contracts 根入口与 `/browser` 可以编译导入全部稳定字段值类型，且 package manifest 无运行依赖。
2. Field Kit 的 codec、Desktop、Mobile、格式化和现有测试继续通过，证明只移动所有权、不改变值行为。
3. 官方模板 `@app/domain` 和独立参考应用 `@app/domain` 不再依赖或导入 Field Kit。
4. `pnpm --filter @app/server why openxiangda-field-kit|antd|antd-mobile|react` 不再出现来自服务端的生产依赖路径。
5. `pnpm --filter @app/server deploy --prod --legacy` 生成的目录中不存在上述 UI 包。
6. 后端 Docker 构建日志的安装/build 选择器只包含 server、domain、应用 contracts；最终镜像启动和 readiness 通过。
7. 官方模板 check/test/build、独立参考应用 check/test/build 和工具链 `verify:affected` 全部通过。
8. Changesets 确定性覆盖 contracts、Field Kit 和 creator；发布后从 registry 创建的新应用重复第 3-7 项。
9. 参考应用使用同一 AppPackage 先部署 preproduction，再显式晋级 production；Data API 与字段往返结果保持一致。

## 7. 当前实现证据

- contracts、Field Kit、官方模板 check/test/build 与 49 项 affected task 已通过。
- Field Kit 的单/多选、地址、附件、UI 校验分层和移动 renderer 测试全部通过。
- 新的服务端生产目录约 54MB、85 个包，相比基线分别减少约 79% 和 56%。
- 生产目录未发现 Field Kit、React、React DOM、Ant Design、Ant Design Mobile 或 Admin。
- 瘦身后的生产目录已直接启动 NestJS，平台健康/就绪、事件、工作流 provider 和采购 App API 路由均完成注册。
- 正式发包、registry 新应用、Docker 镜像和线上 preproduction→production 仍是本主题的剩余验收。
