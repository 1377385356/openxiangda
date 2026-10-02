import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Form, Space, Typography } from 'antd';
import type { WorkflowTaskDraft, WorkflowTaskFormInput, WorkflowTaskFormSurface } from 'openxiangda-contracts/browser';
import { applyWorkflowTaskPageValues, workflowTaskPageFieldState } from 'openxiangda-contracts/browser';
import { useUnsavedChangesGuard } from '../../navigation-guard';
import { workflowLaunchContractJsonEqual } from '../../workflow-launch';
import { fieldValueForData, fieldValueForForm } from '../platform-fields/field-form-codec';
import { MobileSurfaceFieldControl, SurfaceFieldControl, SurfaceFieldValue } from '../resource/SurfaceFields';
import type { WorkflowFileBinding } from '../../platform-client';
import { useWorkflowTaskFiles, WorkflowTaskFileRecovery } from './WorkflowTaskFiles';
import { WorkflowTaskDraftPanel } from './WorkflowTaskDraftPanel';

export function workflowTaskFormValues(source: WorkflowTaskFormSurface, values: Record<string, unknown>) {
  return Object.fromEntries(source.page.fields.map(field => [field.code,
    field.readonly ? source.values[field.code] : fieldValueForData(source.fields[field.code], values[field.code]) ?? null]));
}

export function workflowTaskFormPatch(source: WorkflowTaskFormSurface, values: Record<string, unknown>): WorkflowTaskFormInput {
  const merged = workflowTaskFormValues(source, values);
  const patch = Object.fromEntries(workflowTaskPageFieldState(source.page, merged)
    .filter(field => field.visible && !field.readonly && !workflowLaunchContractJsonEqual(merged[field.code], source.values[field.code]))
    .map(field => [field.code, merged[field.code]]));
  return { expectedRevision: source.expectedRevision, values: patch };
}

/** A conflict comparison obeys the fresh page's visibility, not the old input's keys. */
export function workflowTaskFormReviewFields(source: WorkflowTaskFormSurface, latest: WorkflowTaskFormSurface, current: Record<string, unknown>) {
  return workflowTaskPageFieldState(latest.page, latest.values).filter(field => field.visible && !field.readonly &&
    (!workflowLaunchContractJsonEqual(source.values[field.code], latest.values[field.code]) ||
      !workflowLaunchContractJsonEqual(current[field.code], latest.values[field.code])));
}

const formValues = (source: WorkflowTaskFormSurface) => Object.fromEntries(source.page.fields.map(field =>
  [field.code, fieldValueForForm(source.fields[field.code], source.values[field.code])]));

