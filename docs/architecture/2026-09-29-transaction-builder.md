# 公共事务构建入口

应用曾将只读条件写成 record-assert，或同一记录声明多次写入，直到平台提交才发现问题。SDK Nest 层新增 createDataTransaction，通过公开 openxiangda/nest 消费。

平台事务契约与 validateDataTransactionRequest 是唯一语义权威。构建器只积累操作/约束，build 调用同一校验器；保留操作顺序、索引、幂等键和原错误路径，不自动合并或重排写入，不执行网络请求。错误补充 operationIndex、guardIndex 和建议，不附记录内容。

输入输出深复制，避免调用者随后修改改变已建事务。operation 返回稳定索引，reference 只允许引用本构建器已有 create 的 id。事务 100 操作/20 约束上限沿用协议。独立导出诊断入口，既有手写请求可以同样预检。

新增 API 不改变已有 idempotentTransaction 的兼容行为。无 V1 或平台数据库变化；回退包版本即可。验证错误守卫、同记录多写、合法 CAS、创建引用、输入变更隔离和边界；发布使用实际 tarball 验证导出。
