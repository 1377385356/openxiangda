import { InboxOutlined } from '@ant-design/icons';
import { useCreate, useOne, useUpdate } from '@refinedev/core';
import { App, Alert, Button, Form, Result, Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useHref, useNavigate, useParams } from 'react-router-dom';
import { Button as MobileButton } from '../../mobile';
import { useRuntime } from '../../runtime';
import { useResourceDefinitions } from '../../resource-definitions';
import { createNativeResourceClient, transactNativeData } from '../../platform-client';
import { normalizeFormValues, normalizeRecordForForm } from '../platform-fields/field-form-codec';
import { SubtableField } from '../platform-fields/SubtableField';
import type { SubtableDraftRow } from '../platform-fields/subtable-value';
import { useResourceFormDrafts } from './useResourceFormDrafts';
import { MobileResourceFormPage, ResourceFormPage } from './StandardResourcePages';
import { ResourceFormContent, ResourceFormDrawer, type ResourceFormDrawerState } from './ResourceFormFrame';
import { buildResourceFormOperations } from './resource-form-operations';
import type { GeneratedResourceDefinition } from './generated-resource-definition';
import { fieldFor, fieldReadable, fieldWritable, fieldWriteAuthorized, fieldsBySection, resourceRecordPath, signatureSigner, type ResourceRecord, type GeneratedResourceRoutePaths } from './resource-page-helpers';

