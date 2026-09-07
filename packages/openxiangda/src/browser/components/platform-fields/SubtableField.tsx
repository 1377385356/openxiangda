import { Button as MobileButton } from '../../mobile';
import {
  DeleteOutlined,
  DownOutlined,
  ExpandOutlined,
  CompressOutlined,
  ImportOutlined,
  DownloadOutlined,
  PlusOutlined,
  ReloadOutlined,
  UpOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Empty,
  Form,
  Upload,
  App,
  Space,
  Spin,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type {
  DataFieldSurface,
  DataResourceSurface,
} from 'openxiangda-contracts/browser';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MobileSubtableValidationContext } from './MobileSubtableValidation';
import { createNativeResourceClient } from '../../platform-client';
import { useRuntime } from '../../runtime';
import { useResourceDefinitions } from '../../resource-definitions';
import {
  MobileSurfaceFieldControl,
  SurfaceFieldControl,
  SurfaceFieldValue,
  type SurfaceField,
} from '../resource/SurfaceFields';
import {
  fieldValueForData,
  fieldValueForForm,
} from './field-form-codec';
import type { SubtableDraftRow } from './subtable-value';
import { buildResourceImportTemplate, parseResourceImportFile } from '../resource/resource-import';
import { selectedSurfaceFields } from '../resource/resource-field-selection';

interface GeneratedDefinition {
  code: string;
  name: string;
  capabilities: {
    read: string;
    create: string;
    update: string;
    delete: string;
  };
  surface: DataResourceSurface;
}

export interface SubtableFieldProps {
  field: SurfaceField;
  disabled?: boolean;
  mobile?: boolean;
  operation: 'create' | 'update';
  parentRecordId?: string;
  value?: SubtableDraftRow[];
  onChange?: (value: SubtableDraftRow[]) => void;
  view?: 'form' | 'detail';
}

