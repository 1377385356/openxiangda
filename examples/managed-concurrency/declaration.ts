import type { OpenXiangdaAppDeclaration } from 'openxiangda/config';

export function concurrencyExample(): OpenXiangdaAppDeclaration {
  return {
    app: { code: 'limited-resource', name: '限量申领' },
    data: {
      resources: [
        { code: 'offers', name: '可申领资源', fields: [
          { code: 'title', label: '名称', type: 'text.short', required: true },
          { code: 'capacity', label: '总量', type: 'number.integer', required: true },
          { code: 'closesAt', label: '截止时间', type: 'datetime', required: true },
        ] },
        { code: 'claims', name: '申领记录', mutationOwner: 'queued-command', fields: [
          { code: 'offerId', label: '资源', type: 'uuid', required: true },
          { code: 'person', label: '申请人', type: 'text.short', required: true },
          { code: 'allocationId', label: '分配', type: 'uuid', required: true },
        ] },
      ],
      concurrency: {
        version: 1, admission: { perSecond: 10, burst: 10, maxInFlight: 20 },
        reads: [{ code: 'offer', resourceCode: 'offers', parameters: { id: { type: 'uuid' } },
          select: ['id', 'title', 'closesAt'], where: [{ field: 'id', value: { from: 'input', key: 'id' } }],
          limit: 1, scope: 'application', freshSeconds: 20, staleSeconds: 10, maxKeys: 100, sourcePerSecond: 2,
          dependencies: ['id', 'title', 'closesAt'] }],
        quotas: [{ code: 'places', sourceResource: 'offers', capacityField: 'capacity', allocationResource: 'claims', allocationField: 'allocationId' }],
        commands: [{ code: 'claim', capability: 'app:limited-resource:claim:submit', parameters: { id: { type: 'uuid' } },
          resourceKey: { from: 'input', key: 'id' }, deadlineSeconds: 120,
          admission: { perSecond: 5, burst: 5, maxInFlight: 10, maxQueue: 500, maxWaitSeconds: 300, permitSeconds: 30 },
          guards: [{ resourceCode: 'offers', id: { from: 'input', key: 'id' }, conditions: [{ kind: 'database-now', field: 'closesAt', operator: 'gt' }] }],
          operations: [{ operation: 'create', resourceCode: 'claims', data: { offerId: { from: 'input', key: 'id' }, person: { from: 'actor' }, allocationId: { from: 'allocation' } } }],
          quota: { pool: 'places', action: 'allocate', units: 1, mode: 'committed' },
        }],
      },
    },
    authz: {
      capabilities: [{ code: 'app:limited-resource:claim:submit', name: '申请', kind: 'backend' }],
      roles: [{ code: 'participant', name: '申请人', capabilities: ['app:limited-resource:claim:submit'],
        resources: { offers: ['read'], claims: ['read', 'create'] } }],
    },
  };
}
