# 聚合日历时区合同

2026-09-05，基础批次 E 的共享合同部分。实现前决定与真实 SQL 证据由平台根仓库
`docs/architecture/2026-09-05-foundation-c-f-delivery.md` 及服务端
`docs/architecture/2026-09-05-foundation-data-capacity.md` 记录。

同一聚合受连接池历史 TimeZone 影响，无法保证报表口径。既有 Native Data API
是唯一聚合执行者；共享 DataAggregateQuery 新增可选 timeZone，缺省 UTC，
语义由服务端校验 IANA 名称（如 Asia/Shanghai），拒绝裸数字偏移。
JSON Schema 只限制为 1–64 字符；不复制一份容易漂移的时区数据库。
datetime 分桶使用指定时区，date 字段保留日历日期。直接聚合和 batch 使用同一合同。

不增加报表缓存、权限存储或客户端统计。原有行/字段权限、查询与响应预算保持同源；
服务端通过事务级设置隔离连接池状态，非法时区在事务前失败。能力只影响 2.0 Native
聚合，不改动 1.x 或租户数据。本单元没有迁移，需将共享包和服务端纳入同一发布组合。

可证伪验证：工具链既有 contracts/check/test/build，服务端的默认 UTC、显式 Shanghai、
date-only、无效名称/数字偏移、连接池前态变化及真实 PostgreSQL 分桶独立计算。
源码验证不代表发包或远端业务验收。回退共享包前先移除应用中的 timeZone 参数；
旧服务端会拒绝新参数，不能只回退服务端而继续发送该属性。
