import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DataAuditEntry } from 'openxiangda-contracts/browser';
import {
  auditActorLabel,
  auditFieldChange,
  auditFieldCodes,
  isEventValueDigest,
  SurfaceAuditFieldValue,
} from '../src/browser/components/resource/SurfaceFields';

const entry: DataAuditEntry = {
  id: 'event-1',
  operation: 'updated',
  recordId: 'record-1',
  revision: 2,
  actor: { principalType: 'user', subjectId: 'user-1' },
  correlation: {
    eventId: 'event-1',
    requestId: null,
    traceId: null,
    environmentKey: 'preproduction',
    appVersionId: 'version-1',
    environmentHeadRevision: 2,
    capturePlanRevision: 1,
    cause: { eventId: null, subscriptionCode: null, depth: 0 },
  },
  changes: {
    name: { before: '旧名称', after: '新名称' },
    enabled: { before: false, after: true },
    address: {
      after: {
        province: { label: '浙江省', value: '330000' },
        fullAddress: '浙江省杭州市',
      },
    },
    resources: {
      after: [{ label: '资源 A', value: 'resource-a', resourceCode: 'resources' }],
    },
  },
  projection: {},
  occurredAt: '2026-08-25T00:00:00.000Z',
};

test('reads only the current per-field before/after audit envelope', () => {
  assert.deepEqual(auditFieldCodes(entry), [
    'name',
    'enabled',
    'address',
    'resources',
  ]);
  assert.deepEqual(auditFieldChange(entry, 'name'), {
    before: '旧名称',
    after: '新名称',
  });
  assert.equal(auditFieldChange(entry, 'missing'), undefined);
  assert.equal(auditActorLabel(entry), '平台用户');
});

test('原生和外部操作人都有明确标签，未知类型不泄露内部身份', () => {
  for (const [principalType, expected] of [
    ['user_union', '平台用户'], ['anonymous_public', '外部访客'],
    ['unknown', '操作人暂不可解析'], ['constructor', '操作人暂不可解析'],
  ]) {
    const value = { ...entry, actor: { principalType, subjectId: 'private-user-id' } } as DataAuditEntry;
    assert.equal(auditActorLabel(value), expected);
  }
});

test('recognizes bounded event digests without treating arbitrary objects as digests', () => {
  assert.equal(isEventValueDigest({
    kind: 'digest',
    truncated: true,
    valueType: 'text.rich',
    bytes: 65_537,
    sha256: 'a'.repeat(64),
  }), true);
  assert.equal(isEventValueDigest({ kind: 'digest', sha256: 'short' }), false);
  assert.equal(isEventValueDigest({ before: 'a', after: 'b' }), false);
});

test('historical file and image changes expose metadata without live file controls or resource reads', () => {
  const file = { id: 'old-private-file', name: '历史附件.png', size: 1024, mimeType: 'image/png' };
  for (const [type, value, text] of [
    ['file', [file], '历史附件.png'],
    ['image', [file], '历史附件.png'],
    ['signature', { file }, '历史附件.png'],
    ['text.rich', '<p>历史说明</p><img data-file-id="old-private-file" src="https://example.test/private.png" />', '历史说明'],
  ] as const) {
    const markup = renderToStaticMarkup(createElement(SurfaceAuditFieldValue, {
      field: { key: 'attachment', label: '附件', type, widget: 'upload', readCapabilities: [], createCapabilities: [], updateCapabilities: [] },
      resourceCode: 'participant-only-record',
      value,
    }));
    assert.ok(markup.includes(text));
    assert.doesNotMatch(markup, /<button|<a\b|<img|old-private-file|预览|下载/);
  }
});
