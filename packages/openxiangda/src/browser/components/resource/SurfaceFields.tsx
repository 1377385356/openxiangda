import {
  PictureOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Rate,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type {
  DataAuditEntry,
  DataEventFieldChange,
  DataFieldSurface,
  DataFieldSourceLaunchBinding,
  DataFileRef,
  DepartmentReferenceValue,
  EventValueDigest,
  LabeledValue,
  ResourceReferenceValue,
  StableAddressValue,
  StableLocationValue,
  StableSignatureValue,
  UserReferenceValue,
} from 'openxiangda-contracts/browser';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AuthoritativeSelector,
  ResolvedValueText,
} from '../../AuthoritativeSelector';
import { AddressField, AddressValueDisplay } from '../platform-fields/AddressField';
import { MobileManagedFileField } from '../platform-fields/MobileManagedFileField';
import { AttachmentFileList, formatManagedFileSize } from '../platform-fields/AttachmentFileList';
import { CascadeField, CascadeValueDisplay } from '../platform-fields/CascadeField';
import type { CascadeStoredValue } from '../platform-fields/cascade-value';
import { DateTimeField, DateTimeFilter, DateTimeValueDisplay } from '../platform-fields/DateTimeField';
import { rangeValueValidationMessage } from '../platform-fields/field-form-codec';
import { MobileBooleanField, MobileDateTimeField, MobileNumberField, MobileOptionField, MobileRatingField, MobileTextField } from '../platform-fields/MobileFieldControls';
import { MobileRichTextField } from '../platform-fields/MobileRichTextField';
import { MobileSubtableValidationContext, useMobileSubtableValidation } from '../platform-fields/MobileSubtableValidation';
import { MobileFieldFrame } from '../platform-fields/MobileFieldFrame';
import { JsonField, JsonValueDisplay } from '../platform-fields/JsonField';
import { LocationField, LocationValueDisplay } from '../platform-fields/LocationField';
import { PlatformDirectoryPicker } from '../platform-fields/PlatformDirectoryPicker';
import { ResourceReferenceField } from '../platform-fields/ResourceReferenceField';
import { RichTextField, RichTextValueDisplay } from '../platform-fields/RichTextField';
import { SignatureField, SignatureValueDisplay } from '../platform-fields/SignatureField';
import type { WorkflowFileBinding } from '../../platform-client';

export type SurfaceField = DataFieldSurface & { key: string };

export function auditFieldCodes(entry: DataAuditEntry) {
  return Object.keys(entry.changes);
}

export function auditFieldChange(
  entry: DataAuditEntry,
  fieldCode: string
): DataEventFieldChange | undefined {
  const value = entry.changes[fieldCode];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  if (!('before' in value) && !('after' in value)) return undefined;
  return value;
}

export function isEventValueDigest(value: unknown): value is EventValueDigest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.kind === 'digest' &&
    candidate.truncated === true &&
    typeof candidate.valueType === 'string' &&
    Number.isSafeInteger(candidate.bytes) &&
    Number(candidate.bytes) >= 0 &&
    typeof candidate.sha256 === 'string' &&
    /^[0-9a-f]{64}$/i.test(candidate.sha256)
  );
}

export function auditActorLabel(entry: DataAuditEntry) {
  const labels: Record<string, string> = {
    application: '应用服务',
    developer: '连接开发者',
    system: '平台系统',
    timer: '定时任务',
    user: '平台用户',
    user_union: '平台用户',
    anonymous_public: '外部访客',
    workflow: '工作流',
  };
  return Object.hasOwn(labels, entry.actor.principalType)
    ? labels[entry.actor.principalType]
    : '操作人暂不可解析';
}

export function listSurfaceFields(fields: Record<string, DataFieldSurface>) {
  return Object.entries(fields)
    .filter(([, field]) => field.list && !(field.hidden ?? field.system ?? false))
    .map(([key, field]) => ({ key, ...field }));
}

export interface SurfaceFieldEditContext {
  field: SurfaceField;
  disabled: boolean;
  operation: 'create' | 'update';
  resourceCode?: string;
  recordId?: string;
}

