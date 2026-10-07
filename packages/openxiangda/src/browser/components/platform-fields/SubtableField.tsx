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
  Pagination,
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
  WorkflowTaskSubtablePage,
  WorkflowTaskSourceBinding,
} from 'openxiangda-contracts/browser';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MobileSubtableValidationContext, SubtableEditActivityContext } from './MobileSubtableValidation';
import { moveSubtableRow, subtablePage, SUBTABLE_PAGE_SIZE, SubtableRowValidationError, validateSubtableRows } from './subtable-pagination';
import { createNativeResourceClient, type WorkflowFileBinding } from '../../platform-client';
import { workflowTaskPageFieldState } from 'openxiangda-contracts/browser';
import { useRuntime } from '../../runtime';
import { useResourceDefinitions } from '../../resource-definitions';
import {
  MobileSurfaceFieldControl,
  SurfaceFieldControl,
  SurfaceFieldValue,
  type SurfaceField,
  type SurfaceFieldRenderers,
} from '../resource/SurfaceFields';
import {
  fieldValueForData,
  fieldValueForForm,
} from './field-form-codec';
import type { SubtableDraftRow } from './subtable-value';
import { buildResourceImportTemplate, parseResourceImportFile } from '../resource/resource-import';
import { selectedSurfaceFields } from '../resource/resource-field-selection';
import { resourceReferenceBindingPatch } from './reference-binding-change';

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
  /** Absolute visible-row position supplied by the task's complete validation. */
  revealRow?: { index: number };
  /** Sealed named create intent: new local rows only, with operation uploads. */
  launch?: {
    fieldCodes: readonly string[];
    /** Presentation only: derived values remain visible but are not user input. */
    readonlyFieldCodes?: readonly string[];
    upload: NonNullable<SurfaceFieldRenderers['upload']>;
    reference?: SurfaceFieldRenderers['referenceLaunch'];
  };
  /** Already qualified task projection. Never use ordinary child CRUD here. */
  task?: { surface: DataResourceSurface; page: WorkflowTaskSubtablePage; binding?: WorkflowFileBinding;
    reference?: WorkflowTaskSourceBinding;
    rows?: Array<Record<string, unknown>>; uploadEnabled?: boolean;
    upload?: (rowKey: string, ...args: Parameters<NonNullable<SurfaceFieldRenderers['upload']>>) => Promise<import('openxiangda-contracts/browser').DataFileRef>;
    signer?: SurfaceFieldRenderers['signer']; };
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
  revealRow,
  task,
  launch,
}: SubtableFieldProps) {
  const definitions = useResourceDefinitions() as Record<
    string,
    GeneratedDefinition
  >;
  const config = field.subtable;
  const definition = config ? task ? { code: config.resourceCode, name: field.label, capabilities: { read: '', create: '', update: '', delete: '' }, surface: task.surface } : definitions[config.resourceCode] : undefined;
  const { hasCapability, hasReadCapability, identity } = useRuntime();
  const [internalRows, setInternalRows] = useState<SubtableDraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [requestedPage, setRequestedPage] = useState(1);
  const [uploads, setUploads] = useState(0);
  const [pendingEdits, setPendingEdits] = useState<Set<string>>(() => new Set());
  const reportPending = useCallback((key: string, pending: boolean) => setPendingEdits(current => {
    if (current.has(key) === pending) return current;
    const next = new Set(current);
    if (pending) next.add(key); else next.delete(key);
    return next;
  }), []);
  const registerValidation = useContext(MobileSubtableValidationContext);
  const { message } = App.useApp();
  const loadedKey = useRef('');
  const rows = value ?? internalRows;
  const maxRows = config?.maxRows ?? 20;
  const minRows = config?.minRows ?? 0;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const page = subtablePage(rows, requestedPage);
  const visibleRows = page.visible;
  const navigationBlocked = Boolean(((task || launch) && disabled) || importing || uploads || pendingEdits.size);
  useEffect(() => { setRequestedPage(current => Math.min(current, page.pages)); }, [page.pages]);
  useEffect(() => { if (revealRow) setRequestedPage(Math.floor(revealRow.index / SUBTABLE_PAGE_SIZE) + 1); }, [revealRow]);
  const childFields = useMemo(
    () => childSurfaceFields(definition?.surface, config?.foreignKey, config?.orderField, view),
    [config?.foreignKey, config?.orderField, definition?.surface, view]
  );
  const readableFields = childFields.filter(child =>
    task || fieldReadable(child, hasReadCapability, identity.isAppSuperAdmin)
  );
  const canCreate = Boolean(
    definition &&
      !disabled &&
      (launch ? operation === 'create' && !task : task ? task.page.create === true : identity.isAppSuperAdmin || hasCapability(definition.capabilities.create))
  );
  const canUpdate = Boolean(
    definition &&
      !disabled &&
      (launch ? false : task ? true : identity.isAppSuperAdmin || hasCapability(definition.capabilities.update))
  );
  const canDelete = Boolean(
    definition &&
      !disabled &&
      (launch ? false : task ? task.page.delete === true : identity.isAppSuperAdmin || hasCapability(definition.capabilities.delete))
  );

  const emit = (next: SubtableDraftRow[]) => {
    rowsRef.current = next;
    setInternalRows(next);
    onChange?.(next);
  };
  const stateCache = new Map<string, ReturnType<typeof workflowTaskPageFieldState>>();
  const taskState = (child: SurfaceField, row: SubtableDraftRow) => {
    if (!task) return undefined;
    if (!stateCache.has(row.key)) stateCache.set(row.key, workflowTaskPageFieldState({ title: field.label, fields: task.page.fields }, {
      ...row.snapshot, ...Object.fromEntries(Object.entries(row.data).map(([code, value]) => [code, fieldValueForData(task.surface.fields[code], value)])),
    }));
    return stateCache.get(row.key)!.find(state => state.code === child.key);
  };
  const canReadField = (child: SurfaceField, row?: SubtableDraftRow) => launch
    ? launch.fieldCodes.includes(child.key) && (!row || row.state === 'created')
    : task ? !row || taskState(child, row)?.visible === true : fieldReadable(child, hasReadCapability, identity.isAppSuperAdmin);
  const canWriteField = (child: SurfaceField, operation: 'create' | 'update', row?: SubtableDraftRow) => launch
    ? operation === 'create' && (!row || row.state === 'created') && launch.fieldCodes.includes(child.key) && !launch.readonlyFieldCodes?.includes(child.key) && child.widget !== 'readonly' && !child.hidden && !child.system
    : task
    ? (!row ? task.page.fields.some(item => item.code === child.key && !item.readonly) : Boolean(taskState(child, row)?.visible && !taskState(child, row)?.readonly))
    : fieldWritable(child, operation, hasCapability, identity.isAppSuperAdmin);
  const uploadFor = (row: SubtableDraftRow): NonNullable<SurfaceFieldRenderers['upload']> => async (current, file, recordId, onRecovered) => {
    setUploads(count => count + 1);
    try {
      return await (launch
        ? launch.upload(current, file, undefined, onRecovered)
        : task
        ? task.upload ? task.upload(row.key, current, file, recordId, onRecovered) : Promise.reject(new Error('当前任务未提供子行上传能力'))
        : createNativeResourceClient(definition!.code, definition!.surface).upload(current.key, file, recordId));
    } finally { setUploads(count => count - 1); }
  };
  const rowBinding = (row: SubtableDraftRow) => task?.binding ? { ...task.binding, resourceCode: config!.resourceCode, recordId: row.key } : undefined;
  const rowReferences = (row: SubtableDraftRow): Pick<SurfaceFieldRenderers, 'referenceLaunch' | 'referenceTask'> => ({
    ...(launch?.reference ? { referenceLaunch: launch.reference } : {}),
    ...(task?.reference ? { referenceTask: { ...task.reference, subtable: { fieldCode: field.key,
      row: row.state === 'persisted'
        ? { kind: 'persisted', id: row.id!, expectedRevision: row.revision! }
        : { kind: 'new', key: row.key },
    } } } : {}),
  });
  const uploadBlocked = (child: SurfaceField, row: SubtableDraftRow) => Boolean(task && ['file', 'image', 'signature', 'text.rich'].includes(child.type) &&
    (task.uploadEnabled === false || !workflowTaskPageFieldState({ title: field.label, fields: task.page.fields }, task.rows?.find(value => String(value.id) === row.key) || {})
      .some(state => state.code === child.key && state.visible && !state.readonly)));
  const rowFields = (row: SubtableDraftRow) => childFields.map(child => task ? { ...child, requiredHint: false } : child);
  const requiredHint = (child: SurfaceField, row: SubtableDraftRow) => taskState(child, row)?.required
    ? <Typography.Text type="secondary">完成任务前必填</Typography.Text> : undefined;

  useEffect(() => registerValidation?.(`all:${field.key}`, async () => {
    if (disabled) return;
    if (uploads || pendingEdits.size) throw new Error('请先完成当前页的编辑或处理待上传文件');
    if (!task && visibleRows.length < minRows) throw new Error(`${field.label}至少保留${minRows}项`);
    try {
      await validateSubtableRows(rows, row => {
        const operation = row.state === 'persisted' ? 'update' : 'create';
        const writable = task ? row.state === 'persisted' || task.page.create === true : row.state === 'persisted' ? canUpdate : canCreate;
        return rowFields(row).filter(child => writable && canWriteField(child, operation, row) && !uploadBlocked(child, row));
      }, mobile);
    } catch (error) {
      if (error instanceof SubtableRowValidationError) setRequestedPage(Math.floor(error.rowIndex / SUBTABLE_PAGE_SIZE) + 1);
      throw error;
    }
  }));

  useEffect(() => {
    if (task || launch) return;
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
    if (!task && subtablePage(rowsRef.current, 1).visible.length <= minRows) return;
    emit(
      target.state === 'created'
        ? rows.filter(row => row.key !== target.key)
        : rows.map(row =>
            row.key === target.key ? { ...row, state: 'deleted' } : row
          )
    );
  };
  const moveRow = (index: number, direction: -1 | 1) => {
    if (navigationBlocked || launch || (task && !task.page.reorder)) return;
    emit(moveSubtableRow(rowsRef.current, index, direction));
    setRequestedPage(Math.floor((index + direction) / SUBTABLE_PAGE_SIZE) + 1);
  };
  const changeRow = (row: SubtableDraftRow, data: Record<string, unknown>) => emit(rowsRef.current.map(current => current.key === row.key
    ? { ...current, data: { ...current.data, ...data }, snapshot: { ...current.snapshot, ...Object.fromEntries(Object.entries(data).map(([key, item]) => [key, fieldValueForData(definition.surface.fields[key], item)])) } } : current));
  const pagination = <div className="oxa-subtable-pagination" aria-label={`${field.label}分页`}>
    <span role="status">{visibleRows.length ? `${page.start + 1}–${Math.min(page.start + SUBTABLE_PAGE_SIZE, visibleRows.length)} / ${visibleRows.length} 项` : '0 项'}</span>
    {minRows > 0 && <span>{task ? '完成任务前' : ''}至少保留{minRows}项</span>}
    {page.pages > 1 && (mobile ? <Space>
      <MobileButton fill="outline" aria-label={`${field.label}上一页`} disabled={navigationBlocked || page.page === 1} onClick={() => setRequestedPage(page.page - 1)}>上一页</MobileButton>
      <span>{page.page} / {page.pages}</span>
      <MobileButton fill="outline" aria-label={`${field.label}下一页`} disabled={navigationBlocked || page.page === page.pages} onClick={() => setRequestedPage(page.page + 1)}>下一页</MobileButton>
    </Space> : <Pagination size="small" current={page.page} total={visibleRows.length} pageSize={SUBTABLE_PAGE_SIZE} showSizeChanger={false} disabled={navigationBlocked} onChange={setRequestedPage} />)}
    {(uploads > 0 || pendingEdits.size > 0) && <span>请先完成当前页的编辑或处理待上传文件</span>}
  </div>;
  if (mobile) return <SubtableEditActivityContext.Provider value={reportPending}><div className="oxa-mobile-inline-subtable oxa-mobile-scope">
    {loadError && <div role="alert">{loadError}<MobileButton onClick={() => { loadedKey.current = ''; setLoadAttempt(attempt => attempt + 1); }}>重试</MobileButton></div>}
    {pagination}
    {loading ? <span role="status">加载中…</span> : page.rows.map((row, offset) => {
      const index = page.start + offset;
      const rowOperation = row.state === 'persisted' ? 'update' : 'create';
      const writable = task ? row.state === 'persisted' || task.page.create === true : row.state === 'persisted' ? canUpdate : canCreate;
      const fields = rowFields(row).filter(child => canReadField(child, row) || (writable && canWriteField(child, rowOperation, row)));
      return <MobileSubtableRow key={row.key} row={row} index={index} fields={fields} disabled={disabled}
        resourceCode={definition.code} operation={rowOperation}
        canWrite={child => writable && canWriteField(child, rowOperation, row)}
        canDelete={!navigationBlocked && (Boolean(task) || visibleRows.length > minRows) && (row.state === 'persisted' ? canDelete : canCreate)} onRemove={() => removeRow(row)}
        onChange={data => changeRow(row, data)}
        references={rowReferences(row)} workflowFileBinding={rowBinding(row)} upload={uploadFor(row)} signer={task?.signer} uploadBlocked={child => uploadBlocked(child, row)} taskMode={Boolean(task)} hint={child => requiredHint(child, row)}
        actions={task?.page.reorder && <Space><MobileButton fill="none" disabled={navigationBlocked || index === 0} aria-label={`上移第${index + 1}项`} onClick={() => moveRow(index, -1)}>上移</MobileButton><MobileButton fill="none" disabled={navigationBlocked || index === visibleRows.length - 1} aria-label={`下移第${index + 1}项`} onClick={() => moveRow(index, 1)}>下移</MobileButton></Space>} />;
    })}
    {!disabled && <MobileButton block fill="none" color="primary" disabled={navigationBlocked || !canCreate || visibleRows.length >= maxRows}
      onClick={() => { emit([...rows, { key: crypto.randomUUID(), state: 'created', data: {} }]); setRequestedPage(Math.floor(visibleRows.length / SUBTABLE_PAGE_SIZE) + 1); }}><PlusOutlined /> 新增一项</MobileButton>}
  </div></SubtableEditActivityContext.Provider>;

  const fields = childFields.filter(child => canReadField(child) || (canCreate && canWriteField(child, 'create')) || (canUpdate && canWriteField(child, 'update')));
  const writableCodes = fields.filter(child => canWriteField(child, 'create')).map(child => child.key);
  const appendRows = (data: Record<string, unknown>[]) => { const start = subtablePage(rowsRef.current, 1).visible.length; emit([...rowsRef.current, ...data.map(item => ({
    key: crypto.randomUUID(), state: 'created' as const,
    data: Object.fromEntries(Object.entries(item).map(([key, value]) => [key, fieldValueForForm(definition.surface.fields[key], value)])),
  }))]); setRequestedPage(Math.floor(start / SUBTABLE_PAGE_SIZE) + 1); };
  const downloadTemplate = async () => {
    const template = await buildResourceImportTemplate(field.label, definition.surface, writableCodes);
    const url = URL.createObjectURL(new Blob([template.content]));
    const link = document.createElement('a'); link.href = url; link.download = template.fileName; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <SubtableEditActivityContext.Provider value={reportPending}><div className={`oxa-subtable-field oxa-subtable-inline ${fullScreen ? 'is-fullscreen' : ''}`}>
    {loadError && <Alert type="error" title={loadError} action={<Button onClick={() => { loadedKey.current = ''; setLoadAttempt(value => value + 1); }}>重试</Button>} />}
    {pagination}
    <div className="oxa-subtable-scroll"><table aria-label={field.label}>
      <thead><tr><th className="oxa-subtable-number"><Tooltip title={fullScreen ? '退出全屏' : '全屏'}><Button type="text" aria-label={fullScreen ? '退出子表全屏' : '子表全屏'} icon={fullScreen ? <CompressOutlined /> : <ExpandOutlined />} onClick={() => setFullScreen(!fullScreen)} /></Tooltip></th>
        {fields.map(child => <th key={child.key}>{child.label}</th>)}{!disabled && <th>操作</th>}</tr></thead>
      <tbody>{loading ? <tr><td colSpan={fields.length + 2}><Spin /></td></tr> : page.rows.map((row, offset) => {
        const index = page.start + offset;
        const rowOperation = row.state === 'persisted' ? 'update' : 'create';
        const writable = task ? row.state === 'persisted' || task.page.create === true : row.state === 'persisted' ? canUpdate : canCreate;
        return <DesktopSubtableRow key={row.key} row={row} index={index} fields={fields.map(child => task ? { ...child, requiredHint: false } : child)} operation={rowOperation}
          resourceCode={definition.code} disabled={disabled} taskMode={Boolean(task)}
          canRead={child => canReadField(child, row)}
          canWrite={child => writable && canWriteField(child, rowOperation, row)}
          onChange={data => changeRow(row, data)}
          references={rowReferences(row)} workflowFileBinding={rowBinding(row)} upload={uploadFor(row)} signer={task?.signer} uploadBlocked={child => uploadBlocked(child, row)} hint={child => requiredHint(child, row)}
          actions={<Space size={0}>
            {!launch && <Button type="text" aria-label={`上移第${index + 1}项`} disabled={navigationBlocked || index === 0 || !writable || Boolean(task && !task.page.reorder)} icon={<UpOutlined />} onClick={() => moveRow(index, -1)} />}
            {!launch && <Button type="text" aria-label={`下移第${index + 1}项`} disabled={navigationBlocked || index === visibleRows.length - 1 || !writable || Boolean(task && !task.page.reorder)} icon={<DownOutlined />} onClick={() => moveRow(index, 1)} />}
            <Button type="link" danger disabled={navigationBlocked || (!task && visibleRows.length <= minRows) || (row.state === 'persisted' ? !canDelete : !canCreate)} onClick={() => removeRow(row)}>删除</Button>
          </Space>} />;
      })}{!loading && !visibleRows.length && <tr><td colSpan={fields.length + 2}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无明细" /></td></tr>}</tbody>
    </table></div>
    {!disabled && <div className="oxa-subtable-toolbar"><Space wrap>
      <Button icon={<PlusOutlined />} disabled={navigationBlocked || !canCreate || visibleRows.length >= maxRows} onClick={() => appendRows([{}])}>新增一项</Button>
      <Upload accept=".csv,.xls,.xlsx" showUploadList={false} disabled={navigationBlocked || !canCreate || visibleRows.length >= maxRows} beforeUpload={async file => {
        setImporting(true);
        try {
          const parsed = await parseResourceImportFile(file, definition.code, definition.surface, writableCodes);
          if (parsed.errors.length) throw new Error(parsed.errors.slice(0, 3).join('；'));
          if (visibleRows.length + parsed.rows.length > maxRows) throw new Error(`子表单最多 ${maxRows} 项`);
          appendRows(parsed.rows.map(row => row.data));
        } catch (error) { message.error(error instanceof Error ? error.message : '导入失败'); }
        finally { setImporting(false); }
        return false;
      }}><Button icon={<ImportOutlined />} loading={importing} disabled={navigationBlocked || !canCreate || visibleRows.length >= maxRows}>批量导入</Button></Upload>
      <Button type="link" icon={<DownloadOutlined />} disabled={!canCreate} onClick={() => void downloadTemplate().catch(error => message.error(String(error)))}>下载模板</Button>
    </Space><Typography.Text type="secondary">{visibleRows.length} / {maxRows}</Typography.Text></div>}
  </div></SubtableEditActivityContext.Provider>;
}

function rowDisplayValue(row: SubtableDraftRow, field: SurfaceField, taskMode?: boolean) {
  if (taskMode && Object.prototype.hasOwnProperty.call(row.data, field.key)) {
    return fieldValueForData(field, row.data[field.key]);
  }
  return row.snapshot?.[field.key] ?? row.data[field.key];
}

function DesktopSubtableRow({ row, index, fields, operation, resourceCode, disabled, canRead, canWrite, onChange, upload, actions, workflowFileBinding, taskMode, hint, signer, references, uploadBlocked }: {
  row: SubtableDraftRow; index: number; fields: SurfaceField[]; operation: 'create' | 'update'; resourceCode: string; disabled?: boolean;
  canRead: (field: SurfaceField) => boolean; canWrite: (field: SurfaceField) => boolean;
  onChange: (data: Record<string, unknown>) => void; upload: NonNullable<SurfaceFieldRenderers['upload']>;
  references?: Pick<SurfaceFieldRenderers, 'referenceLaunch' | 'referenceTask'>;
  signer?: SurfaceFieldRenderers['signer']; uploadBlocked?: (field: SurfaceField) => boolean;
  actions: import('react').ReactNode;
  workflowFileBinding?: WorkflowFileBinding;
  taskMode?: boolean;
  hint?: (field: SurfaceField) => import('react').ReactNode;
}) {
  const [form] = Form.useForm();
  const registerValidation = useContext(MobileSubtableValidationContext);
  useEffect(() => registerValidation?.(row.key, async () => {
    try { await form.validateFields(); }
    catch { throw new Error(`请完善子表单第 ${index + 1} 项`); }
  }), [form, index, registerValidation, row.key]);
  // Each parent-controlled value replaces the complete field, including removed snapshot properties.
  useEffect(() => { form.setFields(Object.entries(row.data).map(([name, value]) => ({ name, value }))); }, [form, row.data]);
  const changeValues = (changed: Record<string, unknown>, all: Record<string, unknown>) => {
    const patch = resourceReferenceBindingPatch(fields.filter(canWrite), changed, all, row.data);
    form.setFields(Object.entries(patch).map(([name, value]) => ({ name, value, touched: true, errors: [] })));
    onChange({ ...all, ...patch });
  };
  return <Form component={false} layout="vertical" name={`subtable-${row.key}`} form={form} initialValues={row.data} onValuesChange={changeValues}>
    <tr><td className="oxa-subtable-number">{index + 1}</td>{fields.map(field => <td key={field.key}>
      {canWrite(field) ? <><SurfaceFieldControl field={field} disabled={Boolean(disabled || uploadBlocked?.(field))} operation={operation} recordId={row.id} expectedRevision={row.revision} resourceCode={resourceCode} workflowFileBinding={workflowFileBinding && { ...workflowFileBinding, fieldCode: field.key }} renderers={{ upload, signer, ...references }} />{uploadBlocked?.(field) && <Typography.Text type="secondary">请先保存补填，让该附件字段生效，再上传文件。</Typography.Text>}{hint?.(field)}</>
        : canRead(field) ? <SurfaceFieldValue field={field} resourceCode={resourceCode} workflowFileBinding={workflowFileBinding && { ...workflowFileBinding, fieldCode: field.key }} value={rowDisplayValue(row, field, taskMode)} /> : '—'}
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

function MobileSubtableRow({ row, index, fields, operation, resourceCode, canWrite, canDelete, onRemove, onChange, upload, actions, workflowFileBinding, taskMode, hint, signer, references, uploadBlocked, disabled }: {
  row: SubtableDraftRow; index: number; fields: SurfaceField[]; operation: 'create' | 'update'; resourceCode: string;
  disabled?: boolean; canWrite: (field: SurfaceField) => boolean; canDelete: boolean; onRemove: () => void;
  actions?: import('react').ReactNode; workflowFileBinding?: WorkflowFileBinding;
  taskMode?: boolean; hint?: (field: SurfaceField) => import('react').ReactNode;
  onChange: (data: Record<string, unknown>) => void; upload: NonNullable<SurfaceFieldRenderers['upload']>;
  references?: Pick<SurfaceFieldRenderers, 'referenceLaunch' | 'referenceTask'>;
  signer?: SurfaceFieldRenderers['signer']; uploadBlocked?: (field: SurfaceField) => boolean;
}) {
  const [form] = Form.useForm();
  const [expanded, setExpanded] = useState(true);
  const registerValidation = useContext(MobileSubtableValidationContext);
  useEffect(() => registerValidation?.(row.key, async () => {
    try { await form.validateFields(); }
    catch { setExpanded(true); throw new Error(`请完善子表单第 ${index + 1} 项`); }
  }), [form, index, registerValidation, row.key]);
  useEffect(() => { form.setFields(Object.entries(row.data).map(([name, value]) => ({ name, value }))); }, [form, row.data]);
  const changeValues = (changed: Record<string, unknown>, all: Record<string, unknown>) => {
    const patch = resourceReferenceBindingPatch(fields.filter(canWrite), changed, all, row.data);
    form.setFields(Object.entries(patch).map(([name, value]) => ({ name, value, touched: true, errors: [] })));
    onChange({ ...all, ...patch });
  };
  return <div className="oxa-mobile-subtable-card">
    <header><MobileButton fill="none" aria-label={`${expanded ? '折叠' : '展开'}第${index + 1}项`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '▾' : '▸'} {index + 1}</MobileButton>
      {canDelete && <MobileButton fill="none" onClick={onRemove}>删除</MobileButton>}
      {actions}
    </header>
    <div hidden={!expanded} style={!expanded ? { display: 'none' } : undefined}>
      <Form component={false} layout="vertical" name={`subtable-${row.key}`} form={form} initialValues={row.data} onValuesChange={changeValues}>
        {fields.map(field => canWrite(field) || !taskMode
          ? <div key={field.key}><MobileSurfaceFieldControl field={field} disabled={Boolean(disabled || !canWrite(field) || uploadBlocked?.(field))} operation={operation} recordId={row.id} expectedRevision={row.revision} resourceCode={resourceCode} workflowFileBinding={workflowFileBinding && { ...workflowFileBinding, fieldCode: field.key }} renderers={{ upload, signer, ...references }} />{uploadBlocked?.(field) && <Typography.Text type="secondary">请先保存补填，让该附件字段生效，再上传文件。</Typography.Text>}{hint?.(field)}</div>
          : <div key={field.key}><Typography.Text type="secondary">{field.label}</Typography.Text><SurfaceFieldValue field={field} resourceCode={resourceCode} workflowFileBinding={workflowFileBinding && { ...workflowFileBinding, fieldCode: field.key }} mobile value={rowDisplayValue(row, field, taskMode)} /></div>)}
      </Form>
    </div>
  </div>;
}
