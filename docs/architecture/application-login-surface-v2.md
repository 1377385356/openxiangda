# Application Login Surface v2

Status: accepted, revised 2026-09-02

## Decision

An application login surface is presentation only. It may provide an
application-specific desktop/mobile page, assets, copy, and ordering of the
platform's declared password, SSO, and DingTalk methods. It does not own a
backend identity system, browser session, refresh family, logout state, or
token.

The platform `AuthService` owns the only authenticated browser identity:

- one `access_token` Cookie;
- one `refresh_token` Cookie;
- one platform session identifier and revocation record;
- the current platform user, including an active impersonated user;
- all refresh, logout, login throttling, credential validation, and login audit.

Both cookies are HttpOnly and are never read, stored, or returned by application
code. A 2.0 application sends same-origin requests with `credentials: include`.
The platform middleware validates the same access credential used by the
platform shell and then resolves `tenantId + appCode + environmentKey` into the
current application-role union and authorization context.

There is no application-scoped session Cookie, application refresh endpoint,
application refresh family, platform-to-application session exchange, or
identity-switch synchronization step.

## Why an application auth facade still exists

The same-origin
`/openxiangda-api/v2/applications/:appCode/auth/*` facade is a platform-owned
login UI controller, not another authentication authority. It provides:

- public method and surface descriptors for the current deployed application;
- normalized application-local `returnTo` values;
- short-lived, single-use password/SSO/DingTalk login transactions;
- OAuth state and callback binding to tenant, app, environment, provider,
  browser, flow, and return path;
- CSRF, Origin, Fetch Metadata, rate-limit error, and security-audit handling;
- a global platform logout action initiated from the application shell.

The transient `__Host-openxiangda-browser` and `openxiangda-csrf` cookies bind
the login transaction only. They contain no user identity or authorization and
are cleared on logout. OAuth state and login transactions expire and are never
accepted by application data or business APIs.

## Public declaration

`OpenXiangdaAppConfig.frontend.authentication` remains optional and declares:

- `accountMode: 'existing-platform-users-only'`;
- `registration: { mode: 'reject' }`;
- password, SSO, and DingTalk presentation methods;
- independent desktop/mobile surface routes and default protected routes.

Compilation emits generated authentication surfaces. The application supplies
only renderers through `defineApplicationContributions`; it never implements a
credential provider or receives token-shaped results.

## Runtime composition

```text
BrowserRouter(application basename)
  -> AuthenticationBoundary
       unauthenticated -> generated login route + application renderer
       authenticated   -> RuntimeAuthorizationBoundary
                           -> Refine / Shell / protected routes
```

Password submission delegates to platform password login. Successful SSO and
DingTalk callbacks resolve an existing platform user and establish the same
platform browser session. A successful login returns only a tokenless redirect
receipt.

When an application API returns 401, the browser runtime performs one
single-flight call to the platform `/api/auth/refresh` endpoint and retries the
original request once. It never calls an application refresh endpoint. A failed
platform refresh leaves the browser unauthenticated and renders the declared
application login surface.

Application logout revokes the platform session, clears the platform access and
refresh cookies, and broadcasts one host-wide logout signal so every open
platform and application tab observes the same result.

## Failure and concurrency behavior

- Login actions are single-flight in the browser and each server login
  transaction is consumed once.
- OAuth state is consumed atomically; replay, expiry, provider/app/environment/
  browser/flow mismatch fails closed.
- DingTalk JSAPI and OAuth flows cannot fall back into each other after a
  transaction selects one.
- Platform refresh is single-flight per browser tab and retries each failed
  protected request at most once.
- `unauthenticated`, authenticated-but-`unassigned`, capability denial, and
  dependency failure remain distinct states.
- Identity switching rotates only the platform token pair. Every subsequent
  application request therefore observes the selected platform user without a
  bridge or synchronization call.

## Security and resource bounds

- `returnTo` rejects absolute/protocol-relative URLs, foreign basenames,
  backslashes, encoded controls, dot segments, login loops, and oversized input.
- Application login mutations require exact Origin, same-origin Fetch Metadata,
  and double-submit CSRF.
- Provider and password implementation remains inside platform services.
- Login transactions have bounded TTL and retained history; security audits
  remain bounded. No long-lived application authentication rows exist.
- Browser application code never receives access or refresh credentials.

## Deletion and migration

The retired alpha design is removed rather than supported in parallel:

- delete `__Host-openxiangda-session`, `__Host-openxiangda-refresh`, and local
  variants;
- delete `/applications/:appCode/auth/refresh`;
- drop `app_refresh_families_v2` and `app_refresh_tokens_v2`;
- drop application login transaction `session_id` and audit
  `refresh_family_id`;
- delete platform-to-application session exchange and impersonation sync;
- reject old application cookies instead of translating them.

Existing browsers must sign in through the platform session after rollout. No
application session data is migrated because it is neither business data nor an
authorization source.

## Verification

The change is accepted only when tests prove:

- platform account switching is visible after refreshing every 2.0 app;
- two applications on the same host observe the same user;
- application logout signs the user out of the platform and every app;
- only platform access/refresh cookies represent an authenticated user;
- a protected 401 refreshes through `/api/auth/refresh` and retries once;
- the application refresh route and refresh tables are absent;
- old application session cookies are ignored;
- login transaction replay, CSRF, Origin, provider binding, and redirect
  negatives still fail closed.
