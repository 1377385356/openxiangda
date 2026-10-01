import type { OpenXiangdaAppDeclaration } from 'openxiangda/config';

type Binding = NonNullable<OpenXiangdaAppDeclaration['workflows']>['bindings'][number]['binding']['bindings'][string];

/** Application roles and subject fact projection must declare these codes and paths. */
export const reviewers: Binding = {
  provider: 'app_role_in_scope', roleCode: 'reviewer', min: 1, max: 20,
  scope: { dimension: 'college', valueFrom: 'collegeCode' },
  routing: {
    policyCode: 'college-review', title: '学院审批人员规则', strategy: 'replace_then_append',
    dimensions: { college: { title: '学院', valueFrom: 'collegeCode' } },
    sources: {
      extra: { title: '补充审批职责', provider: 'app_role_in_scope', roleCode: 'extra-reviewer', scope: { dimension: 'college', valueFrom: 'collegeCode' } },
      replacement: { title: '专项替换职责', provider: 'app_role', roleCode: 'special-reviewer' },
    },
  },
};
