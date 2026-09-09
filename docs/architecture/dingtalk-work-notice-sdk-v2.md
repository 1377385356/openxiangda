# DingTalk OA work notice SDK

OpenXiangda 2.0 applications can send platform owned DingTalk OA work notices
without handling DingTalk credentials. The request is made through the
request-scoped `OpenXiangdaNotificationService` and is bound to the current
user and module environment.

```ts
const accepted = await notifications.sendDingTalkWorkNotice({
  idempotencyKey: `invoice-${invoice.id}-notice`,
  target: { kind: 'users', userIds: [invoice.ownerUserId] },
  content: { type: 'markdown', title: '发票已入账', text: `金额：${invoice.amount}` },
});
const result = await notifications.getDingTalkWorkNoticeResult(accepted.id);
```

`target.kind` accepts `users` (Native user IDs), `departments` (Native
department IDs), or `all`. The platform resolves department external IDs,
keeps credentials in Secret references, applies the active OA channel, and
records the normal Notification Hub message, delivery, retry, and audit
records. The first content types are `text` and `markdown`; callers must use
an application owned idempotency key and keep recipient lists bounded.