/** Page state stays local; the Workflow command is its only submission owner. */
export function useWorkflowTaskForm(latest?: WorkflowTaskFormSurface) {
  const [form] = Form.useForm<Record<string, unknown>>();
  const [source, setSource] = useState(latest);
  const [draft, setDraft] = useState<WorkflowTaskDraft | undefined>();
  const initialSource = useRef(latest);
  const acceptedLatest = useRef(latest);
  const watched = Form.useWatch([], { form, preserve: true }) as Record<string, unknown> | undefined;
  const current = source ? workflowTaskFormValues(source, { ...formValues(source), ...(watched || form.getFieldsValue(true)) }) : {};
  const dirty = Boolean(source && source.page.fields.some(field => !field.readonly &&
    !workflowLaunchContractJsonEqual(source.values[field.code] ?? null, current[field.code] ?? null)));
  const stale = Boolean(source && latest && (source.pageCode !== latest.pageCode || source.expectedRevision !== latest.expectedRevision));
  const draftNeedsSave = Boolean(draft && source && (draft.recordRevision !== source.expectedRevision || draft.pageCode !== source.pageCode));
  const safelyDrafted = Boolean(draft && source && !stale && !draftNeedsSave &&
    workflowLaunchContractJsonEqual(draft.values, workflowTaskFormPatch(source, { ...formValues(source), ...(watched || form.getFieldsValue(true)) }).values));
  const unsaved = dirty && !safelyDrafted;
  useEffect(() => {
    if (!latest || dirty || latest === acceptedLatest.current) return;
    acceptedLatest.current = latest;
    setSource(latest);
    form.setFieldsValue(formValues(latest));
  }, [latest, source, dirty, form]);
  useEffect(() => {
    if (initialSource.current) form.setFieldsValue(formValues(initialSource.current));
  }, [form]);

  const build = async (complete: boolean) => {
    if (!source) return undefined;
    await form.validateFields(workflowTaskPageFieldState(source.page, current)
      .filter(field => field.visible && !field.readonly).map(field => field.code));
    const input = workflowTaskFormPatch(source, form.getFieldsValue(true));
    try { applyWorkflowTaskPageValues(source.page, source.values, input.values, complete); }
    catch (error) {
      const field = (error as { field?: string }).field;
      const label = field && source.fields[field]?.label;
      if (field) form.setFields([{ name: field, errors: [`请填写或选择${label || field}`] }]);
      throw new Error(label ? `请填写或选择${label}` : '请核对补填资料');
    }
    return { ...input, ...(draft ? { draft: { id: draft.id, expectedRevision: draft.revision } } : {}) };
  };
  const reviewLatest = (keep: boolean) => {
    if (!latest || !source) return;
    const patch = keep ? workflowTaskFormPatch(source, form.getFieldsValue(true)).values : {};
    acceptedLatest.current = latest;
    setSource({ ...latest, values: latest.values });
    form.setFieldsValue({ ...formValues(latest), ...Object.fromEntries(Object.entries(patch)
      .filter(([code]) => latest.page.fields.some(field => field.code === code && !field.readonly))
      .map(([code, value]) => [code, fieldValueForForm(latest.fields[code], value)])) });
  };
  const committed = (input?: WorkflowTaskFormInput, revision?: number) => {
    if (!source || !input) return;
    const values = { ...source.values, ...input.values };
    setDraft(undefined);
    setSource({ ...source, expectedRevision: revision || source.expectedRevision, values });
    form.setFieldsValue(formValues({ ...source, values }));
  };
  const adoptDraft = (saved: WorkflowTaskDraft) => {
    if (!latest) return;
    const values = applyWorkflowTaskPageValues(latest.page, latest.values, saved.values, false);
    acceptedLatest.current = latest;
    setSource(latest);
    form.setFieldsValue(formValues({ ...latest, values }));
    setDraft(saved);
  };
  const savedDraft = (saved: WorkflowTaskDraft) => {
    if (!source) return;
    form.setFieldsValue(formValues({ ...source, values: { ...source.values, ...saved.values } }));
    setDraft(saved);
  };
  const removedDraft = (id: string) => setDraft(currentDraft => currentDraft?.id === id ? undefined : currentDraft);
  return { form, source, latest, current, dirty, unsaved, stale, draft, draftNeedsSave, build, reviewLatest, committed, adoptDraft, savedDraft, removedDraft };
}