export function SubtableField({
  field,
  disabled,
  mobile,
  operation,
  parentRecordId,
  value,
  onChange,
  view = 'form',
}: SubtableFieldProps) {
  const definitions = useResourceDefinitions() as Record<
    string,
    GeneratedDefinition
  >;
  const config = field.subtable;
  const definition = config ? definitions[config.resourceCode] : undefined;
  const { hasCapability, hasReadCapability, identity } = useRuntime();
  const [internalRows, setInternalRows] = useState<SubtableDraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [importing, setImporting] = useState(false);
  const { message } = App.useApp();
  const loadedKey = useRef('');
  const rows = value ?? internalRows;
  const maxRows = config?.maxRows ?? 20;
  const visibleRows = rows.filter(row => row.state !== 'deleted');
  const childFields = useMemo(
    () => childSurfaceFields(definition?.surface, config?.foreignKey, config?.orderField, view),
    [config?.foreignKey, config?.orderField, definition?.surface, view]
  );
  const readableFields = childFields.filter(child =>
    fieldReadable(child, hasReadCapability, identity.isAppSuperAdmin)
  );
  const canCreate = Boolean(
    definition &&
      !disabled &&
      (identity.isAppSuperAdmin || hasCapability(definition.capabilities.create))
  );
  const canUpdate = Boolean(
    definition &&
      !disabled &&
      (identity.isAppSuperAdmin || hasCapability(definition.capabilities.update))
  );
  const canDelete = Boolean(
    definition &&
      !disabled &&
      (identity.isAppSuperAdmin || hasCapability(definition.capabilities.delete))
  );

  const emit = (next: SubtableDraftRow[]) => {
    setInternalRows(next);
    onChange?.(next);
  };

  useEffect(() => {
    if (!parentRecordId || !definition || !config) {
      if (operation === 'create' && value === undefined && internalRows.length === 0) {
        onChange?.([]);
      }
      return;
    }
    const key = `${definition.code}:${parentRecordId}`;
    if (value !== undefined || loadedKey.current === key) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    void loadChildRows(definition, config.foreignKey, config.orderField, parentRecordId, maxRows)
      .then(records => {
        if (!active) return;
        loadedKey.current = key;
        const next = records.map(record =>
          draftFromRecord(record, definition.surface, config.foreignKey, config.orderField)
        );
        emit(next);
      })
      .catch(error => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    config,
    definition,
    internalRows.length,
    maxRows,
    onChange,
    operation,
    parentRecordId,
    value,
    loadAttempt,
  ]);

  if (!config || !definition) {
    return (
      <Alert
        message="子表配置不可用"
        showIcon
        type="error"
      />
    );
  }

  const removeRow = (target: SubtableDraftRow) => {
    emit(
      target.state === 'created'
        ? rows.filter(row => row.key !== target.key)
        : rows.map(row =>
            row.key === target.key ? { ...row, state: 'deleted' } : row
          )
    );
  };
  const moveRow = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= visibleRows.length) return;
    const reordered = [...visibleRows];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    emit([...reordered, ...rows.filter(row => row.state === 'deleted')]);
  };
  if (mobile) return <div className="oxa-mobile-inline-subtable oxa-mobile-scope">
    {loadError && <div role="alert">{loadError}<MobileButton onClick={() => { loadedKey.current = ''; setLoadAttempt(attempt => attempt + 1); }}>重试</MobileButton></div>}
    {loading ? <span role="status">加载中…</span> : visibleRows.map((row, index) => {
      const rowOperation = row.state === 'persisted' ? 'update' : 'create';
      const writable = row.state === 'persisted' ? canUpdate : canCreate;
      const fields = childFields.filter(child => fieldReadable(child, hasReadCapability, identity.isAppSuperAdmin) || (writable && fieldWritable(child, rowOperation, hasCapability, identity.isAppSuperAdmin)));
      return <MobileSubtableRow key={row.key} row={row} index={index} fields={fields}
        resourceCode={definition.code} operation={rowOperation}
        canWrite={child => writable && fieldWritable(child, rowOperation, hasCapability, identity.isAppSuperAdmin)}
        canDelete={row.state === 'persisted' ? canDelete : canCreate} onRemove={() => removeRow(row)}
        onChange={data => emit(rows.map(current => current.key === row.key ? { ...current, data, snapshot: { ...current.snapshot, ...Object.fromEntries(Object.entries(data).map(([key, item]) => [key, fieldValueForData(definition.surface.fields[key], item)])) } } : current))}
        upload={(current, file, recordId) => createNativeResourceClient(definition.code, definition.surface).upload(current.key, file, recordId)} />;
    })}
    {!disabled && <MobileButton block fill="none" color="primary" disabled={!canCreate || visibleRows.length >= maxRows}
      onClick={() => emit([...rows, { key: crypto.randomUUID(), state: 'created', data: {} }])}><PlusOutlined /> 新增一项</MobileButton>}
  </div>;

  const fields = childFields.filter(child => fieldReadable(child, hasReadCapability, identity.isAppSuperAdmin) ||
    (canCreate && fieldWritable(child, 'create', hasCapability, identity.isAppSuperAdmin)) ||
    (canUpdate && fieldWritable(child, 'update', hasCapability, identity.isAppSuperAdmin)));
  const writableCodes = fields.filter(child => fieldWritable(child, 'create', hasCapability, identity.isAppSuperAdmin)).map(child => child.key);
  const appendRows = (data: Record<string, unknown>[]) => emit([...rows, ...data.map(item => ({
    key: crypto.randomUUID(), state: 'created' as const,
    data: Object.fromEntries(Object.entries(item).map(([key, value]) => [key, fieldValueForForm(definition.surface.fields[key], value)])),
  }))]);
  const downloadTemplate = async () => {
    const template = await buildResourceImportTemplate(field.label, definition.surface, writableCodes);
    const url = URL.createObjectURL(new Blob([template.content]));
    const link = document.createElement('a'); link.href = url; link.download = template.fileName; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <div className={`oxa-subtable-field oxa-subtable-inline ${fullScreen ? 'is-fullscreen' : ''}`}>
    {loadError && <Alert type="error" title={loadError} action={<Button onClick={() => { loadedKey.current = ''; setLoadAttempt(value => value + 1); }}>重试</Button>} />}
    <div className="oxa-subtable-scroll"><table aria-label={field.label}>
      <thead><tr><th className="oxa-subtable-number"><Tooltip title={fullScreen ? '退出全屏' : '全屏'}><Button type="text" aria-label={fullScreen ? '退出子表全屏' : '子表全屏'} icon={fullScreen ? <CompressOutlined /> : <ExpandOutlined />} onClick={() => setFullScreen(!fullScreen)} /></Tooltip></th>
        {fields.map(child => <th key={child.key}>{child.label}</th>)}{!disabled && <th>操作</th>}</tr></thead>
      <tbody>{loading ? <tr><td colSpan={fields.length + 2}><Spin /></td></tr> : visibleRows.map((row, index) => {
        const rowOperation = row.state === 'persisted' ? 'update' : 'create';
        const writable = row.state === 'persisted' ? canUpdate : canCreate;
        return <DesktopSubtableRow key={row.key} row={row} index={index} fields={fields} operation={rowOperation}
          resourceCode={definition.code} disabled={disabled}
          canRead={child => fieldReadable(child, hasReadCapability, identity.isAppSuperAdmin)}
          canWrite={child => writable && fieldWritable(child, rowOperation, hasCapability, identity.isAppSuperAdmin)}
          onChange={data => emit(rows.map(current => current.key === row.key ? { ...current, data } : current))}
          upload={(current, file, recordId) => createNativeResourceClient(definition.code, definition.surface).upload(current.key, file, recordId)}
          actions={<Space size={0}>
            <Button type="text" aria-label={`上移第${index + 1}项`} disabled={index === 0 || !writable} icon={<UpOutlined />} onClick={() => moveRow(index, -1)} />
            <Button type="text" aria-label={`下移第${index + 1}项`} disabled={index === visibleRows.length - 1 || !writable} icon={<DownOutlined />} onClick={() => moveRow(index, 1)} />
            <Button type="link" danger disabled={row.state === 'persisted' ? !canDelete : !canCreate} onClick={() => removeRow(row)}>删除</Button>
          </Space>} />;
      })}{!loading && !visibleRows.length && <tr><td colSpan={fields.length + 2}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无明细" /></td></tr>}</tbody>
    </table></div>
    {!disabled && <div className="oxa-subtable-toolbar"><Space wrap>
      <Button icon={<PlusOutlined />} disabled={!canCreate || visibleRows.length >= maxRows} onClick={() => appendRows([{}])}>新增一项</Button>
      <Upload accept=".csv,.xls,.xlsx" showUploadList={false} disabled={!canCreate || importing || visibleRows.length >= maxRows} beforeUpload={async file => {
        setImporting(true);
        try {
          const parsed = await parseResourceImportFile(file, definition.code, definition.surface, writableCodes);
          if (parsed.errors.length) throw new Error(parsed.errors.slice(0, 3).join('；'));
          if (visibleRows.length + parsed.rows.length > maxRows) throw new Error(`子表单最多 ${maxRows} 项`);
          appendRows(parsed.rows.map(row => row.data));
        } catch (error) { message.error(error instanceof Error ? error.message : '导入失败'); }
        finally { setImporting(false); }
        return false;
      }}><Button icon={<ImportOutlined />} loading={importing} disabled={!canCreate || visibleRows.length >= maxRows}>批量导入</Button></Upload>
      <Button type="link" icon={<DownloadOutlined />} disabled={!canCreate} onClick={() => void downloadTemplate().catch(error => message.error(String(error)))}>下载模板</Button>
    </Space><Typography.Text type="secondary">{visibleRows.length} / {maxRows}</Typography.Text></div>}
  </div>;
}

function DesktopSubtableRow({ row, index, fields, operation, resourceCode, disabled, canRead, canWrite, onChange, upload, actions }: {
  row: SubtableDraftRow; index: number; fields: SurfaceField[]; operation: 'create' | 'update'; resourceCode: string; disabled?: boolean;
  canRead: (field: SurfaceField) => boolean; canWrite: (field: SurfaceField) => boolean;
  onChange: (data: Record<string, unknown>) => void; upload: (field: SurfaceField, file: File, recordId?: string) => Promise<import('openxiangda-contracts/browser').DataFileRef>;
  actions: import('react').ReactNode;
}) {
  const [form] = Form.useForm();
  const registerValidation = useContext(MobileSubtableValidationContext);
  useEffect(() => registerValidation?.(row.key, async () => {
    try { await form.validateFields(); }
    catch { throw new Error(`请完善子表单第 ${index + 1} 项`); }
  }), [form, index, registerValidation, row.key]);
  useEffect(() => { form.setFieldsValue(row.data); }, [form, row.data]);
  return <Form component={false} name={`subtable-${row.key}`} form={form} initialValues={row.data} onValuesChange={(_changed, all) => onChange(all)}>
    <tr><td className="oxa-subtable-number">{index + 1}</td>{fields.map(field => <td key={field.key}>
      {canWrite(field) ? <SurfaceFieldControl field={field} disabled={false} operation={operation} recordId={row.id} resourceCode={resourceCode} renderers={{ upload }} />
        : canRead(field) ? <SurfaceFieldValue field={field} resourceCode={resourceCode} value={row.snapshot?.[field.key] ?? row.data[field.key]} /> : '—'}
    </td>)}{!disabled && <td>{actions}</td>}</tr>
  </Form>;
}

export function SubtableValueDisplay({
  field,
  parentRecordId,
  mobile,
}: {
  field: SurfaceField;
  parentRecordId: string;
  mobile?: boolean;
}) {
  return (
    <SubtableField
      disabled
      field={field}
      mobile={mobile}
      operation="update"
      parentRecordId={parentRecordId}
      view="detail"
    />
  );
}

function childSurfaceFields(
  surface: DataResourceSurface | undefined,
  foreignKey?: string,
  orderField?: string,
  view: 'form' | 'detail' = 'form'
) {
  return (surface ? selectedSurfaceFields(surface, view) : [])
    .filter(field =>
      field.key !== foreignKey &&
      field.key !== orderField &&
      !field.system &&
      field.type !== 'subtable'
    );
}

function fieldReadable(
  field: SurfaceField,
  hasCapability: (code: string) => boolean,
  isSuperAdmin: boolean
) {
  return isSuperAdmin || (
    field.readCapabilities.length > 0 &&
    field.readCapabilities.every(hasCapability)
  );
}

function fieldWritable(
  field: SurfaceField,
  operation: 'create' | 'update',
  hasCapability: (code: string) => boolean,
  isSuperAdmin: boolean
) {
  if (field.widget === 'readonly' || field.type === 'subtable') return false;
  if (isSuperAdmin) return true;
  const capabilities = operation === 'create'
    ? field.createCapabilities
    : field.updateCapabilities;
  return capabilities.length > 0 && capabilities.every(hasCapability);
}

async function loadChildRows(
  definition: GeneratedDefinition,
  foreignKey: string,
  orderField: string,
  parentRecordId: string,
  maxRows: number
) {
  const client = createNativeResourceClient(definition.code, definition.surface);
  const records: Record<string, unknown>[] = [];
  let page = 1;
  let total = 0;
  do {
    const pageSize = Math.min(200, maxRows - records.length);
    const result = await client.list({
      page,
      pageSize,
      filters: { [foreignKey]: parentRecordId },
      sort: { field: orderField, order: 'asc' },
    });
    records.push(...result.rows);
    total = result.total;
    page += 1;
  } while (records.length < total && records.length < maxRows);
  if (total > maxRows) throw new Error('OPENXIANGDA_SUBTABLE_STORED_ROWS_EXCEEDED');
  return records;
}

function draftFromRecord(
  record: Record<string, unknown>,
  surface: DataResourceSurface,
  foreignKey: string,
  orderField: string
): SubtableDraftRow {
  const data = Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key !== foreignKey && key !== orderField && surface.fields[key])
      .map(([key, item]) => [key, fieldValueForForm(surface.fields[key], item)])
  );
  const originalData = Object.fromEntries(
    Object.entries(record).filter(
      ([key]) => key !== foreignKey && key !== orderField && surface.fields[key]
    )
  );
  return {
    key: String(record.id),
    state: 'persisted',
    id: String(record.id),
    revision: Number(record.revision),
    originalOrder: Number(record[orderField]),
    data,
    originalData,
    snapshot: record,
  };
}

