export const namedLaunchIntent = {
  operationCode: 'purchase.create-submit', method: 'POST' as const, path: '/api/purchases/submit',
  requiredCapability: 'app:openxiangda-application:purchase:submit',
  requestSchemaDigest: 'd'.repeat(64), responseSchemaDigest: 'e'.repeat(64),
  inputs: { idempotencyKey: { source: 'idempotency-key' }, title: { source: 'field', fieldCode: 'title' },
    customer: { source: 'field', fieldCode: 'customer' }, changeType: { source: 'field', fieldCode: 'changeType' } },
  output: { subjectId: 'id' },
};
export const namedLaunchContext = [{ queryParameter: 'changeType', fieldCode: 'changeType' }];
