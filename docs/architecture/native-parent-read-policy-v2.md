# Private parent/subtable reads

`parentRead` adds one formally negotiated read-policy leaf. For example, a cost child can retain its requester relationship and permit a scoped manager only when that same membership can privately read the current parent and its `costs` subtable field:

```ts
resourceReadPolicy({
  code: 'cost-access', name: 'Cost access', resourceCode: 'order-costs',
  writeBoundary: 'capability_only',
  expression: dataPolicyExpression.anyOf(
    dataPolicyExpression.relation({ relationCode: 'order-reserver', resourceCode: 'orders', field: 'parent_id' }),
    dataPolicyExpression.parentRead({ resourceCode: 'orders', subtableFieldCode: 'costs', roleCodes: ['college-manager'] }),
  ),
});
```

The parent must declare `costs` as a true Native subtable targeting this exact child resource. The compiler derives its UUID FK from the sealed declaration. The application cannot pass a foreign key, table name, SQL or copied parent owner fields. First version accepts one unique parent relationship and one level; self references, shared ambiguous parents and chains/cycles are rejected.

The leaf applies only to reads. A base rule requires `operations: ['read']`; a readExpression uses the existing write boundary unchanged. A role still needs the child's read capability and requested field permissions. Parent capability, parent subtable-field permission, private row policy and Perspective must all succeed on that same effective membership. The outer user union may choose any complete branch; capabilities and scope from different branches cannot combine. Public parent fields alone never expose private child rows. Special principals and ordinary child CRUD do not gain permission through this declaration.

The shared compiler preserves CNF limits and derives `data.parent-read-policy` 1.0.0 as a required platform capability. Older targets reject activation instead of silently accepting an unknown leaf. Event capture records the original child FK as an authorization dependency. The complete configuration and Native revisions retain the parent policy and exact subtable mapping.

PLT-049 is an isolated candidate until real PostgreSQL/RLS, latest platform integration and app role/page acceptance gates pass.
## Isolated validation receipt (2026-10-09)

Candidate tools base is `c36e97a84306c10910842869cf3b386a45c5a3c3`; candidate platform base is `12088622577e79fb04c7d3699fc92a29244e57a2`. Contracts build and devkit TypeScript validation passed, with 45 contracts and 91 current selected devkit tests passing. Platform synthetic tests passed 36 cases; actual PostgreSQL 15.14 passed 27 cases against all 29 functions extracted from the verified current school schema-only snapshot, followed by the candidate migration. Cases include same-member authorization, denied split-membership/CRUD, guarded migration replay and 49/1000-row synthetic performance samples. These results do not constitute school deployment or acceptance of migrated data and pages. Both candidates are isolated; package versions and lockfiles remain unchanged pending authoritative release integration.