export interface SurfaceFieldValueContext {
  mobile?: boolean;
  field: SurfaceField;
  value: unknown;
  resourceCode?: string;
  workflowFileBinding?: WorkflowFileBinding;
  presentation?: 'default' | 'workflow-detail';
}

export interface SurfaceFieldRenderers {
  referenceLaunch?: DataFieldSourceLaunchBinding;
  renderExtra?: (context: SurfaceFieldEditContext) => ReactNode;
  renderScope?: (context: SurfaceFieldEditContext) => ReactNode;
  renderSubtable?: (context: SurfaceFieldEditContext) => ReactNode;
  renderFilter?: (context: SurfaceFilterContext) => ReactNode;
  upload?: (
    field: SurfaceField,
    file: File,
    recordId?: string
  ) => Promise<DataFileRef>;
  signer?: UserReferenceValue;
  renderValue?: (context: SurfaceFieldValueContext) => ReactNode | undefined;
}

export interface SurfaceFilterContext {
  field: SurfaceField;
  resourceCode?: string;
  value: unknown;
  onChange: (value: unknown) => void;
}

function numberInputProps(field: SurfaceField) {
  const scale = field.type === 'number.integer' ? 0 : field.scale;
  return {
    ...(scale === undefined ? {} : { precision: scale }),
    step: scale === undefined ? 'any' : scale === 0 ? 1 : 10 ** -scale,
    ...(field.widget === 'money' ? { prefix: '¥' } : {}),
    ...(field.widget === 'percent' ? { suffix: '%' } : {}),
  };
}

function rangeValidationRules(field: SurfaceField) {
  if (field.type !== 'date-range' && field.type !== 'datetime-range') return [];
  return [{
    validator: (_rule: unknown, value: unknown) => {
      const message = rangeValueValidationMessage(field, value);
      return message ? Promise.reject(new Error(message)) : Promise.resolve();
    },
  }];
}

function mobileNumberValidationRules(field: SurfaceField) {
  if (!field.type.startsWith('number.')) return [];
  return [{ validator: (_rule: unknown, value: unknown) => {
    if (value == null || value === '') return Promise.resolve();
    const valid = typeof value === 'number' && Number.isFinite(value) &&
      (field.type !== 'number.integer' || Number.isSafeInteger(value)) &&
      (field.min === undefined || value >= field.min) &&
      (field.max === undefined || value <= field.max);
    return valid ? Promise.resolve() : Promise.reject(new Error(
      `请填写有效${field.type === 'number.integer' ? '整数' : '数字'}${field.min === undefined ? '' : `，最小 ${field.min}`}${field.max === undefined ? '' : `，最大 ${field.max}`}`
    ));
  } }];
}

