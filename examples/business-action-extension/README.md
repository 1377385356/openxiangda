# Add a business action to an ordinary application

Create a blank application with `openxiangda create <directory>`. Its Web and
shared contracts run without application Nest. To extend that existing app:

1. Add `backend: { enabled: true }` to `openxiangda.config.ts` and run
   `pnpm openxiangda check`. The tool initializes `apps/server` and installs its
   exact dependencies once. Normal check/dev retries an interrupted installation.
2. Copy `extension.config.ts` to the app root and `submit.controller.ts` to
   `apps/server/src`. In the root configuration import `businessExtension` and
   replace the empty `modules: []` slot with `...businessExtension('<app-code>')`.
3. Import `SubmitController` in `apps/server/src/app.module.ts` and add
   `controllers: [SubmitController]` to its `@Module` declaration. Keep the
   generated platform bootstrap unchanged. Run `pnpm openxiangda check` again.
4. Assign the example's explicit `submitter` role to a test user through the
   platform. The example deliberately does not create role grants automatically.
   Start `pnpm dev`; call the generated `submissionSubmit` operation from your
   authenticated Web page with `{ title, idempotencyKey }` using the standard
   application API client. Reuse that key and unchanged body after an uncertain
   response. Both records commit in one platform transaction and replay returns
   the same transaction receipt without creating a second pair.
5. `pnpm openxiangda deploy` follows the same immutable backend image and app
   package path as any Nest extension. This command is a later release action.

The role authorizes a business action; its trusted Data SDK runs within the
platform's app/environment boundary and keeps the initiating user in audit.
It does not expose generic CRUD routes. Replace the example module with actual
business declarations before using it as an application.

For external effects, append an `emitEvent` operation to the same platform
transaction and declare its producer/subscription. An `@OpenXiangdaEventHandler`
consumer uses the platform event receipt and the event's stable idempotency key
when calling an idempotent external provider. A provider that has no idempotency
or query receipt contract requires an explicit reconciliation design; the SDK
does not promise exactly-once delivery for arbitrary remote side effects.

On failure, use the SDK error's `request.requestId`, `request.method`,
`request.path` and `code` to correlate platform requests with the structured
action logs from `OpenXiangdaLoggerService` and `openxiangda logs`. Neither the
example nor application state stores platform tokens, authorization snapshots,
transaction receipts in a second database, or channel credentials.
