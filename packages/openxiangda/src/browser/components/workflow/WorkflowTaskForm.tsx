import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Form, Space, Typography } from 'antd';
import type { WorkflowTaskFormInput, WorkflowTaskFormSurface } from 'openxiangda-contracts/browser';
import { applyWorkflowTaskPageValues, workflowTaskPageFieldState } from 'openxiangda-contracts/browser';
import { useUnsavedChangesGuard } from '../../navigation-guard';
import { workflowLaunchContractJsonEqual } from '../../workflow-launch';
import { fieldValueForData, fieldValueForForm } from '../platform-fields/field-form-codec';
import { MobileSurfaceFieldControl, SurfaceFieldControl, SurfaceFieldValue } from '../resource/SurfaceFields';

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

const formValues = (source: WorkflowTaskFormSurface) => Object.fromEntries(source.page.fields.map(field =>
  [field.code, fieldValueForForm(source.fields[field.code], source.values[field.code])]));

/** Page state stays local; the Workflow command is its only submission owner. */
export function useWorkflowTaskForm(latest?: WorkflowTaskFormSurface) {
  const [form] = Form.useForm<Record<string, unknown>>();
  const [source, setSource] = useState(latest);
  const initialSource = useRef(latest);
  const acceptedLatest = useRef(latest);
  const watched = Form.useWatch([], { form, preserve: true }) as Record<string, unknown> | undefined;
  const current = source ? workflowTaskFormValues(source, { ...formValues(source), ...(watched || form.getFieldsValue(true)) }) : {};
  const dirty = Boolean(source && source.page.fields.some(field => !field.readonly &&
    !workflowLaunchContractJsonEqual(source.values[field.code] ?? null, current[field.code] ?? null)));
  const stale = Boolean(source && latest && (source.pageCode !== latest.pageCode || source.expectedRevision !== latest.expectedRevision));
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
    return input;
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
    setSource({ ...source, expectedRevision: revision || source.expectedRevision, values });
    form.setFieldsValue(formValues({ ...source, values }));
  };
  return { form, source, current, dirty, stale, build, reviewLatest, committed };
}

export function WorkflowTaskForm({ controller, disabled, variant, resourceCode, recordId }: {
  controller: ReturnType<typeof useWorkflowTaskForm>;
  disabled: boolean;
  variant: 'desktop' | 'mobile';
  resourceCode?: string;
  recordId?: string;
}) {
  const { modal } = App.useApp();
  const { form, source, current, dirty, stale } = controller;
  useUnsavedChangesGuard({ when: dirty, preventNavigation: disabled,
    message: disabled ? '补填资料正在提交，请先确认原操作结果。' : '补填资料尚未提交，离开后将丢失。' });
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  if (!source) return null;
  const Control = variant === 'mobile' ? MobileSurfaceFieldControl : SurfaceFieldControl;
  const review = (keep: boolean) => modal.confirm({ title: keep ? '核对最新资料后保留输入？' : '采用最新资料？',
    content: keep ? '其他处理人的最新值已读取。保留当前填写的字段后，请逐项核对再提交。' : '当前尚未提交的输入将被最新资料替换。',
    okText: keep ? '保留并核对' : '采用最新资料', cancelText: '继续查看', onOk: () => controller.reviewLatest(keep) });
  return <section className={`oxa-workflow-task-form oxa-workflow-task-form-${variant}`} aria-label={source.page.title}>
    <Typography.Title level={4}>{source.page.title}</Typography.Title>
    <Typography.Paragraph type="secondary">保存补填后，任务仍由你继续办理。同意或重新提交时会一起提交资料。</Typography.Paragraph>
    {stale && <Alert showIcon type="warning" title="业务资料已更新，当前输入已保留" description="请核对最新资料后再提交。" action={<Space wrap>
      <Button disabled={disabled} onClick={() => review(true)}>保留输入并核对</Button>
      <Button disabled={disabled} onClick={() => review(false)}>采用最新资料</Button>
    </Space>} />}
    <Form form={form} layout="vertical" initialValues={formValues(source)} disabled={disabled}>
      {workflowTaskPageFieldState(source.page, current).filter(state => state.visible).map(state => {
        const field = { ...source.fields[state.code]!, key: state.code, requiredHint: false };
        return state.readonly
          ? <div className="oxa-workflow-task-readonly" key={state.code}><Typography.Text type="secondary">{field.label}</Typography.Text><div>
              <SurfaceFieldValue field={field} value={source.values[state.code]} resourceCode={resourceCode} mobile={variant === 'mobile'} />
            </div></div>
          : <div key={state.code} className={state.required ? 'oxa-workflow-task-required' : undefined}>
              <Control field={field} disabled={disabled} operation="update" resourceCode={resourceCode} recordId={recordId} />
              {state.required && <Typography.Text className="oxa-workflow-task-required-hint" type="secondary">完成任务前必填</Typography.Text>}
            </div>;
      })}
    </Form>
  </section>;
}