/** Render a standard filter control from the same field surface used by forms. */
export function SurfaceFilterControl({
  field,
  resourceCode,
  value,
  onChange,
  range = false,
  renderers,
}: SurfaceFilterContext & { range?: boolean; renderers?: Pick<SurfaceFieldRenderers, 'renderScope' | 'renderFilter'> }) {
  const custom = renderers?.renderFilter?.({ field, value, onChange });
  if (custom !== undefined) return custom;
  const placeholder = `筛选${field.label}`;
  switch (field.widget) {
    case 'switch':
      return (
        <Select
          allowClear
          options={[{ label: '是', value: true }, { label: '否', value: false }]}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
      );
    case 'select':
    case 'multi-select':
      return (
        <Select
          allowClear
          mode={field.widget === 'multi-select' ? 'multiple' : undefined}
          options={field.options}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
      );
    case 'date':
    case 'time':
    case 'datetime':
    case 'date-range':
    case 'datetime-range':
      return <DateTimeFilter field={field} onChange={onChange} value={value} />;
    case 'number':
    case 'money':
    case 'percent':
      if (range) {
        const values = Array.isArray(value) ? value as [number | undefined, number | undefined] : [];
        return (
          <Space.Compact>
            <InputNumber {...numberInputProps(field)} onChange={next => onChange([next === null ? undefined : Number(next), values[1]])} placeholder={`最低${field.label}`} value={values[0]} />
            <InputNumber {...numberInputProps(field)} onChange={next => onChange([values[0], next === null ? undefined : Number(next)])} placeholder={`最高${field.label}`} value={values[1]} />
          </Space.Compact>
        );
      }
      return <InputNumber {...numberInputProps(field)} onChange={onChange} placeholder={placeholder} value={value as number | null | undefined} />;
    case 'scope':
      return renderers?.renderScope?.({ field, disabled: false, operation: 'update' }) || <Input allowClear value={value as string | undefined} onChange={event => onChange(event.target.value)} placeholder={placeholder} />;
    case 'directory-user':
    case 'directory-department':
      return <PlatformDirectoryPicker kind={field.widget === 'directory-user' ? 'user' : 'department'} multiple={field.type.endsWith('.multiple')} onChange={onChange as (value: UserReferenceValue | DepartmentReferenceValue | Array<UserReferenceValue | DepartmentReferenceValue> | undefined) => void} placeholder={placeholder} value={value as UserReferenceValue | DepartmentReferenceValue | Array<UserReferenceValue | DepartmentReferenceValue> | undefined} />;
    case 'resource':
      return (
        <AuthoritativeSelector
          fieldCode={field.key}
          multiple={field.type === 'resource-ref.multiple'}
          onChange={onChange}
          operation="update"
          placeholder={placeholder}
          resourceCode={resourceCode}
          source="resource"
          value={value as ResourceReferenceValue | ResourceReferenceValue[] | undefined}
        />
      );
    case 'cascade':
      return (
        <CascadeField
          field={field}
          onChange={onChange}
          value={value as CascadeStoredValue | undefined}
        />
      );
    case 'address':
      return (
        <AddressField
          detailEnabled={false}
          onChange={onChange}
          value={value as StableAddressValue | undefined}
        />
      );
    case 'json':
      return <JsonField onChange={onChange} value={value} />;
    default:
      return <Input allowClear value={value as string | undefined} onChange={event => onChange(event.target.value)} placeholder={placeholder} />;
  }
}

function snapshotIds(value: LabeledValue | LabeledValue[] | undefined) {
  return (Array.isArray(value) ? value : value ? [value] : []).map(
    item => item.value
  );
}

function StaticOptionField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: SurfaceField;
  value?: LabeledValue | LabeledValue[];
  onChange?: (value: LabeledValue | LabeledValue[] | undefined) => void;
  disabled?: boolean;
}) {
  const multiple = field.type === 'option.multiple';
  const ids = snapshotIds(value);
  const emit = (next: string | string[] | undefined) => {
    const selected = (Array.isArray(next) ? next : next ? [next] : [])
      .map(id => field.options?.find(option => option.value === id))
      .filter((item): item is LabeledValue => Boolean(item))
      .map(item => ({ ...item }));
    onChange?.(multiple ? selected : selected[0]);
  };
  if (field.widget === 'radio') {
    return (
      <Radio.Group
        disabled={disabled}
        onChange={event => emit(event.target.value)}
        options={field.options}
        value={ids[0]}
      />
    );
  }
  if (field.widget === 'checkbox') {
    return (
      <Checkbox.Group
        disabled={disabled}
        onChange={next => emit(next.map(String))}
        options={field.options}
        value={ids}
      />
    );
  }
  return (
    <Select
      allowClear
      disabled={disabled}
      mode={multiple ? 'multiple' : undefined}
      onChange={next => emit(next || undefined)}
      options={field.options}
      placeholder={`请选择${field.label}`}
      value={multiple ? ids : ids[0]}
    />
  );
}

function DesktopBooleanField({ field, disabled, checked, id, onChange }: {
  field: SurfaceField; disabled?: boolean; checked?: boolean; id?: string;
  onChange?: (value: boolean) => void;
}) {
  return <Space>
    <Radio.Group id={id} aria-label={field.label} disabled={disabled}
      value={typeof checked === 'boolean' ? checked : undefined}
      options={[{ label: '是', value: true }, { label: '否', value: false }]}
      onChange={event => onChange?.(event.target.value)} />
    {typeof checked !== 'boolean' && <Typography.Text type="secondary">未选择</Typography.Text>}
  </Space>;
}

