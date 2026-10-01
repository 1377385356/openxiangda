import { RoleMembershipManager } from 'openxiangda/react';

/** Mount inside the existing authorized admin page and platform UI provider. */
export function ResponsibilityMembers() {
  return <RoleMembershipManager initialRoleCode="reviewer" />;
}