export function GeneratedResourceFormPage({
  definition,
  mode,
  paths,
  variant,
  recordId,
  onDismiss,
  onSaved,
  drawerState,
  embedded = false,
  onBusyChange,
}: {
  embedded?: boolean; onBusyChange?: (busy: boolean) => void;
  definition: GeneratedResourceDefinition;
  mode: 'create' | 'edit';
  paths: GeneratedResourceRoutePaths;
  variant: 'desktop' | 'mobile';
  recordId?: string;
  onDismiss?: () => void;
  onSaved?: (id: string) => void;
  drawerState?: ResourceFormDrawerState;
}) {
  const params = useParams();
  const id = recordId ?? params.id ?? '';
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasCapability, hasReadCapability, identity } = useRuntime();
  const definitions = useResourceDefinitions();
  const [form] = Form.useForm();
  const create = useCreate<ResourceRecord>();
  const update = useUpdate<ResourceRecord>();
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [submitError, setSubmitError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const savedIdRef = useRef<string | null>(null);
  const [record, setRecord] = useState<ResourceRecord>();
  const query = useOne<ResourceRecord>({
    resource: definition.code,
    id,
    queryOptions: { enabled: mode === 'edit', retry: false },
  });
  const { code, name, surface, capabilities } = definition;
  useEffect(() => {
    if (mode === 'edit' && !record && query.result) {
      setRecord(query.result);
      form.setFieldsValue(normalizeRecordForForm(query.result, surface));
    }
  }, [form, mode, query.result, record, surface]);
  const listPath = paths.list || paths.fallback;
  const detailPath = paths.detail
    ? resourceRecordPath(paths.detail, id)
    : paths.fallback;
  const Page = variant === 'mobile' ? MobileResourceFormPage : ResourceFormPage;
  const newPageHref = useHref(mode === 'create' ? paths.create! : resourceRecordPath(paths.edit, id));
  const complete = (savedId: string) => {
    message.success(mode === 'create' ? `${name}已创建` : '修改已保存');
    if (embedded) onSaved?.(savedId);
    else if (onDismiss) { savedIdRef.current = savedId; setDrawerOpen(false); }
    else if (onSaved) onSaved(savedId);
    else navigate(!surface.generated?.detail
      ? listPath : resourceRecordPath(paths.detail, savedId));
  };
  const requestLeave = (action: () => void) => {
    if (submitting.current || drafts.busy) return;
    action();
  };
  const cancel = () => requestLeave(() => {
    if (embedded) onDismiss?.();
    else if (onDismiss) setDrawerOpen(false);
    else navigate(mode === 'edit' ? detailPath : listPath);
  });
  const presentedFields = fieldsBySection(surface).flatMap(group => group.fields);
  const groups = fieldsBySection(surface).map(group => ({ ...group, fields: group.fields.filter(field =>
    fieldReadable(field, hasReadCapability, identity.isAppSuperAdmin) || fieldWritable(field, mode, hasCapability, identity.isAppSuperAdmin)) })).filter(group => group.fields.length > 0);
  const writable = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).filter(([key]) =>
    presentedFields.some(field => field.key === key) && fieldWritable(fieldFor(surface, key), mode, hasCapability, identity.isAppSuperAdmin)));
  const draftValues = (values: Record<string, unknown>, decode = false) => {
    const next = decode ? normalizeRecordForForm(values, surface) : normalizeFormValues(writable(values), surface);
    for (const field of presentedFields.filter(field => field.type === 'subtable')) {
      const child = field.subtable ? definitions[field.subtable.resourceCode] : undefined;
      if (!child || !Array.isArray(values[field.key])) continue;
      const convert = decode ? normalizeRecordForForm : normalizeFormValues;
      const childFields = fieldsBySection(child.surface).flatMap(group => group.fields);
      const childValues = (data: Record<string, unknown>, operation: 'create' | 'edit') => decode ? data : Object.fromEntries(Object.entries(data).filter(([key]) => {
        const childField = childFields.find(candidate => candidate.key === key);
        return childField && fieldWritable(childField, operation, hasCapability, identity.isAppSuperAdmin);
      }));
      next[field.key] = (values[field.key] as SubtableDraftRow[]).map(row => ({ ...row, snapshot: undefined,
        data: convert(childValues(row.data, row.state === 'created' ? 'create' : 'edit'), child.surface),
        originalData: convert(childValues(row.originalData || {}, row.state === 'created' ? 'create' : 'edit'), child.surface) }));
    }
    return next;
  };
  const drafts = useResourceFormDrafts({ code, viewCode: definition.viewCode, mode, recordId: mode === 'edit' ? id : undefined, mobile: variant === 'mobile',
    ready: mode === 'create' || Boolean(record), form, fields: groups.flatMap(group => group.fields), recordRevision: record?.revision,
    encode: values => draftValues(values), onSaved: () => {},
    restore: draft => {
      form.resetFields(); form.setFieldsValue({ ...(record ? normalizeRecordForForm(record, surface) : {}), ...draftValues(draft.values, true) });
      if (mode === 'edit' && draft.recordRevision) setRecord(current => current ? { ...current, revision: draft.recordRevision! } : current);
    },
  });
  const busy = pending || drafts.busy;
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const newPage = async () => {
    if (busy) return;
    const target = window.open('about:blank', '_blank');
    if (!target) { message.error('新页面被浏览器拦截，请允许弹出窗口后重试'); return; }
    target.opener = null;
    const draft = await drafts.save();
    if (!draft) { target.close(); return; }
    const url = new URL(newPageHref, window.location.href);
    url.searchParams.set('draft', draft.id); target.location.href = url.href;
    setDrawerOpen(false);
  };
  if (!hasCapability(mode === 'create' ? capabilities.create : capabilities.update))
    return <Result status="403" title="当前平台用户无此操作权限" />;
  const persist = async (values: Record<string, unknown>) => {
    const writableValues = writable(values);
    const subtableFields = presentedFields.filter(
        field =>
          field.type === 'subtable' &&
          fieldWritable(
            field,
            mode,
            hasCapability,
            identity.isAppSuperAdmin
          )
      );
    const next = normalizeFormValues(
      Object.fromEntries(
        Object.entries(writableValues).filter(
          ([key]) => surface.fields[key]?.type !== 'subtable'
        )
      ),
      surface
    );
    if (subtableFields.length > 0) {
      const operations = buildResourceFormOperations({
        mode, resourceCode: code, record, data: next, values: writableValues, subtableFields, definitions,
        canWrite: (fieldCode, childField, childOperation) => fieldWriteAuthorized({ key: fieldCode, ...childField }, childOperation === 'create' ? 'create' : 'edit', hasCapability, identity.isAppSuperAdmin),
        canDelete: child => identity.isAppSuperAdmin || hasCapability(child.capabilities.delete),
      });
      {
        const result = drafts.current ? await drafts.client.submit(drafts.current, operations) : await transactNativeData(operations);
        const parent = result.items[0];
        if (!parent || parent.operation === 'emitEvent') {
          throw new Error('OPENXIANGDA_SUBTABLE_PARENT_RESULT_MISSING');
        }
        complete(parent.id);
      }
      return;
    }
    if (drafts.current) {
      const result = await drafts.client.submit(drafts.current, [mode === 'create'
        ? { operation: 'create', resourceCode: code, data: next }
        : { operation: 'update', resourceCode: code, id, expectedRevision: record!.revision, data: next }]);
      const parent = result.items[0];
      if (!parent || parent.operation === 'emitEvent') throw new Error('提交结果缺少记录');
      complete(parent.id);
    } else if (mode === 'create') {
      const result = await create.mutateAsync({ resource: code, values: next });
      complete(String(result.data.id));
    } else {
      const result = await update.mutateAsync({
        resource: code,
        id,
        values: next,
        meta: { expectedRevision: record?.revision },
      });
      complete(String(result.data.id));
    }
  };
  const submit = async (values: Record<string, unknown>) => {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setSubmitError('');
    try {
      await persist(values);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '保存失败，请稍后重试');
      submitting.current = false;
      setPending(false);
    }
  };
  const formContent = (
    <ResourceFormContent
      variant={variant} mode={mode} resourceCode={code} recordId={record?.id} groups={groups}
      form={form} busy={busy} pending={pending} submitDisabled={drafts.busy} error={submitError} feedback={drafts.feedback}
      onValuesChange={() => drafts.clearSaved()}
      onSubmit={values => void submit(values)}
      canWriteField={field => fieldWritable(field, mode, hasCapability, identity.isAppSuperAdmin)}
      renderers={{
        renderSubtable: context => <SubtableField disabled={context.disabled} field={context.field} mobile={variant === 'mobile'} operation={context.operation} parentRecordId={context.recordId} />,
        signer: signatureSigner(identity.subjectProfile),
        upload: (current, file, parentId) => createNativeResourceClient(code, surface).upload(current.key, file, parentId),
      }}
      actions={variant === 'mobile' ? <>
          {embedded && <MobileButton disabled={busy} onClick={cancel}>取消</MobileButton>}
          {drafts.count > 0 && <MobileButton className="oxa-mobile-draft-button" fill="none" aria-label={`草稿箱（${drafts.count}）`} disabled={busy} onClick={drafts.showBox}>
            <span className="oxa-mobile-draft-icon"><InboxOutlined /><sup>{drafts.count}</sup></span><small>草稿箱</small>
          </MobileButton>}
          <MobileButton disabled={busy} loading={drafts.busy} onClick={() => void drafts.save()}>暂存</MobileButton>
        </> : <>
          {embedded && <Button disabled={busy} onClick={cancel}>取消</Button>}
          <Button aria-label="草稿箱" type="text" icon={<InboxOutlined />} disabled={busy} onClick={drafts.showBox}>草稿箱</Button>
          <Button aria-label="暂存" disabled={pending} loading={drafts.busy} onClick={() => void drafts.save()}>暂存</Button>
        </>}
    />
  );
  const overlays = drafts.overlays;
  const content = mode === 'edit' && !record ? (
    query.query.isFetching ? <div className="oxa-page-loading"><Spin /></div>
      : query.query.isError ? <Alert
        title="数据读取失败"
        description={query.query.error instanceof Error ? query.query.error.message : '请稍后重试'}
        type="error" showIcon
        action={<Button aria-label="重试" onClick={() => void query.query.refetch()}>重试</Button>}
      /> : <Result status="404" title="记录不存在或不在数据范围内" />
  ) : formContent;
  if (embedded) return <>{content}{overlays}</>;
  if (onDismiss) return (
    <ResourceFormDrawer mode={mode} open={drawerOpen} busy={busy} onClose={cancel} drawerState={drawerState}
      onClosed={() => {
        if (savedIdRef.current !== null && onSaved) onSaved(savedIdRef.current);
        else onDismiss();
      }}
      newPage={{ onClick: () => void newPage() }}
    >
      {content}{overlays}
    </ResourceFormDrawer>
  );
  return (
    <Page
      backLabel={mode === 'edit' && surface.generated?.detail ? '返回详情' : '返回列表'}
      backPath={mode === 'edit' && surface.generated?.detail ? detailPath : listPath}
      onBack={cancel}
      capability={mode === 'create' ? capabilities.create : capabilities.update}
      mode={mode}
      resource={code}
      surface={surface}
      title={name}
    >{content}{overlays}</Page>
  );
}
