# 原通知投递查询与恢复

应用后台需要从报名取消、摇号批次等业务来源定位原通知并处理失败。平台已有 Notification Hub 管理查询与死信重放，SDK 仅公开单消息详情，导致应用无法用支持的接口完成这一链路。

## 所有者与边界

平台拥有消息、收件人、渠道凭据、outbox、投递修订和死信；应用只保存业务来源与平台 messageId，不复制投递队列。SDK 用户态 `OpenXiangdaNotificationService` 公开 listMessages、listDeadLetters 和 replayDeadLetter，使用当前应用、环境和已验证用户。不会给事件执行器或应用服务凭据增加管理权限，也不会把 send 当作失败重试。

平台现有权限 `app:notification2:read`、`app:notification2:content:read` 和 `app:notification2:delivery:retry` 分别控制查询、内容和恢复；应用应仅给有运营职责的管理员必要权限。隐藏入口不会撤销权限，读权限也不蕴含重试权限。

死信列表增加 nullable messageId、deliveryId、correlationId，支持按单个 messageId 查询；所有关联同时限定 tenant/app/environment。事件投影阶段尚无消息时这些关联为空。没有内容权限仍隐藏错误预览和业务关联内容。

## 并发与恢复语义

重放只对未解决死信执行平台已有 CAS，更新原 outbox；如果已有更新修订送达，则返回 superseded 并结束旧死信。重复处理已解决记录会返回原有 not-found，应用应刷新状态而非创建新消息。网络结果未知先查原死信及原消息，禁止通过更换通知幂等键重发整轮。

## 验收与回滚

测试查询参数固定环境、路径转义、仅用户上下文可调用、messageId 精确关联和越界元数据不返回；保持现有 superseded/重复重放事务测试。正式业务验收需管理员从业务来源看到原通知并恢复失败投递，普通用户和审批人被拒绝。平台响应是增量字段，SDK升级可单独回退，不删除消息或改变历史投递。
