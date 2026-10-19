# V2 国内 registry 迁移

正式 V2 源为 https://npm.syedu.tech，读取无需凭据；源码权威仍是 GitHub master。npm 官方历史版本不会被替换或自动重定向。

## 用户安装

```bash
npm install -g openxiangda@latest --registry=https://npm.syedu.tech/
```

新应用由官方模板生成不含凭据的项目 `.npmrc`。现有应用设置 `registry=https://npm.syedu.tech/` 后运行统一入口 update install；保留锁文件，核对变更，不自动升级业务依赖。当前包名没有 scope，因此项目其他依赖通过 registry 的 npmmirror 代理获取。既有 Dockerfile 需对照新版添加 NPM_REGISTRY 构建参数和 npm/Corepack registry 环境，不覆盖业务构建步骤。

## 一次性导入

`scripts/migrate-registry.mjs <snapshot-directory>` 冻结七包最新 stable-v2/latest 元数据与精确内部依赖闭包（包含统一入口的 npm alias：openxiangda@1.0.269）。输入为 npm 官方 `<包名>-metadata.json` 快照；`--apply` 要求专用 `OPENXIANGDA_MIGRATION_TOKEN` 环境凭据。读取最多三并发，上传串行；回读 metadata 与原 tarball SRI 后记录无凭据回执。已存在不同摘要/渠道即停止，写入异常只回读不盲目重发。全部版本就绪才切换 stable-v2/latest。

用户已明确无需历史，仅迁移最新正式版本。此前已导入的部分旧版本保持不变，旧计划和回执留在运维证据中，不补齐或删除重发。内部包各自独立版本，不能给七包统一指定根包版本。

## 后续发布

遵循 npm-release.md 的 Changesets → version → plan → verify:release → publish。默认 registry 固定为本服务；不采用维护者机器无关的 npm 镜像作为发布目标。测试显式覆盖 registry；冻结回执绑定 registry，不通过编辑回执跨源重放。认证放在维护者用户级配置，不进入源码、tarball、Docker 层或日志。

## 第三方 URL 依赖

xlsx 0.20.3 使用 https://npm.syedu.tech/vendor/xlsx/0.20.3/8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8/xlsx-0.20.3.tgz，原始 SHA256 不变，锁文件额外固定 SHA512。历史包保持原字节，其原有 GitHub 直链不回写；需要完整国内下载的应用应升级到此次迁移后的正式版本。
