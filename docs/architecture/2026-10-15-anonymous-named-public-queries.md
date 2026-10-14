# Anonymous named public queries

Status: implementation plan under the user's portal performance and platform-fix authorization, 2026-10-15.

## Evidence and owner

School app Head39 exposes 473 instruments through public.list/public.read. Current public.list accepts pageSize/cursor only, max50, fixed createdAt/id descending. The application sequentially fetches every instrument and statistic before filtering/ranking in the browser. Homepage/list/detail reads must instead be bounded and scoped to what is shown. Owner: platform anonymous-public contract and execution, SDK dedicated anonymous client; application owns query declarations and page composition.

## Contract

Add optional policy publicQueries and explicit public.query operation. Each immutable query has a unique code and kind records|aggregate, fixed public-field projection, fixed sort, bounded default/max limit, optional named parameter bindings and fixed aggregate dimensions/measures. Parameter bindings expose only fixed declared publicRecordFields and allowed operator/type pairs: eq, in, contains, jsonContainsAny. They do not accept caller field names, where/select/order, resource names, SQL, aggregates or roles. JSON containment needles remain bounded JSON values against one explicitly public JSON field. Aggregate count/sum/min/max/dimensions use explicit public fields only. Existing publicFilters are mandatory in every query/count/aggregate/file read and cannot be overridden.

Dedicated public query endpoint and up-to10-operation public query batch stay bound to one public route, current tenant/app/environment/Head, anonymous HttpOnly browser and exact policy/query. Reuse the platform public-record projection, sanitized rich text and managed-file gateways. No anonymous ordinary Data API, Nest CRUD, guest identities or unbounded snapshot table. Unknown parameters, private fields, unsupported operators, invalid JSON or old/mismatched cursor fail closed. Records use a signed cursor bound to query + canonical parameters + policy + Head, max offset10000; no unsigned offset. Max100 returned rows/query, 64KiB batch input, 1MiB response, same public rate limits. Aggregates do not gain private-source access.

The dedicated SDK owns bootstrap, query/batch transport and response shape checks. Both compilers emit the same normalized query contracts; platform capability discovery declares the feature only when installed. Docs/Skill/CLI references and package Changesets ship with the contract. Old policies/list/read and V1 behavior remain unchanged.

## Application use

Home: one batch for public instrument group counts/categories, public statistics sums/top9 or6, latest3 notices/news and enabled banners; second bounded query retrieves only ranked instrument codes. Lists: server filters, bounded page and total; category/department choices via declared grouped queries; rank server top10. Detail: exact public instrument code and ALL statistic; article detail uses exact public record. Images/attachments retain original policy/record/field checks. Authenticated pages retain Native RLS and existing business actions.

## Failure and concurrency

Published immutable declaration + live publicFilters govern each request. Revoked/closed records disappear immediately at authoritative read, including files; errors never become zero totals or fallback full downloads. Signed cursors reject Head/query/parameter drift. Public queries are read-only. No business write, notification, timer or historical replay occurs. Anonymous credential and rate-limit ownership remain platform-only.

## Verification and rollback

Compiler parity tests reject private fields/filter inference, undefined queries, bad bounds and cross-resource bindings. Runtime/PostgreSQL/HTTP tests cover fixed-filter preservation, correct filtered totals, stable bounded ordering/cursors, aggregates, expired/foreign queries/cursors, output budgets and managed-file projection. Browser tests cover anonymous PC/mobile home/list/search/category/department/rank/detail/news with Network counts and render state; ordinary Data API remains rejected. Existing anonymous intake/own-record and V1 tests remain. Publish packages through the formal frozen release; update platform combination once; consume a TEST candidate locally before one unified application release. Rollback reverts optional query policies/SDK and platform capability; no business data migration or snapshot rewrite is needed.