export function WorkflowTaskForm({ controller, disabled, draftDisabled = disabled, taskId, onDraftBusyChange, onFileBusyChange, onRefresh, variant, resourceCode, recordId }: {
  controller: ReturnType<typeof useWorkflowTaskForm>;
  disabled: boolean;
  draftDisabled?: boolean;
  taskId?: string;
  onDraftBusyChange?: (busy: boolean) => void;
  onFileBusyChange?: (busy: boolean) => void;
  onRefresh?: () => Promise<void>;
  variant: 'desktop' | 'mobile';
  resourceCode?: string;
  recordId?: string;
}) {
  const { modal } = App.useApp();
  const files = useWorkflowTaskFiles({ taskId, controller, onBusyChange: onFileBusyChange });
  const binding = (fieldCode: string): WorkflowFileBinding | undefined => taskId && resourceCode && recordId
    ? { taskId, resourceCode, recordId, fieldCode } : undefined;
  const { form, source, latest, current, unsaved, stale } = controller;
  useUnsavedChangesGuard({ when: unsaved || disabled, preventNavigation: disabled,
    message: disabled ? '资料操作结果尚待确认，请先确认原操作结果。' : '当前输入尚未提交或保存私有草稿，离开后将丢失。' });
  useEffect(() => {
    if (!unsaved && !disabled) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [unsaved, disabled]);
  if (!source) return null;
  const Control = variant === 'mobile' ? MobileSurfaceFieldControl : SurfaceFieldControl;
  const review = (keep: boolean) => modal.confirm({ title: keep ? '核对最新资料后保留输入？' : '采用最新资料？',
    content: keep ? '其他处理人的最新值已读取。保留当前填写的字段后，请逐项核对再提交。' : '当前尚未提交的输入将被最新资料替换。',
    okText: keep ? '保留并核对' : '采用最新资料', cancelText: '继续查看', onOk: () => controller.reviewLatest(keep) });
  return <section className={`oxa-workflow-task-form oxa-workflow-task-form-${variant}`} aria-label={source.page.title}>
    <Typography.Title level={4}>{source.page.title}</Typography.Title>
    <Typography.Paragraph type="secondary">保存补填后，任务仍由你继续办理。同意或重新提交时会一起提交资料。</Typography.Paragraph>
    <WorkflowTaskFileRecovery files={files} />
    {taskId && <WorkflowTaskDraftPanel controller={controller} taskId={taskId} disabled={draftDisabled || Boolean(files.pending)}
      variant={variant} resourceCode={resourceCode} recordId={recordId} onBusyChange={onDraftBusyChange} onRefresh={onRefresh} />}
    {stale && <Alert showIcon type="warning" title="业务资料已更新，当前输入已保留" description={<>
      <p>请核对最新资料后再提交。</p>
      {latest && workflowTaskFormReviewFields(source, latest, current)
        .map(field => <div className="oxa-workflow-task-value-review" key={field.code}>
          <strong>{latest.fields[field.code]?.label || field.code}</strong>
          <div><span>最新已保存</span><SurfaceFieldValue field={{ ...latest.fields[field.code]!, key: field.code }} value={latest.values[field.code]} resourceCode={resourceCode} workflowFileBinding={binding(field.code)} mobile={variant === 'mobile'} /></div>
          <div><span>我的输入</span><SurfaceFieldValue field={{ ...latest.fields[field.code]!, key: field.code }} value={current[field.code]} resourceCode={resourceCode} workflowFileBinding={binding(field.code)} mobile={variant === 'mobile'} /></div>
        </div>)}
    </>} action={<Space wrap>
      <Button disabled={disabled} onClick={() => review(true)}>保留输入并核对</Button>
      <Button disabled={disabled} onClick={() => review(false)}>采用最新资料</Button>
    </Space>} />}
    <Form form={form} layout="vertical" initialValues={formValues(source)} disabled={disabled || stale}>
      {workflowTaskPageFieldState(source.page, current).filter(state => state.visible).map(state => {
        const field = { ...source.fields[state.code]!, key: state.code, requiredHint: false };
        const uploadNeedsSave = ['file', 'image', 'signature', 'text.rich'].includes(field.type) &&
          !workflowTaskPageFieldState((latest || source).page, (latest || source).values).some(saved => saved.code === state.code && saved.visible && !saved.readonly);
        return state.readonly
          ? <div className="oxa-workflow-task-readonly" key={state.code}><Typography.Text type="secondary">{field.label}</Typography.Text><div>
              <SurfaceFieldValue field={field} value={source.values[state.code]} resourceCode={resourceCode} workflowFileBinding={binding(state.code)} mobile={variant === 'mobile'} />
            </div></div>
          : <div key={state.code} className={state.required ? 'oxa-workflow-task-required' : undefined}>
              {uploadNeedsSave && <Alert type="info" showIcon title="请先保存补填，让该附件字段生效，再上传文件。" />}
              <Control field={field} disabled={disabled || stale || uploadNeedsSave} operation="update" resourceCode={resourceCode} recordId={recordId}
                workflowFileBinding={binding(state.code)} renderers={{ upload: files.upload }} />
              {state.required && <Typography.Text className="oxa-workflow-task-required-hint" type="secondary">完成任务前必填</Typography.Text>}
            </div>;
      })}
    </Form>
  </section>;
}
