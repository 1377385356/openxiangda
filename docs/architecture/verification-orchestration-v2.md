# OpenXiangda 2.0 验证编排边界

## 问题证据

仓库级 `turbo run check test build` 同时调度了模板根包
`openxiangda-application` 和它的 `@app/*` 子包。模板根包为了让生成后的独立应用可用，
其 `build/check/test` 又会递归运行同一批子包。两个 `@app/web build` 并发操作同一个
`dist`，出现构建已经输出文件、随后校验却收到 `ENOENT` 的竞态。

## 能力所有者与不变量

- 仓库级任务图唯一由 Turbo 所有；每个真实包的每种任务只允许一个写者。
- `openxiangda-application` 只是在生成应用后使用的聚合入口，不是仓库级验证单元。
- 模板根包继续保留递归脚本，确保复制成独立项目后仍可直接执行
  `pnpm build/check/test`。
- 仓库验证排除聚合包，但仍直接并行验证 `@app/server`、`@app/web`
  和 `@app/contracts`，不降低覆盖范围。

## 失败、回退与验证

`scripts/verify-workspace-orchestration.mjs` 在每次 `verify` 和
`verify:affected` 前检查以上边界。若聚合包改名、仓库脚本遗漏排除规则或生成应用失去
聚合脚本，验证会在启动昂贵任务前失败。该修改只影响 2.0 仓库本地/CI 编排，不改变
应用运行时、平台服务或生产部署；回退只需恢复仓库级脚本。
