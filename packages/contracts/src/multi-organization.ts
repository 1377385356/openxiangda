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

/** Only the current actor's source class facts; IDs are not Native resource references. */
export interface DirectoryClassSummary {
  directoryClassId: string;
  sourceClassId: string;
  name: string;
  sourceCampusId: string;
  sourcePeriodId: string;
  sourceGradeId: string;
  campusName: string | null;
  periodName: string | null;
  gradeName: string | null;
  roleCodes: Array<'teacher' | 'head_teacher' | 'guardian' | 'student'>;
}
export interface DirectoryClassPage {
  schemaVersion: 'openxiangda.directory-class-page/v1';
  organizationId: string;
  userId: string;
  items: DirectoryClassSummary[];
  nextCursor: string | null;
}
const classUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function exactClassObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
/** Validate public projections once for Browser and Nest; never accepts raw identity material. */
export function parseDirectoryClassPage(value: unknown, expected: {
  userId?: string; organizationId?: string; limit?: number;
} = {}): DirectoryClassPage {
  const invalid = (): never => { throw new Error('OPENXIANGDA_DIRECTORY_CLASSES_RESPONSE_INVALID'); };
  const text = (item: unknown) => typeof item === 'string' && !!item && item === item.trim() && item.length <= 255;
  if (!exactClassObject(value, ['schemaVersion','organizationId','userId','items','nextCursor']) ||
    value.schemaVersion !== 'openxiangda.directory-class-page/v1' ||
    !text(value.userId) || !text(value.organizationId) || !classUuid.test(value.organizationId as string) ||
    (expected.userId !== undefined && value.userId !== expected.userId) ||
    (expected.organizationId !== undefined && value.organizationId !== expected.organizationId) ||
    !Array.isArray(value.items) || value.items.length > (expected.limit ?? 200)) invalid();
  const page = value as unknown as DirectoryClassPage;
  const ids = new Set<string>(), sources = new Set<string>();
  for (const item of page.items) {
    if (!exactClassObject(item, ['directoryClassId','sourceClassId','name','sourceCampusId','sourcePeriodId','sourceGradeId','campusName','periodName','gradeName','roleCodes']) ||
      !text(item.directoryClassId) || !classUuid.test(item.directoryClassId) || ids.has(item.directoryClassId.toLowerCase()) ||
      !text(item.sourceClassId) || sources.has(item.sourceClassId) ||
      !['name','sourceCampusId','sourcePeriodId','sourceGradeId'].every(key => text(item[key])) ||
      !['campusName','periodName','gradeName'].every(key => item[key] === null || text(item[key])) ||
      !Array.isArray(item.roleCodes) || !item.roleCodes.length || item.roleCodes.length > 4 ||
      new Set(item.roleCodes).size !== item.roleCodes.length ||
      item.roleCodes.some(role => !['teacher','head_teacher','guardian','student'].includes(role))) invalid();
    ids.add(item.directoryClassId.toLowerCase()); sources.add(item.sourceClassId);
  }
  if (page.nextCursor !== null && (!classUuid.test(page.nextCursor) || !page.items.length ||
    page.nextCursor !== page.items[page.items.length - 1]?.directoryClassId)) invalid();
  return page;
}
