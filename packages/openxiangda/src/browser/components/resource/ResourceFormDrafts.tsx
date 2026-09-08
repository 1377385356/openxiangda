import { PresentationTime } from '../../presentation-time';
import { CloseOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Modal, Table } from 'antd';
import type { ReactNode } from 'react';
import { Button as MobileButton, Popup } from '../../mobile';
import type { ResourceFormDraft } from '../../platform-client';
import { SurfaceFieldValue, type SurfaceField } from './SurfaceFields';

export function FormOverlay({ mobile, open, title, children, onClose }: {
  mobile: boolean; open: boolean; title: string; children: ReactNode; onClose(): void;
}) {
  return mobile ? <Popup visible={open} position="bottom" onMaskClick={onClose} bodyClassName="oxa-form-overlay">
    <section role="dialog" aria-modal="true" aria-label={title}>
      <header className="oxa-mobile-sheet-header"><strong>{title}</strong><MobileButton fill="none" aria-label="关闭弹层" onClick={onClose}><CloseOutlined /></MobileButton></header>{children}
    </section>
  </Popup> : <Modal title={title} open={open} onCancel={onClose} footer={null} width={800} destroyOnHidden>{children}</Modal>;
}
export function FormConfirmation({ mobile, title, content, confirmText, onConfirm, onClose }: {
  mobile: boolean; title: string; content: string; confirmText: string; onConfirm(): void; onClose(): void;
}) {
  return <FormOverlay open mobile={mobile} title={title} onClose={onClose}>
    <p className="oxa-form-confirm-content">{content}</p><div className="oxa-settings-actions oxa-form-confirm-actions">
      {mobile ? <><MobileButton onClick={onClose}>继续填写</MobileButton><MobileButton color="primary" onClick={onConfirm}>{confirmText}</MobileButton></>
        : <><Button onClick={onClose}>继续填写</Button><Button type="primary" onClick={onConfirm}>{confirmText}</Button></>}
    </div>
  </FormOverlay>;
}
export function ResourceFormDrafts({ mobile, open, items, limit, retentionDays, fields, resourceCode, busy, onClose, onResume, onDelete }: {
  mobile: boolean; open: boolean; items: ResourceFormDraft[]; limit: number; retentionDays: number;
  fields: SurfaceField[]; resourceCode: string; busy: boolean;
  onClose(): void; onResume(draft: ResourceFormDraft): void; onDelete(draft: ResourceFormDraft): void;
}) {
  const summary = fields.filter(field => !['subtable', 'file', 'image', 'signature', 'text.rich', 'json'].includes(field.type)).slice(0, 3);
  const stamp = (value: string) => <PresentationTime value={value} />;
  return <FormOverlay mobile={mobile} open={open} title={`草稿箱 (${items.length}/${limit})`} onClose={onClose}>
    <div className="oxa-draft-box"><Alert type="info" showIcon title={`${retentionDays} 天未更新的草稿将自动删除`} />
      {mobile ? <div className="oxa-draft-cards">{items.length ? items.map(draft => <article className="oxa-draft-card" key={draft.id}>
        <p><span>暂存时间：</span>{stamp(draft.updatedAt)}</p>
        {summary.map(field => <p key={field.key}><span>{field.label}：</span><SurfaceFieldValue field={field} resourceCode={resourceCode} value={draft.values[field.key]} /></p>)}
        <div className="oxa-draft-card-actions"><MobileButton color="primary" disabled={busy} onClick={() => onResume(draft)}>继续编辑</MobileButton>
          <MobileButton disabled={busy} onClick={() => onDelete(draft)}>删除</MobileButton></div>
      </article>) : <Empty description="暂无草稿" />}</div>
        : <Table<ResourceFormDraft> rowKey="id" size="middle" dataSource={items} scroll={{ x: 600 }} pagination={{ pageSize: 5, showSizeChanger: false }}
          columns={[{ key: 'updatedAt', title: '暂存时间', width: 170, render: (_, draft) => stamp(draft.updatedAt) },
            ...summary.map(field => ({ key: field.key, title: field.label, render: (_: unknown, draft: ResourceFormDraft) => <SurfaceFieldValue field={field} resourceCode={resourceCode} value={draft.values[field.key]} /> })),
            { key: 'actions', title: '操作', width: 150, render: (_, draft) => <><Button type="link" disabled={busy} onClick={() => onResume(draft)}>继续编辑</Button><Button aria-label="删除" type="link" danger disabled={busy} onClick={() => onDelete(draft)}>删除</Button></> }]} />}
    </div>
  </FormOverlay>;
}