export function SurfaceFieldControl({
  field,
  disabled,
  operation,
  resourceCode,
  recordId,
  renderers,
}: SurfaceFieldEditContext & { renderers?: SurfaceFieldRenderers }) {
  const subtableValidation = useMobileSubtableValidation();
  const rules = disabled || field.widget === 'readonly' ? [] : [
    ...(field.requiredHint
      ? [{ required: true, message: `请填写或选择${field.label}` }]
      : []),
    ...(field.widget === 'email'
      ? [{ type: 'email' as const, message: '邮箱格式不正确' }]
      : []),
    ...(field.widget === 'phone'
      ? [{ pattern: /^1\d{10}$/, message: '请输入 11 位手机号' }]
      : []),
    ...rangeValidationRules(field),
    ...(field.widget === 'subtable' ? [{ validator: subtableValidation.validator }] : []),
  ];
  const common = {
    disabled,
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    placeholder: `请输入${field.label}`,
  };
  let control: ReactNode = <Input {...common} />;
  switch (field.widget) {
    case 'textarea':
      control = <Input.TextArea {...common} rows={3} />;
      break;
    case 'rating':
      control = <Rate disabled={disabled} />;
      break;
    case 'number':
    case 'money':
    case 'percent':
      control = (
        <InputNumber
          {...common}
          {...numberInputProps(field)}
          max={field.max}
          min={field.min}
          style={{ width: '100%' }}
        />
      );
      break;
    case 'date':
    case 'time':
    case 'datetime':
    case 'date-range':
    case 'datetime-range':
      control = <DateTimeField disabled={disabled} field={field} />;
      break;
    case 'switch':
      control = <DesktopBooleanField field={field} disabled={disabled} />;
      break;
    case 'select':
    case 'multi-select':
    case 'radio':
    case 'checkbox':
      control = field.source ? (
        <ResourceReferenceField
          disabled={disabled}
          field={field}
          fieldCode={field.key}
          operation={operation}
          launch={renderers?.referenceLaunch}
          resourceCode={resourceCode}
        />
      ) : (
        <StaticOptionField disabled={disabled} field={field} />
      );
      break;
    case 'email':
      control = <Input {...common} type="email" />;
      break;
    case 'phone':
      control = <Input {...common} type="tel" />;
      break;
    case 'scope':
      control = renderers?.renderScope?.({ field, disabled, operation, recordId }) || (
        <Input {...common} />
      );
      break;
    case 'directory-user':
    case 'directory-department':
      control = (
        <PlatformDirectoryPicker
          disabled={disabled}
          kind={field.widget === 'directory-user' ? 'user' : 'department'}
          multiple={field.type.endsWith('.multiple')}
          placeholder={`搜索并选择${field.label}`}
        />
      );
      break;
    case 'resource':
      control = (
        <ResourceReferenceField
          disabled={disabled}
          field={field}
          fieldCode={field.key}
          operation={operation}
          launch={renderers?.referenceLaunch}
          resourceCode={resourceCode}
        />
      );
      break;
    case 'cascade':
      control = <CascadeField disabled={disabled} field={field} />;
      break;
    case 'attachment':
    case 'image':
      control = (
        <ManagedFileField
          accept={field.accept}
          disabled={disabled}
          field={field}
          maxCount={field.maxCount}
          maxSizeMb={field.maxSizeMb}
          multiple={(field.maxCount ?? 1) > 1}
          onUpload={renderers?.upload}
          recordId={recordId}
          resourceCode={resourceCode}
        />
      );
      break;
    case 'location':
      control = <LocationField disabled={disabled} />;
      break;
    case 'signature':
      control = (
        <SignatureField
          disabled={disabled}
          onUpload={renderers?.upload
            ? file => renderers.upload!(field, file, recordId)
            : undefined}
          resourceCode={resourceCode}
          signer={renderers?.signer}
        />
      );
      break;
    case 'address':
      control = <AddressField disabled={disabled} />;
      break;
    case 'rich-text':
      control = (
        <RichTextField
          disabled={disabled}
          onUpload={renderers?.upload
            ? file => renderers.upload!(field, file, recordId)
            : undefined}
          resourceCode={resourceCode}
        />
      );
      break;
    case 'json':
      control = <JsonField disabled={disabled} />;
      break;
    case 'subtable':
      control = renderers?.renderSubtable?.({
        field,
        disabled,
        operation,
        resourceCode,
        recordId,
      }) || <Alert message="子表渲染器未配置" showIcon type="error" />;
      break;
    case 'readonly':
      control = (
        <Input
          {...common}
          placeholder={field.type === 'serial-number'
            ? '保存后由系统自动生成'
            : '由系统生成'}
          readOnly
        />
      );
      break;
    case 'text':
    default:
      break;
  }
  const extra = renderers?.renderExtra?.({
    field,
    disabled,
    operation,
    recordId,
  });
  const wide = ['textarea', 'attachment', 'image', 'rich-text', 'address', 'location', 'signature', 'json', 'subtable'].includes(field.widget);
  const frame = (
    <Form.Item
      className={wide ? 'oxa-field-wide' : undefined}
      extra={extra}
      label={field.label}
      name={field.key}
      rules={rules}
      valuePropName={field.widget === 'switch' ? 'checked' : 'value'}
    >
      {control}
    </Form.Item>
  );
  return field.widget === 'subtable' ? <MobileSubtableValidationContext.Provider value={subtableValidation.register}>{frame}</MobileSubtableValidationContext.Provider> : frame;
}

