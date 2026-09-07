import { CloseOutlined, CompressOutlined, ExpandOutlined, ExportOutlined } from '@ant-design/icons';
import { Alert, Button, Drawer, Form, Space, Tooltip, type FormInstance } from 'antd';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button as MobileButton } from '../../mobile';
import { MobileSurfaceFieldControl, SurfaceFieldControl, type SurfaceField, type SurfaceFieldRenderers } from './SurfaceFields';

/** Shared presentation only; each platform owner supplies its existing load/save lifecycle. */
export function ResourceFormContent({
  variant, mode, resourceCode, recordId, groups, form, initialValues, busy,
  pending, submitDisabled, submitLabel = mode === 'edit' ? '保存' : '提交', error, feedback, actions, canWriteField, renderers, onValuesChange, onSubmit,
}: {
  variant: 'desktop' | 'mobile';
  mode: 'create' | 'edit';
  resourceCode: string;
  recordId?: string;
  groups: Array<{ section: string; fields: SurfaceField[] }>;
  form?: FormInstance;
  initialValues?: Record<string, unknown>;
  busy: boolean;
  pending: boolean;
  submitDisabled?: boolean;
  submitLabel?: string;
  error?: string;
  feedback?: ReactNode;
  actions?: ReactNode;
  canWriteField: (field: SurfaceField) => boolean;
  renderers?: SurfaceFieldRenderers;
  onValuesChange?: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const grouped = groups.length > 1 || groups.some(group => group.section !== 'default');
  const FieldControl = variant === 'mobile' ? MobileSurfaceFieldControl : SurfaceFieldControl;
  return <Form
    className={variant === 'mobile' ? 'oxa-mobile-form' : 'oxa-form-full'}
    disabled={busy} form={form} initialValues={initialValues} layout="vertical"
    onValuesChange={onValuesChange} onFinish={onSubmit} scrollToFirstError={{ focus: true }}
  >
    <div className="oxa-form-scroll">
      {feedback}
      {error && <div ref={errorRef} tabIndex={-1} className="oxa-form-error"><Alert
        title="保存失败" description={error} type="error" showIcon
      /></div>}
      <div className="oxa-form-sections">{groups.map((group, index) => <section
        className="oxa-form-section" key={group.section} aria-labelledby={grouped ? `resource-form-section-${index}` : undefined}
      >
        {grouped && <h2 id={`resource-form-section-${index}`}>{group.section === 'default' ? '基本信息' : group.section}</h2>}
        <div className="oxa-grid">{group.fields.map(field => <FieldControl
          key={field.key} field={field} disabled={busy || !canWriteField(field)}
          operation={mode === 'create' ? 'create' : 'update'} resourceCode={resourceCode} recordId={recordId} renderers={renderers}
        />)}</div>
      </section>)}</div>
    </div>
    <div className="oxa-actions">
      {actions}
      {variant === 'mobile'
        ? <MobileButton type="submit" loading={pending} disabled={submitDisabled} color="primary">{submitLabel}</MobileButton>
        : <Button aria-label={submitLabel} htmlType="submit" disabled={submitDisabled} loading={pending} type="primary">{submitLabel}</Button>}
    </div>
  </Form>;
}

export interface ResourceFormDrawerState { fullScreen: boolean; setFullScreen(value: boolean): void }

export function ResourceFormDrawer({ mode, open, busy, children, onClose, onClosed, newPage, drawerState }: {
  mode: 'create' | 'edit'; open: boolean; busy: boolean; children: ReactNode;
  onClose: () => void; onClosed: () => void;
  newPage?: { onClick?: () => void; href?: string; title?: string };
  drawerState?: ResourceFormDrawerState;
}) {
  const [localFullScreen, setLocalFullScreen] = useState(false);
  const fullScreen = drawerState?.fullScreen ?? localFullScreen;
  const setFullScreen = drawerState?.setFullScreen || setLocalFullScreen;
  const closed = useRef(false);
  useEffect(() => { if (open) closed.current = false; }, [open]);
  return <Drawer
    rootClassName="oxa-resource-drawer" title={mode === 'create' ? '新增数据' : '编辑数据'}
    open={open} afterOpenChange={visible => {
      if (!visible && !closed.current) { closed.current = true; onClosed(); }
    }}
    size={fullScreen ? '100vw' : 'min(850px, calc(100vw - 48px))'}
    styles={{ body: { padding: 0 } }} closable={false} keyboard={!busy} mask={{ closable: !busy }} onClose={onClose}
    extra={<Space size={4}>
      <Tooltip title={fullScreen ? '退出全屏' : '全屏'}><Button aria-label={fullScreen ? '退出全屏' : '全屏'} type="text" icon={fullScreen ? <CompressOutlined /> : <ExpandOutlined />} onClick={() => setFullScreen(!fullScreen)} /></Tooltip>
      {newPage && <Tooltip title={newPage.title || '新开页面'}><Button aria-label="新开页面" type="text" disabled={busy} icon={<ExportOutlined />}
        {...(newPage.href ? { href: newPage.href, target: '_blank', rel: 'noopener noreferrer' } : {})} onClick={newPage.onClick} /></Tooltip>}
      <Tooltip title="关闭"><Button aria-label="关闭" type="text" disabled={busy} icon={<CloseOutlined />} onClick={onClose} /></Tooltip>
    </Space>}
  >{children}</Drawer>;
}
