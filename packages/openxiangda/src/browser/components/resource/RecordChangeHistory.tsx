import { PresentationTime } from '../../presentation-time';
import { ArrowRightOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { DataAuditEntry, DataResourceSurface } from 'openxiangda-contracts/browser';
import { auditActorLabel, auditFieldChange, auditFieldCodes, SurfaceAuditFieldValue, type SurfaceField } from './SurfaceFields';
import { fieldsBySection } from './resource-page-helpers';
import { createNativeResourceClient } from '../../platform-client';

function auditOperationLabel(operation: DataAuditEntry['operation']) {
  return operation === 'created' ? '创建' : operation === 'deleted' ? '删除' : '更新';
}

function auditValue(field: SurfaceField, value: unknown, resourceCode: string) {
  if (value === undefined || value === null || value === '') {
    return <Typography.Text type="secondary">-</Typography.Text>;
  }
  return (
    <SurfaceAuditFieldValue
      field={field}
      resourceCode={resourceCode}
      value={value}
    />
  );
}

function auditChangeFields(entry: DataAuditEntry, surface: DataResourceSurface) {
  const fields = fieldsBySection(surface).flatMap((group) => group.fields);
  const changed = new Set(auditFieldCodes(entry));
  return fields.filter((field) => changed.has(field.key));
}

function AuditEntry({
  entry,
  resourceCode,
  surface,
  readable,
}: {
  entry: DataAuditEntry;
  resourceCode: string;
  surface: DataResourceSurface;
  readable: (field: SurfaceField) => boolean;
}) {
  const fields = auditChangeFields(entry, surface).filter(readable);
  const actorName =
    entry.actorDisplay?.displayName || auditActorLabel(entry);
  const occurredAt = <PresentationTime value={entry.occurredAt} />;
  if (entry.operation === 'created') {
    return (
      <div className="oxa-audit-entry oxa-audit-entry-created">
        <Typography.Text>
          <strong>{actorName}</strong> 于 {occurredAt} 创建记录
        </Typography.Text>
      </div>
    );
  }
  return (
    <div className="oxa-audit-entry">
      <div className="oxa-audit-heading">
        <strong>{auditOperationLabel(entry.operation)}</strong>
        <Typography.Text type="secondary">版本 {entry.revision}</Typography.Text>
      </div>
      <div className="oxa-audit-meta">
        <span>操作人</span>
        <Typography.Text>{actorName}</Typography.Text>
        <span>时间</span>
        <Typography.Text>{occurredAt}</Typography.Text>
      </div>
      {fields.length ? (
        <div className="oxa-audit-changes">
          {fields.map((field) => {
            const change = auditFieldChange(entry, field.key);
            const before = change?.before;
            const after = change?.after;
            return (
              <div className="oxa-audit-change" key={field.key}>
                <Typography.Text strong>{field.label}</Typography.Text>
                <div className="oxa-audit-change-values">
                  {auditValue(field, before, resourceCode)}
                  <ArrowRightOutlined />
                  {auditValue(field, after, resourceCode)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Typography.Text type="secondary">未发生字段变化</Typography.Text>
      )}
    </div>
  );
}


export function RecordChangeHistory({ resourceCode, recordId, surface, readable, loadPage }: {
  resourceCode: string; recordId: string; surface: DataResourceSurface;
  readable: (field: SurfaceField) => boolean;
  loadPage?: () => Promise<{ items: DataAuditEntry[] }>;
}) {
  const [entries, setEntries] = useState<DataAuditEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setEntries([]);
    void (loadPage ? loadPage() : createNativeResourceClient(resourceCode, surface).audit(recordId))
      .then(page => { if (active) setEntries(page.items); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, loadPage, recordId, resourceCode, surface]);
  if (loading) return <Spin />;
  if (error) return <Alert type="error" title="变更记录读取失败" description={error} action={<Button onClick={() => setAttempt(value => value + 1)}>重试</Button>} />;
  return <div className="oxa-record-detail-card">{entries.length ? entries.map(entry => <AuditEntry key={entry.id} entry={entry} resourceCode={resourceCode} surface={surface} readable={readable} />) : <Empty description="暂无变更记录" />}</div>;
}