/** Mobile controls share canonical values and the form controller with desktop. */
export function MobileSurfaceFieldControl({
  field,
  disabled,
  operation,
  resourceCode,
  recordId,
  renderers,
}: SurfaceFieldEditContext & { renderers?: SurfaceFieldRenderers }) {
  const subtableValidation = useMobileSubtableValidation();
  const rules = disabled || field.widget === 'readonly'
    ? []
    : [
        ...(field.requiredHint
          ? [{ required: true, message: `请填写或选择${field.label}` }]
          : []),
        ...rangeValidationRules(field),
        ...mobileNumberValidationRules(field),
        ...(field.widget === 'subtable' ? [{ validator: subtableValidation.validator }] : []),
      ];
  let control: ReactNode = <MobileTextField disabled={disabled} field={field} />;
  switch (field.widget) {
    case 'textarea':
      control = <MobileTextField disabled={disabled} field={field} />;
      break;
    case 'rating':
      control = <MobileRatingField disabled={disabled} field={field} />;
      break;
    case 'number':
    case 'money':
    case 'percent':
      control = <MobileNumberField disabled={disabled} field={field} />;
      break;
    case 'date':
    case 'time':
    case 'datetime':
    case 'date-range':
    case 'datetime-range':
      control = <MobileDateTimeField disabled={disabled} field={field} />;
      break;
    case 'switch':
      control = <MobileBooleanField disabled={disabled} field={field} />;
      break;
    case 'select':
    case 'multi-select':
    case 'radio':
    case 'checkbox':
      control = field.source ? (
        <ResourceReferenceField
          disabled={disabled}
          field={field}
          fieldCode={field.key}
          mobile
          operation={operation}
          launch={renderers?.referenceLaunch}
          resourceCode={resourceCode}
        />
      ) : (
        <MobileOptionField disabled={disabled} field={field} />
      );
      break;
    case 'email':
      control = <MobileTextField disabled={disabled} field={field} />;
      break;
    case 'phone':
      control = <MobileTextField disabled={disabled} field={field} />;
      break;
    case 'scope':
      control = renderers?.renderScope?.({ field, disabled, operation, recordId }) || (
        <MobileTextField disabled={disabled} field={field} />
      );
      break;
    case 'directory-user':
    case 'directory-department':
      control = (
        <PlatformDirectoryPicker
          mobile
          disabled={disabled}
          kind={field.widget === 'directory-user' ? 'user' : 'department'}
          multiple={field.type.endsWith('.multiple')}
          placeholder={`搜索并选择${field.label}`}
        />
      );
      break;
    case 'resource':
      control = (
        <ResourceReferenceField
          disabled={disabled}
          field={field}
          fieldCode={field.key}
          mobile
          operation={operation}
          launch={renderers?.referenceLaunch}
          resourceCode={resourceCode}
        />
      );
      break;
    case 'cascade':
      control = <CascadeField disabled={disabled} field={field} mobile />;
      break;
    case 'attachment':
    case 'image':
      control = (
        <ManagedFileField
          accept={field.accept}
          disabled={disabled}
          field={field}
          maxCount={field.maxCount}
          maxSizeMb={field.maxSizeMb}
          multiple={(field.maxCount ?? 1) > 1}
          mobile
          onUpload={renderers?.upload}
          recordId={recordId}
          resourceCode={resourceCode}
        />
      );
      break;
    case 'location':
      control = <LocationField disabled={disabled} mobile />;
      break;
    case 'signature':
      control = (
        <SignatureField
          disabled={disabled}
          mobile
          onUpload={renderers?.upload
            ? file => renderers.upload!(field, file, recordId)
            : undefined}
          resourceCode={resourceCode}
          signer={renderers?.signer}
        />
      );
      break;
    case 'address':
      control = <AddressField disabled={disabled} mobile />;
      break;
    case 'rich-text':
      control = <MobileRichTextField disabled={disabled} field={field} />;
      break;
    case 'json':
      control = <JsonField disabled={disabled} mobile />;
      break;
    case 'subtable':
      control = renderers?.renderSubtable?.({
        field,
        disabled,
        operation,
        resourceCode,
        recordId,
      }) || <Alert message="子表渲染器未配置" showIcon type="error" />;
      break;
    case 'readonly':
      control = <MobileTextField disabled={disabled} field={field} />;
      break;
  }
  const frame = (
    <Form.Item
      noStyle
      name={field.key}
      rules={rules}
      valuePropName={field.widget === 'switch' ? 'checked' : 'value'}
    >
      <MobileFieldFrame field={field} extra={renderers?.renderExtra?.({ field, disabled, operation, recordId })}>
        {control}
      </MobileFieldFrame>
    </Form.Item>
  );
  return field.widget === 'subtable' ? <MobileSubtableValidationContext.Provider value={subtableValidation.register}>{frame}</MobileSubtableValidationContext.Provider> : frame;
}

