import { usePresentationTimeZone } from '../../presentation-time';
import { ArrowLeftOutlined, CloseOutlined, CompressOutlined, ExpandOutlined, ExportOutlined } from '@ant-design/icons';
import { Button, Drawer, Space, Tooltip } from 'antd';
import { useState, type ReactNode } from 'react';
import type { ResourceFormDrawerState } from './ResourceFormFrame';
import type { SurfaceField } from './SurfaceFields';

export function detailTime(value: unknown, timeZone?: string) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.valueOf())) return '';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(date);
}

/** One presentation owner. Data, authorization and commands remain with their controllers. */
export function RecordDetailFrame({ variant = 'desktop', title, heading, status, metadata, updatedAt,
  children, footer, onClose, onEdit, drawer = false, drawerState, newPageHref, editing, busy = false,
}: {
  editing?: ReactNode; busy?: boolean;
  variant?: 'desktop' | 'mobile'; title: string; heading?: ReactNode; status?: ReactNode;
  metadata?: ReactNode; updatedAt?: unknown; children: ReactNode; footer?: ReactNode;
  onClose: () => void; onEdit?: () => void; drawer?: boolean;
  drawerState?: ResourceFormDrawerState; newPageHref?: string;
}) {
  const [localFullScreen, setLocalFullScreen] = useState(false);
  const fullScreen = drawerState?.fullScreen ?? localFullScreen;
  const setFullScreen = drawerState?.setFullScreen || setLocalFullScreen;
  const zone = usePresentationTimeZone();
  const time = detailTime(updatedAt, zone);
  const content = <section className={`oxa-record-detail oxa-record-detail-${variant} ${drawer ? 'is-drawer' : 'is-page'} ${editing ? 'is-editing' : ''}`} data-detail-frame="standard">
    <header className="oxa-record-detail-header"><div className="oxa-record-detail-width">
      <div className="oxa-record-detail-heading">
        {!drawer && <Button type="text" aria-label="返回" icon={<ArrowLeftOutlined />} disabled={busy} onClick={onClose} />}
        <h2>{editing ? '编辑数据' : title}</h2>
      </div>
      <Space size={4}>
        {onEdit && !editing && <Button type="link" onClick={onEdit}>编辑</Button>}
        {drawer && <Tooltip title={fullScreen ? '退出全屏' : '全屏'}><Button type="text" aria-label={fullScreen ? '退出全屏' : '全屏'} icon={fullScreen ? <CompressOutlined /> : <ExpandOutlined />} onClick={() => setFullScreen(!fullScreen)} /></Tooltip>}
        {drawer && newPageHref && !editing && <Tooltip title="新开页面"><Button type="text" aria-label="新开页面" icon={<ExportOutlined />} href={newPageHref} target="_blank" rel="noopener noreferrer" /></Tooltip>}
        <Tooltip title="关闭"><Button type="text" aria-label="关闭" icon={<CloseOutlined />} disabled={busy} onClick={onClose} /></Tooltip>
      </Space>
    </div></header>
    <main className="oxa-record-detail-body"><div className="oxa-record-detail-width">
      {heading && !editing && <div className="oxa-record-detail-hero"><div><h1>{heading}</h1>{status}</div>{metadata && <div className="oxa-record-detail-metadata">{metadata}</div>}</div>}
      {editing || children}
    </div></main>
    {!editing && footer !== null && <footer className="oxa-record-detail-footer"><div className="oxa-record-detail-width">
      <span className="oxa-record-detail-updated">{time ? `更新于 ${time}` : ''}</span>
      <div className="oxa-record-detail-actions">{footer || <Space><Button disabled={busy} onClick={onClose}>关闭</Button>{onEdit && <Button type="primary" onClick={onEdit}>编辑</Button>}</Space>}</div>
    </div></footer>}
  </section>;
  return drawer ? <Drawer open aria-label={editing ? '编辑数据' : title} rootClassName="oxa-resource-drawer oxa-record-detail-drawer"
    size={fullScreen ? '100vw' : 'min(850px, calc(100vw - 48px))'}
    styles={{ body: { padding: 0, overflow: 'hidden' } }} closable={false} keyboard={!busy} mask={{ closable: !busy }} onClose={onClose}>{content}</Drawer> : content;
}

export function RecordDetailSections({ groups, renderValue }: {
  groups: Array<{ section: string; fields: SurfaceField[] }>;
  renderValue: (field: SurfaceField) => ReactNode;
}) {
  return <div className="oxa-record-detail-sections">{groups.filter(group => group.fields.length).map(group => <section className="oxa-record-detail-card" key={group.section}>
    <h2>{group.section === 'default' ? '基本信息' : group.section}</h2>
    <div className="oxa-record-detail-fields">{group.fields.map(field => <div
      className={['textarea', 'attachment', 'image', 'rich-text', 'address', 'location', 'signature', 'json', 'subtable'].includes(field.widget) ? 'is-wide' : undefined} key={field.key}>
      <div className="oxa-record-detail-label">{field.label}</div>
      <div className="oxa-record-detail-value">{renderValue(field)}</div>
    </div>)}</div>
  </section>)}</div>;
}