function MobileSubtableRow({ row, index, fields, operation, resourceCode, canWrite, canDelete, onRemove, onChange, upload }: {
  row: SubtableDraftRow; index: number; fields: SurfaceField[]; operation: 'create' | 'update'; resourceCode: string;
  canWrite: (field: SurfaceField) => boolean; canDelete: boolean; onRemove: () => void;
  onChange: (data: Record<string, unknown>) => void; upload: (field: SurfaceField, file: File, recordId?: string) => Promise<import('openxiangda-contracts/browser').DataFileRef>;
}) {
  const [form] = Form.useForm();
  const [expanded, setExpanded] = useState(true);
  const registerValidation = useContext(MobileSubtableValidationContext);
  useEffect(() => registerValidation?.(row.key, async () => {
    try { await form.validateFields(); }
    catch { setExpanded(true); throw new Error(`请完善子表单第 ${index + 1} 项`); }
  }), [form, index, registerValidation, row.key]);
  useEffect(() => { form.setFieldsValue(row.data); }, [form, row.data]);
  return <div className="oxa-mobile-subtable-card">
    <header><MobileButton fill="none" aria-label={`${expanded ? '折叠' : '展开'}第${index + 1}项`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '▾' : '▸'} {index + 1}</MobileButton>
      {canDelete && <MobileButton fill="none" onClick={onRemove}>删除</MobileButton>}
    </header>
    <div hidden={!expanded} style={!expanded ? { display: 'none' } : undefined}>
      <Form component={false} name={`subtable-${row.key}`} form={form} initialValues={row.data} onValuesChange={(_changed, all) => onChange(all)}>
        {fields.map(field => <MobileSurfaceFieldControl key={field.key} field={field} disabled={!canWrite(field)} operation={operation} recordId={row.id} resourceCode={resourceCode} renderers={{ upload }} />)}
      </Form>
    </div>
  </div>;
}
