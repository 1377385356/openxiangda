import { Alert, App, Button, Result, Spin } from 'antd';
import type { WorkflowRecordCorrectionSurface } from 'openxiangda-contracts/browser';
import { useEffect, useRef, useState } from 'react';
import { correctWorkflowRecord, createNativeResourceClient, loadWorkflowRecordCorrection } from '../../platform-client';
import { useRuntime } from '../../runtime';
import { useResourceDefinitions } from '../../resource-definitions';
import { normalizeFormValues, normalizeRecordForForm } from '../platform-fields/field-form-codec';
import { ResourceFormContent, ResourceFormDrawer, type ResourceFormDrawerState } from '../resource/ResourceFormFrame';
import { MobileResourceFormPage, ResourceFormPage } from '../resource/StandardResourcePages';
import { buildResourceFormOperations } from '../resource/resource-form-operations';
import { SubtableField } from '../platform-fields/SubtableField';
import { fieldsBySection, fieldWriteAuthorized, signatureSigner } from '../resource/resource-page-helpers';

function correctionGroups(surface: WorkflowRecordCorrectionSurface) {
  const editable = surface.editableFields;
  if (!Array.isArray(editable) || !editable.length || editable.length > 200 || new Set(editable).size !== editable.length) {
    throw new Error('OPENXIANGDA_WORKFLOW_CORRECTION_FIELDS_INVALID');
  }
  const groups = fieldsBySection(surface.surface).map(group => ({
    ...group,
    fields: group.fields.filter(field => editable.includes(field.key) && !field.system && field.widget !== 'readonly'),
  })).filter(group => group.fields.length);
  if (groups.flatMap(group => group.fields).length !== editable.length) {
    throw new Error('OPENXIANGDA_WORKFLOW_CORRECTION_FIELDS_INVALID');
  }
  return groups;
}

/** Corrections are a Workflow-owned admin command, never a CRUD update or resubmission. */
interface WorkflowRecordEditorProps {
  resourceCode: string; recordId: string; onDismiss(): void; onSaved(id: string): void;
  variant?: 'desktop' | 'mobile'; presentation?: 'drawer' | 'page' | 'embedded'; onBusyChange?: (busy: boolean) => void; backPath?: string; drawerState?: ResourceFormDrawerState;
}

export function WorkflowRecordEditor(props: WorkflowRecordEditorProps) {
  const { identity } = useRuntime();
  // No Surface/form/request state may cross a principal, environment or record boundary.
  return <WorkflowRecordEditSession
    key={`${identity.identityScope}:${identity.environment.id}:${identity.isAppSuperAdmin}:${props.resourceCode}:${props.recordId}`}
    {...props}
  />;
}

function WorkflowRecordEditSession({ resourceCode, recordId, onDismiss, onSaved, variant = 'desktop', presentation = 'drawer', backPath = '', drawerState, onBusyChange }: WorkflowRecordEditorProps) {
  const { identity, hasCapability } = useRuntime();
  const definitions = useResourceDefinitions();
  const { message } = App.useApp();
  const [surface, setSurface] = useState<WorkflowRecordCorrectionSurface>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  useEffect(() => { onBusyChange?.(pending); return () => onBusyChange?.(false); }, [pending, onBusyChange]);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);
  const active = useRef(false);
  const saved = useRef(false);
  const requestKey = useRef<{ payload: string; key: string } | undefined>(undefined);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    if (!identity.isAppSuperAdmin) return;
    let current = true;
    setLoading(true);
    setSurface(undefined);
    setError('');
    void loadWorkflowRecordCorrection(resourceCode, recordId).then(next => {
      correctionGroups(next);
      if (current) setSurface(next);
    }).catch(reason => {
      if (current) setError(reason instanceof Error ? reason.message : '读取失败');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [resourceCode, recordId, attempt, identity.isAppSuperAdmin]);
  const dismiss = () => { if (!busy.current) { if (presentation !== 'drawer') onDismiss(); else setDrawerOpen(false); } };
  const submit = async (values: Record<string, unknown>) => {
    if (!surface || !identity.isAppSuperAdmin || busy.current || saved.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      const data = normalizeFormValues(Object.fromEntries(surface.editableFields.filter(key => surface.surface.fields[key]?.type !== 'subtable' && Object.hasOwn(values, key)).map(key => [key, values[key]])), surface.surface);
      const operations = buildResourceFormOperations({
        mode: 'edit', resourceCode, record: surface.record, data, values,
        subtableFields: correctionGroups(surface).flatMap(group => group.fields).filter(field => field.type === 'subtable'),
        definitions,
        canWrite: (fieldCode, field, operation) => fieldWriteAuthorized({ key: fieldCode, ...field }, operation === 'create' ? 'create' : 'edit', hasCapability, identity.isAppSuperAdmin),
        canDelete: child => identity.isAppSuperAdmin || hasCapability(child.capabilities.delete),
      });
      const payload = JSON.stringify(operations);
      if (!requestKey.current || requestKey.current.payload !== payload) {
        requestKey.current = { payload, key: `correction:${crypto.randomUUID()}` };
      }
      await correctWorkflowRecord(surface, resourceCode, operations, requestKey.current.key);
      if (!active.current) return;
      saved.current = true;
      message.success('修改已保存');
      if (presentation !== 'drawer') onSaved(recordId);
      else setDrawerOpen(false);
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试');
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  };
  const content = !identity.isAppSuperAdmin ? <Result status="403" title="当前平台用户无此操作权限" /> :
      loading ? <div className="oxa-page-loading"><Spin /></div> : !surface ?
        <Alert type="error" title="数据读取失败" description={error} action={<Button aria-label="重试" onClick={() => setAttempt(value => value + 1)}>重试</Button>} /> :
        <ResourceFormContent variant={variant} mode="edit" resourceCode={resourceCode} recordId={recordId}
          initialValues={normalizeRecordForForm(surface.record, surface.surface)} groups={correctionGroups(surface)}
          busy={pending || saved.current} pending={pending} submitDisabled={saved.current} error={error}
          actions={presentation === 'embedded' ? <Button disabled={pending} onClick={dismiss}>取消</Button> : undefined}
          canWriteField={field => surface.editableFields.includes(field.key)} onSubmit={values => void submit(values)}
          renderers={{
            renderSubtable: context => <SubtableField disabled={context.disabled} field={context.field} mobile={variant === 'mobile'} operation={context.operation} parentRecordId={context.recordId} />,
            signer: signatureSigner(identity.subjectProfile),
            upload: (current, file, parentId) => createNativeResourceClient(resourceCode, surface.surface).upload(current.key, file, parentId),
          }}
        />;
  if (presentation === 'embedded') return content;
  if (presentation === 'page') {
    const Page = variant === 'mobile' ? MobileResourceFormPage : ResourceFormPage;
    const definition = definitions[resourceCode];
    return <Page mode="edit" resource={resourceCode} surface={surface?.surface} title={definition?.name || '数据'}
      capability={definition?.capabilities.read || ''} backLabel="返回详情" backPath={backPath} onBack={dismiss}
    >{content}</Page>;
  }
  return <ResourceFormDrawer mode="edit" open={drawerOpen} busy={pending} onClose={dismiss} drawerState={drawerState}
    onClosed={() => saved.current ? onSaved(recordId) : onDismiss()}>
    {content}
  </ResourceFormDrawer>;
}
