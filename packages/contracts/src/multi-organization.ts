/** Platform-owned organization summaries; never contain installation credentials. */
export interface PlatformOrganizationSummary {
  id: string;
  tenantId: string;
  provider: string;
  corpId: string;
  name: string;
  providerName: string | null;
  parentId: string | null;
  level: number;
  ancestorIds: string[];
  status: string;
  activatedAt: string | null;
  installation: {
    id: string;
    suiteKey: string;
    status: string;
    providerName: string | null;
    agentId: string | null;
    scopes: string[];
    authorizationRevision: number;
    authorizedAt: string | null;
    lastSeenAt: string | null;
  } | null;
}

export interface PlatformOrganizationMembership {
  membershipId: string;
  organization: PlatformOrganizationSummary;
  source: string;
  profile: Record<string, unknown> | null;
}

/** Source facts, not application roles or Native record UUIDs. */
export interface DirectoryRoleFactPage {
  schemaVersion: 'openxiangda.directory-role-facts/v1';
  organizationId: string;
  userId: string;
  items: Array<{
    id: string;
    subjectId: string;
    source: string;
    roleCode: string;
    scopeType: string | null;
    scopeValue: string | null;
  }>;
  nextCursor: string | null;
}

export interface PlatformOrganizationSwitchReceipt {
  activeOrganizationId: string;
  organization: Pick<PlatformOrganizationSummary, 'id' | 'corpId' | 'name' | 'providerName' | 'parentId' | 'level' | 'ancestorIds'>;
  memberships: PlatformOrganizationMembership[];
}