export function SurfaceFieldValue({
  field,
  value,
  resourceCode,
  workflowFileBinding,
  presentation = 'default',
  mobile = false,
  renderers,
}: SurfaceFieldValueContext & { renderers?: SurfaceFieldRenderers }) {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return <>{presentation === 'workflow-detail' ? '暂无' : '-'}</>;
  }
  const custom = renderers?.renderValue?.({ field, value, presentation });
  if (custom !== undefined) return <>{custom}</>;
  if (
    field.type.startsWith('user.') ||
    field.type.startsWith('department.') ||
    field.widget === 'directory-user' ||
    field.widget === 'directory-department'
  ) {
    return <WorkflowPlainReferenceValue value={value} />;
  }
  if (field.type.startsWith('resource-ref.')) {
    if (presentation === 'workflow-detail') {
      return <WorkflowPlainReferenceValue value={value} />;
    }
    return (
      <ResolvedValueText
        source="resource"
        value={value as ResourceReferenceValue | ResourceReferenceValue[]}
      />
    );
  }
  if (field.type === 'file' || field.type === 'image') {
    const values = (Array.isArray(value) ? value : [value]).filter(isFileRef);
    return values.length ? (
      <AttachmentFileList
        files={values}
        mobile={mobile}
        imageTiles={field.type === 'image'}
        resourceCode={resourceCode}
        workflowBinding={workflowFileBinding}
      />
    ) : <>-</>;
  }
  if (field.type === 'location') {
    return <LocationValueDisplay value={value as StableLocationValue} />;
  }
  if (field.type === 'address') {
    return <AddressValueDisplay value={value as StableAddressValue} />;
  }
  if (field.type === 'text.rich') {
    return (
      <RichTextValueDisplay
        resourceCode={resourceCode}
        value={String(value)}
        workflowBinding={workflowFileBinding}
      />
    );
  }
  if (field.type === 'json') {
    return <JsonValueDisplay value={value} />;
  }
  if (field.type === 'signature') {
    return (
      <SignatureValueDisplay
        resourceCode={resourceCode}
        value={value as StableSignatureValue}
        workflowBinding={workflowFileBinding}
      />
    );
  }
  if (field.type === 'subtable') {
    return <>{Array.isArray(value) ? `${value.length} 行子表` : '-'}</>;
  }
  if (field.type === 'cascade.single' || field.type === 'cascade.multiple') {
    return (
      <CascadeValueDisplay
        multiple={field.type === 'cascade.multiple'}
        value={value as CascadeStoredValue}
      />
    );
  }
  if (field.type === 'boolean') {
    if (presentation === 'workflow-detail') return <>{value ? '是' : '否'}</>;
    return <Tag color={value ? 'green' : 'default'}>{value ? '是' : '否'}</Tag>;
  }
  if (field.widget === 'money' || field.widget === 'percent') {
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim()
          ? Number(value)
          : Number.NaN;
    if (Number.isFinite(numeric)) {
      const scale =
        Number.isSafeInteger(field.scale) && Number(field.scale) >= 0
          ? Number(field.scale)
          : undefined;
      const formatted = new Intl.NumberFormat('zh-CN', {
        useGrouping: true,
        ...(scale === undefined
          ? { maximumFractionDigits: 20 }
          : { minimumFractionDigits: scale, maximumFractionDigits: scale }),
      }).format(numeric);
      return <>{field.widget === 'money' ? `¥${formatted}` : `${formatted}%`}</>;
    }
  }
  if (Array.isArray(value)) {
    return <>{value.map(item => optionLabel(field, item)).join('、') || '-'}</>;
  }
  if (['date', 'time', 'datetime', 'date-range', 'datetime-range'].includes(field.type)) {
    return <DateTimeValueDisplay field={field} value={value} />;
  }
  return <>{optionLabel(field, value)}</>;
}

