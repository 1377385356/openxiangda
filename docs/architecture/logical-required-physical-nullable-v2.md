# Logical required, physical nullable

> 公开版本已匿名化客户、环境和实例标识。历史验收叙述仅作设计背景，不代表当前线上状态。

## Problem evidence

An additive union reference app release declared new required fields on resources containing
older rows. The platform converted that application validation rule into
PostgreSQL `NOT NULL` and rejected the release before the application could run
its normal create/update validation.

## Owner and invariants

The authored resource declaration owns business requiredness. The compiler
projects `required: true` to logical `nullable: false`, the generated forms show
the required state, and every Native Data API mutation validates it. The
platform storage planner owns only physical type and structural integrity; all
application business columns are physically nullable.

Changing requiredness never requires a storage migration or historical
backfill. Adding a field never fabricates values for old rows. System row
identity, tenant/application/environment isolation, audit columns, RLS,
physical types, JSON/range shape, serial generation, indexes and subtable
referential integrity remain platform-owned database contracts.

## Failure, rollback and verification

Invalid current writes still fail at the Data API boundary with field-specific
errors. Historical rows may contain null when they predate a field or its
required rule; applications must display that state safely and collect a value
when business logic next requires one.

The platform change is a forward-only constraint relaxation and does not touch
OpenXiangda 1.x. Verification must prove required create/null rejection in the
Data API, nullable physical DDL for every authored field family, additive
required-field publication over existing rows, and preservation of platform
system constraints.
