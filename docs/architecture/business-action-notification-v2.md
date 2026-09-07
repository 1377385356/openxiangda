# Business Action Notification v2

## Problem evidence

`OpenXiangdaNotificationService` is request scoped and forwards the verified
gateway invocation to the management `/notification-hub/send` endpoint. That
endpoint requires the caller to hold the global
`app:notification2:send` permission. An ordinary user can therefore pass a
declared Named Action at App Gateway ingress and still be unable to let that
trusted action send a business notification. Granting the global management
permission to every business role would expose a broader platform operation
than the action that the role is allowed to invoke.

The same management facade also rejects the application principal used by a
signed Application Events/date-trigger consumer. Letting that consumer call the
management endpoint would either require a global send scope or allow it to
invent a user identity and recipient payload. The event path therefore needs a
separate proof tied to the platform's durable event delivery fact.

## Capability owner

- App Gateway and the immutable App Operation contract own interactive caller
  authorization. They authorize the current role union once and issue the
  short-lived invocation proof delivered to the Nest runtime.
- Notification Hub v2 remains the only owner of templates, logical messages,
  recipient projections, idempotency, ordering, channel credentials, delivery,
  callbacks, dead letters and notification audit.
- The application backend owns only its business decision to send, the bounded
  variables or event projection paths, message convergence keys and canonical
  navigation target. On an event path, the platform resolves recipients and
  presentation values from the persisted event fact.

No second notification store, template registry, delivery queue or application
permission system is introduced.

## Stable invariants

1. The interactive user's original access token stops at App Gateway. The Nest
   runtime receives only the platform-issued invocation token and assertion.
2. `OpenXiangdaBusinessNotificationService` is usable only inside a controller
   method bound to an immutable `OpenXiangdaOperation`. A user or connected
   developer must already hold that operation's `requiredCapability`.
3. The platform accepts the business send only when the action code and
   capability match the active AppVersion contract and the invocation target
   matches tenant, app, environment, AppVersion and Head revision. Connected
   development uses the bounded Dev Session projection instead of a published
   action lookup.
4. After that proof succeeds, Notification Hub records the sender as the
   platform-managed virtual principal for the exact app/environment/action. The
   initiating user or application and invocation/Dev Session proof remain in
   the message source snapshot and audit detail.
5. The caller does not need `app:notification2:send`. That global permission
   continues to protect the existing management send endpoint and is not
   weakened.
6. Notification Hub remains at-least-once and convergent: `eventId` suppresses
   duplicate APP_REQUEST events, `idempotencyKey` suppresses request retries,
   and `messageKey + sourceSequence` rejects stale desired-state updates.
7. The platform owns the immutable built-in template
   `application.informational.standard` with only `title` and `summary`
   variables. Application-owned versioned templates are outside this release.
8. A signed event consumer may send only while holding an application
   credential for the exact tenant/app/environment and presenting the exact
   eventId, deliveryId and subscriptionCode of a persisted platform delivery.
   The platform resolves recipient/title/summary paths from that event's
   immutable `data_json`; the application cannot submit recipient IDs or claim
   an initiating user.

## Public contract

- `ApplicationNotificationSendV2.eventId?: string` is an optional UUID used for
  event-level replay suppression.
- `OPENXIANGDA_NOTIFICATION_APPLICATION_INFORMATIONAL_TEMPLATE` is the stable
  template code. The compiler emits it through generated
  `notificationTemplateCodes.applicationInformational` so AI does not invent a
  template code.
- `OpenXiangdaBusinessNotificationService.send(input)` sends through a separate
  business-action route. `OpenXiangdaNotificationService` remains the
  explicitly privileged management facade.
- `OpenXiangdaBusinessNotificationService.sendFromEvent(input)` uses the
  current signed event context and application credential. Its contract names
  bounded dot paths under event `data` for recipients, title and optional
  summary; it never accepts caller-supplied recipient values.
- Business code supplies no tenant, app, environment, actor, application
  credential, action code or action capability. Those values come from the
  verified runtime context.

## Failure, concurrency and idempotency

- Missing operation metadata, non-user/developer context, missing proof,
  malformed action headers, capability denial, target mismatch and active
  contract mismatch fail before Notification Hub opens its write transaction.
- Event sends fail when there is no current signed event context, no matching
  durable delivery, an application scope mismatch, an unsafe/missing projection
  path, or a projection that exceeds recipient/text limits.
- `eventId` is unique for APP_REQUEST messages within
  tenant/app/environment. Reusing it for a different `messageKey` returns a
  structured conflict; an exact replay returns the existing message.
- `idempotencyKey` retains the existing scoped uniqueness and conflict rule.
- A lower or equal `sourceSequence` for an existing `messageKey` is a no-op;
  a greater sequence advances the logical message and delivery projection.
- Template absence, invalid variables, recipient limits, ingestion pause,
  quota failures and database conflicts keep the existing Notification Hub
  structured error behavior. Delivery remains asynchronous.

## Security and resource bounds

- Action and capability codes keep their existing 128/256 character limits.
- Invocation proof lifetime and Head binding are unchanged.
- `eventId` must be a UUID. Existing bounds remain: at most 1,000 recipients,
  64 KiB variables, ten actions and bounded navigation values.
- The business endpoint cannot send an advanced DingTalk card or select
  provider credentials. It only accepts the channel-neutral application
  contract and active Notification Hub templates.
- Event projection paths are limited to ten simple dot segments beneath
  `data`, recipients resolve only to one or more non-empty Native user IDs,
  and title/summary resolve only to bounded scalar values. Event actors are
  always audited as application/event source, never user.

## Compatibility and rollback boundary

- This is additive OpenXiangda 2.0 behavior. OpenXiangda 1.x routes, tables,
  permissions and templates are untouched.
- Existing `/notification-hub/send`, SDK facade and
  `app:notification2:send` behavior remain unchanged.
- Rollback removes the new SDK/export/route and reverts the partial APP_REQUEST
  event-id index. Existing messages and audit rows are retained and remain
  readable by the previous Notification Hub.

## Falsifiable acceptance

1. An ordinary role with a declared action capability, but without
   `app:notification2:send`, can call the Named Action and create one
   `application.informational.standard` message.
2. The stored message and audit show a platform-managed application actor plus
   the initiating user and exact action code/capability.
3. Direct calls without business-action proof, a mismatched action/capability,
   stale Head, undeclared operation, or denied capability fail without a
   message row.
4. Replaying the same `eventId` or `idempotencyKey` creates no second message;
   reusing either for a different logical message conflicts.
5. A higher `sourceSequence` updates the same `messageKey`; an equal or lower
   sequence cannot regress it.
6. The compiler output, package exports, Nest tests, platform unit tests,
   PostgreSQL migration verifier and AI Skill reference all agree on the same
   template code and business-action boundary.
7. A date-trigger/signed event consumer can send from a real persisted delivery
   without `app:notification2:send`; changing deliveryId/subscription/app scope
   or directly supplying a recipient fails, and a delivery retry replays the
   same `eventId` message.