function WorkflowPlainReferenceValue({ value }: { value: unknown }) {
  const values = Array.isArray(value) ? value : [value];
  const items = values.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const label = String(record.label || '').trim();
    if (!label) return [];
    const snapshot =
      record.snapshot && typeof record.snapshot === 'object'
        ? (record.snapshot as Record<string, unknown>)
        : {};
    const description = String(
      snapshot.location || snapshot.description || record.description || '',
    ).trim();
    return [{ label, description }];
  });
  if (!items.length) return <>暂无</>;
  return (
    <span className="oxa-workflow-plain-reference">
      {items.map((item, index) => (
        <span key={`${item.label}:${index}`}>
          <span>{item.label}</span>
          {item.description && <small>{item.description}</small>}
        </span>
      ))}
    </span>
  );
}

export function SurfaceAuditFieldValue({
  field,
  value,
  resourceCode,
}: SurfaceFieldValueContext) {
  if (isEventValueDigest(value)) {
    return (
      <Typography.Text type="secondary">
        大值摘要 · {value.valueType} · {formatManagedFileSize(value.bytes)} ·
        {' '}SHA-256 {value.sha256.slice(0, 12)}…
      </Typography.Text>
    );
  }
  // Audit values describe a historical change, not a retained file archive.
  // Old file references must never initiate a broader Native file read.
  if (field.type === 'file' || field.type === 'image') {
    const files = (Array.isArray(value) ? value : value ? [value] : []).filter(isFileRef);
    return <span>{files.length ? files.map(file =>
      [file.name || '未命名文件', Number.isFinite(file.size) ? formatManagedFileSize(file.size) : ''].filter(Boolean).join(' · ')
    ).join('、') : '-'}</span>;
  }
  if (field.type === 'signature') {
    const signature = value as StableSignatureValue | null;
    return <span>{signature?.file?.name || (value ? '电子签名' : '-')}</span>;
  }
  if (field.type === 'text.rich') {
    // Keep the changed text, without hydrating historical embedded images.
    const plainText = String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return <span>{plainText || (value ? '富文本内容' : '-')}</span>;
  }
  return (
    <SurfaceFieldValue
      field={field}
      resourceCode={resourceCode}
      value={value}
    />
  );
}

function optionLabel(field: SurfaceField, value: unknown) {
  if (value && typeof value === 'object' && 'label' in value) {
    return String((value as LabeledValue).label);
  }
  return field.options?.find(option => option.value === value)?.label || String(value);
}

function isFileRef(value: unknown): value is DataFileRef {
  return Boolean(value && typeof value === 'object' && 'id' in value);
}

function ManagedFileField({
  field,
  value,
  onChange,
  recordId,
  disabled,
  multiple,
  maxCount = 1,
  maxSizeMb = 50,
  accept,
  onUpload,
  resourceCode,
  mobile = false,
}: {
  field: SurfaceField;
  value?: DataFileRef[];
  onChange?: (value: DataFileRef[]) => void;
  recordId?: string;
  disabled?: boolean;
  multiple?: boolean;
  maxCount?: number;
  maxSizeMb?: number;
  accept?: string | string[];
  onUpload?: SurfaceFieldRenderers['upload'];
  resourceCode?: string;
  mobile?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const refs = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const refsRef = useRef(refs);
  useEffect(() => {
    refsRef.current = refs;
  }, [refs]);
  const assertSize = (file: File) => {
    if (file.size > maxSizeMb * 1024 * 1024) {
      throw new Error(`单个文件不能超过 ${maxSizeMb}MB`);
    }
  };
  if (!onUpload) {
    return <Alert type="info" showIcon title="该文件字段尚未配置上传能力" />;
  }
  if (mobile) {
    return <MobileManagedFileField value={refs} onChange={onChange} disabled={disabled}
      multiple={multiple} maxCount={maxCount} maxSizeMb={maxSizeMb} accept={accept}
      resourceCode={resourceCode} image={field.type === 'image'}
      upload={file => onUpload(field, file, recordId)} />;
  }
  const uploadProps = {
    accept: Array.isArray(accept) ? accept.join(',') : accept,
    disabled,
    maxCount,
    multiple,
    customRequest: async (options: {
      file: string | Blob;
      onError?: (error: Error) => void;
      onProgress?: (event: { percent: number }) => void;
      onSuccess?: (body: unknown) => void;
    }) => {
      setUploading(true);
      setUploadError('');
      try {
        assertSize(options.file as File);
        options.onProgress?.({ percent: 15 });
        const uploaded = await onUpload(field, options.file as File, recordId);
        options.onProgress?.({ percent: 100 });
        const next = multiple ? [...refsRef.current, uploaded].slice(0, maxCount) : [uploaded];
        refsRef.current = next;
        onChange?.(next);
        options.onSuccess?.(uploaded);
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        setUploadError(failure.message);
        options.onError?.(failure);
      } finally {
        setUploading(false);
      }
    },
    showUploadList: false,
  };
  return (
    <div className="oxa-file-field">
      <Upload.Dragger {...uploadProps} className="oxa-file-dropzone oxa-file-dropzone-compact" openFileDialogOnClick pastable>
        <span className="oxa-file-upload-button">{field.type === 'image' ? <PictureOutlined /> : <UploadOutlined />}{uploading ? '上传中…' : field.type === 'image' ? '图片上传' : '上传文件'}</span>
        <span className="oxa-file-upload-hint">拖拽或点击后粘贴{field.type === 'image' ? '图片' : '文件'}</span>
      </Upload.Dragger>
      <small className="oxa-file-limits">{multiple ? `最多 ${maxCount} 个，` : ''}单个不超过 {maxSizeMb}MB</small>
      {uploadError && (
        <div className="oxa-file-error">
          <span>{uploadError}</span>
          <Button icon={<ReloadOutlined />} onClick={() => setUploadError('')} size="small" type="text">关闭</Button>
        </div>
      )}
      {refs.length ? (
        <AttachmentFileList files={refs} resourceCode={resourceCode} onRemove={file => {
          const next = refs.filter(item => item.id !== file.id);
          refsRef.current = next;
          onChange?.(next);
        }} removable={!disabled} imageTiles={field.type === 'image'} />
      ) : (
        null
      )}
    </div>
  );
}
