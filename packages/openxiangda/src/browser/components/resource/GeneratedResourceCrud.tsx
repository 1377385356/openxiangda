import { projectDataResourceView } from 'openxiangda-contracts/browser';
import {
  CloseOutlined,
  ExpandOutlined,
  CompressOutlined,
  ArrowRightOutlined,
  ExportOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import { useDelete, useList, useOne } from '@refinedev/core';
import {
  App,
  Alert,
  Button,
  Card,
  Collapse,
  Drawer,
  Descriptions,
  Empty,
  Input,
  Modal,
  Popover,
  Popconfirm,
  Result,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from 'antd';
import type {
  DataAuditEntry,
  DataResourceSurface,
} from 'openxiangda-contracts/browser';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useHref, useNavigate, useParams } from 'react-router-dom';
import {
  MobileResourceDetailPage,
  MobileResourceListPage,
  ResourceDetailPage,
  ResourceListPage,
} from './StandardResourcePages';
import {
  auditActorLabel,
  auditFieldChange,
  auditFieldCodes,
  SurfaceAuditFieldValue,
  SurfaceFieldValue,
  SurfaceFilterControl,
  type SurfaceField,
} from './SurfaceFields';
import {
  createNativeResourceClient,
  loadResourceListPreference,
  resetResourceListPreference,
  saveResourceListPreference,
  type GenericResourceQuery,
  type ResourceListPreference,
} from '../../platform-client';
import { useRuntime } from '../../runtime';
import {
  ResourceBatchActions,
  ResourceImportButton,
  WorkflowResourceImportButton,
} from './ResourceBatchActions';
import {
  isAdminContributionAllowed,
  useAdminResourceContributions,
} from '../../admin-contributions';
import {
  SubtableValueDisplay,
} from '../platform-fields/SubtableField';

import type { GeneratedResourceDefinition } from './generated-resource-definition';
import { selectedSurfaceFields } from './resource-field-selection';
import { isGeneratedDetailFieldVisible } from './detail-field-visibility';
import { GeneratedResourceFormPage } from './GeneratedResourceForm';
import { ResourceListSettings, type ListDisplaySettings } from './ResourceListSettings';
import { ResourceSortSettings } from './ResourceSortSettings';
import { ResourceAdvancedFilter, conditionCount, usableConditions } from './ResourceAdvancedFilter';
import type { ResourceSort } from '../platform-fields/resource-query';
import { activeFilterValue, fieldFor, fieldReadable, fieldWritable, fieldsBySection, filterValueLabel, resourceRecordPath, type ResourceRecord, type GeneratedResourceRoutePaths } from './resource-page-helpers';
export type { GeneratedResourceRoutePaths } from './resource-page-helpers';
import { useResourceDefinitions } from '../../resource-definitions';
import { useWorkflowDefinitions } from '../../workflow-definitions';
import { WorkflowRecordDetailPage, WorkflowSubmissionPage } from '../workflow/StandardWorkflowPages';
import { RecordDetailFrame, RecordDetailSections, detailTime } from './RecordDetailFrame';
import { RecordChangeHistory } from './RecordChangeHistory';
import { WorkflowRecordEditor } from '../workflow/WorkflowRecordEditor';
import type { ResourceFormDrawerState } from './ResourceFormFrame';

async function exportResourceRows(
  code: string,
  name: string,
  surface: DataResourceSurface,
  fields: SurfaceField[],
  query: Partial<GenericResourceQuery>,
  sorts: ResourceSort[]
) {
  const client = createNativeResourceClient(code, surface);
  const exported = await client.exportCsv({
    page: 1,
    pageSize: 200,
    ...query,
    sorts,
  }, fields.map((field) => field.key));
  const url = URL.createObjectURL(exported.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = exported.fileName || `${name}.csv`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return { rowLimit: exported.rowLimit };
}

function useGeneratedList(
  definition: GeneratedResourceDefinition,
  readableFieldCodes: Set<string>
) {
  const { code, surface } = definition;
  const declaredDefaultSort = surface.list?.defaultSort?.field;
  const defaultSortField =
    (declaredDefaultSort && readableFieldCodes.has(declaredDefaultSort)
      ? declaredDefaultSort
      : Object.keys(surface.fields).find((field) => readableFieldCodes.has(field) && surface.fields[field]?.sortable)) || '';
  const defaultSortOrder = surface.list?.defaultSort?.order || 'asc';
  const defaultPageSize = surface.list?.defaultPageSize || 20;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [draft, setDraft] = useState<Partial<GenericResourceQuery>>({});
  const [query, setQuery] = useState<Partial<GenericResourceQuery>>({});
  const defaultSorts: ResourceSort[] = defaultSortField ? [{ field: defaultSortField, order: defaultSortOrder as 'asc' | 'desc' }] : [];
  const [sorts, setSorts] = useState<ResourceSort[]>(defaultSorts);
  useEffect(() => {
    setPage(1);
    setPageSize(defaultPageSize);
    setDraft({});
    setQuery({});
    setSorts(defaultSorts);
  }, [code, defaultPageSize, defaultSortField, defaultSortOrder]);
  const list = useList<ResourceRecord>({
    resource: code,
    pagination: { currentPage: page, pageSize },
    sorters: sorts,
    meta: { query },
  });
  return {
    defaultSorts,
    draft,
    list,
    page,
    pageSize,
    query,
    setDraft,
    setPage,
    setPageSize,
    setQuery,
    setSorts,
    sorts,
  };
}

export function GeneratedResourcePage({
  resourceCode,
  viewCode,
  mode = 'list',
  variant = 'desktop',
  definition: providedDefinition,
  paths,
}: {
  resourceCode: string;
  viewCode?: string;
  mode?: 'list' | 'create' | 'edit' | 'detail';
  variant?: 'desktop' | 'mobile';
  definition?: GeneratedResourceDefinition;
  paths: GeneratedResourceRoutePaths;
}) {
  const definitions = useResourceDefinitions();
  const params = useParams();
  const definition = useMemo(() => {
    const base = providedDefinition || definitions[resourceCode];
    if (!base || viewCode === undefined) return base;
    const view = base.surface.views?.find(item => item.code === viewCode);
    return view ? { ...base, name: view.name, viewCode, surface: projectDataResourceView(base.surface, viewCode) } : undefined;
  }, [providedDefinition, definitions, resourceCode, viewCode]);
  const operation =
    mode === 'edit' ? 'update' : mode;
  if (!definition || definition.surface.generated?.[operation] !== true) {
    return <Result status="404" title="未声明可生成的资源页面" />;
  }
  const generated = definition.surface.generated;
  if (
    (generated.list && !paths.list) ||
    (generated.detail && !paths.detail) ||
    (generated.create && !paths.create) ||
    (generated.update && !paths.edit)
  ) {
    return <Result status="500" title="生成资源路由合同不完整" />;
  }
  const pageKey = `${mode}:${resourceCode}:${viewCode || ""}:${params.id || ''}`;
  if (mode === 'list') return <GeneratedResourceListPage key={pageKey} definition={definition} paths={paths} variant={variant} />;
  if (mode === 'detail') return <GeneratedResourceDetailPage key={pageKey} definition={definition} paths={paths} variant={variant} />;
  return <GeneratedResourceFormPage key={pageKey} definition={definition} mode={mode} paths={paths} variant={variant} />;
}

function GeneratedResourceListPage({ definition, paths, variant }: { definition: GeneratedResourceDefinition; paths: GeneratedResourceRoutePaths; variant: 'desktop' | 'mobile' }) {
  return variant === 'mobile' ? <GeneratedMobileList definition={definition} paths={paths} /> : <GeneratedDesktopList definition={definition} paths={paths} />;
}

function GeneratedDesktopList({ definition, paths }: { definition: GeneratedResourceDefinition; paths: GeneratedResourceRoutePaths }) {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { hasCapability, hasReadCapability, identity } = useRuntime();
  const { code, name, surface, capabilities } = definition;
  const generated = surface.generated!;
  const workflowDefinitions = useWorkflowDefinitions();
  const contributions = useAdminResourceContributions(code);
  const fields = selectedSurfaceFields(surface, 'list').filter((field) =>
    fieldReadable(field, hasReadCapability, identity.isAppSuperAdmin)
  );
  const readableFieldCodes = new Set(
    Object.entries(surface.fields)
      .filter(([key, field]) => isGeneratedDetailFieldVisible({ key, ...field }) && fieldReadable({ key, ...field }, hasReadCapability, identity.isAppSuperAdmin))
      .map(([key]) => key)
  );
  const state = useGeneratedList(definition, readableFieldCodes);
  const [exporting, setExporting] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<{ mode: 'create' | 'edit'; id?: string }>();
  const [detailId, setDetailId] = useState<string>();
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [correctionId, setCorrectionId] = useState<string>();
  const [entryFullScreen, setEntryFullScreen] = useState(false);
  const drawerState = { fullScreen: entryFullScreen, setFullScreen: setEntryFullScreen };
  const [sortsOpen, setSortsOpen] = useState(false);
  const [frozenKeys, setFrozenKeys] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [savedDisplay, setSavedDisplay] = useState('');
  const [density, setDensity] = useState<'small' | 'middle' | 'large'>('middle');
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => [
    ...fields.map((field) => field.key),
  ]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [hasSavedPreference, setHasSavedPreference] = useState(false);
  const remove = useDelete();
  const rows = (state.list.result.data || []) as unknown as ResourceRecord[];
  useEffect(() => {
    setVisibleColumnKeys([
      ...fields.map((field) => field.key),
    ]);
    setMoreFiltersOpen(false);
    setFrozenKeys([]);
    setColumnOrder([]);
    setDensity('middle');
    setSelectedRowKeys([]);
  }, [code]);
  useEffect(() => {
    setSelectedRowKeys([]);
  }, [code, state.page, state.pageSize, state.query, state.sorts]);
  const formFields = fieldsBySection(surface).flatMap((group) => group.fields);
  const importWritableFieldCodes = formFields
    .filter((field) => field.widget !== 'readonly' && fieldWritable(field, 'create', hasCapability, identity.isAppSuperAdmin))
    .map((field) => field.key);
  const standardWorkflows = [...workflowDefinitions.values()].filter(
    workflow =>
      workflow.subject.resourceCode === code &&
      ['standalone', 'hidden-handoff'].includes(workflow.launch.mode) &&
      Boolean(workflow.processOperationCode),
  );
  const standardWorkflow =
    surface.mutationOwner === 'workflow' && standardWorkflows.length === 1
      ? standardWorkflows[0]
      : undefined;
  const workflowImportFieldCodes = formFields
    .filter(
      field =>
        !field.system &&
        field.widget !== 'readonly' &&
        field.type !== 'subtable',
    )
    .map(field => field.key);
  const batchWritableFields = formFields.filter(
    (field) => !['file', 'readonly'].includes(field.widget || '') && fieldWritable(field, 'edit', hasCapability, identity.isAppSuperAdmin)
  );
  const selectedRows = rows.filter((row) => selectedRowKeys.includes(row.id));
  const toolbarContributions = (contributions?.toolbar || []).filter((item) =>
    isAdminContributionAllowed(item, hasCapability) && (!item.requiresSelection || selectedRows.length > 0)
  );
  const rowContributions = (contributions?.row || []).filter((item) =>
    isAdminContributionAllowed(item, hasCapability)
  );
  const canBatch =
    (contributions?.toolbar || []).some(item => item.requiresSelection && isAdminContributionAllowed(item, hasCapability)) ||
    (generated.update && hasCapability(capabilities.update)) ||
    (generated.delete && hasCapability(capabilities.delete));
  const configurableColumns = [
    ...fields.map(field => ({ key: field.key, label: field.label })),
    { key: 'created_at', label: '创建时间' },
    { key: 'updated_at', label: '更新时间' },
  ];
  const listKey = `openxiangda-v2:resource:${code}${definition.viewCode ? `:view:${definition.viewCode}` : ""}`;
  const filterFields = (surface.list?.filterFields || []).filter(key => readableFieldCodes.has(key));
  const filterDefinitions = filterFields.map(key => fieldFor(surface, key));
  const sortFields = Object.keys(surface.fields).filter(key => readableFieldCodes.has(key) && (surface.fields[key]?.sortable || key === surface.list?.defaultSort?.field)).map(key => fieldFor(surface, key));
  const orderedKeys = [...columnOrder.filter(key => configurableColumns.some(item => item.key === key)),
    ...configurableColumns.map(item => item.key).filter(key => !columnOrder.includes(key))];
  const display: ListDisplaySettings = { columns: orderedKeys.map(key => ({ key, visible: visibleColumnKeys.includes(key),
    ...(frozenKeys.includes(key) ? { fixed: 'left' as const } : {}) })), density };
  const displaySignature = JSON.stringify(display);
  const displayDirty = preferenceReady && savedDisplay !== '' && displaySignature !== savedDisplay;
  const preferencePayload = (): ResourceListPreference => ({
    version: 1, columns: display.columns,
    filters: { keyword: state.query.keyword, values: state.query.filters, where: state.query.where },
    sorts: state.sorts.map(sort => ({ field: sort.field, direction: sort.order === 'asc' ? 'ascend' : 'descend' })),
    density, pageSize: state.pageSize,
  });
  useEffect(() => {
    let active = true;
    setPreferenceReady(false);
    const defaults = preferencePayload();
    void loadResourceListPreference(listKey)
      .then(preference => {
        if (!active) return;
        const allowedColumns = new Set(configurableColumns.map(column => column.key));
        const storedColumns = Array.isArray(preference?.columns)
          ? preference.columns.filter(column => allowedColumns.has(column.key))
          : [];
        const visible = storedColumns
          .filter(column => column.visible)
          .map(column => column.key);
        const nextVisible = visible.length
          ? visible
          : defaults.columns.filter(column => column.visible).map(column => column.key);
        const allowedFilters = new Set((surface.list?.filterFields || []).filter(key => readableFieldCodes.has(key)));
        const filterValues =
          preference?.filters?.values &&
          typeof preference.filters.values === 'object' &&
          !Array.isArray(preference.filters.values)
            ? Object.fromEntries(
                Object.entries(preference.filters.values).filter(([key]) =>
                  allowedFilters.has(key),
                ),
              )
            : {};
        const keyword =
          (surface.list?.searchableFields || []).some(key => readableFieldCodes.has(key)) &&
          typeof preference?.filters?.keyword === 'string'
            ? preference.filters.keyword
            : undefined;
        const sortableFields = new Set(sortFields.map(field => field.key));
        const storedSorts = preference?.sorts?.filter((sort, index, all) => sortableFields.has(sort.field) &&
          all.findIndex(item => item.field === sort.field) === index).slice(0, 10);
        const nextSorts: ResourceSort[] = storedSorts ? storedSorts.map(sort => ({ field: sort.field, order: sort.direction === 'descend' ? 'desc' : 'asc' })) : state.defaultSorts;
        const nextDensity = ['small', 'middle', 'large'].includes(
          String(preference?.density || ''),
        )
          ? preference!.density
          : defaults.density;
        const nextPageSize =
          Number.isSafeInteger(preference?.pageSize) &&
          Number(preference?.pageSize) >= 10 &&
          Number(preference?.pageSize) <= 100
            ? Number(preference!.pageSize)
            : defaults.pageSize;
        const nextQuery = {
          ...(keyword ? { keyword } : {}),
          ...(usableConditions(preference?.filters?.where, filterDefinitions) ? { where: preference!.filters.where } : {}),
          ...(Object.keys(filterValues).length ? { filters: filterValues } : {}),
        };
        setVisibleColumnKeys(nextVisible);
        const nextOrder = [...storedColumns.map(column => column.key), ...defaults.columns.map(column => column.key).filter(key => !storedColumns.some(column => column.key === key))];
        const nextFrozen = storedColumns.filter(column => column.fixed === 'left').map(column => column.key);
        setColumnOrder(nextOrder); setFrozenKeys(nextFrozen);
        setSavedDisplay(JSON.stringify({ columns: nextOrder.map(key => ({ key, visible: nextVisible.includes(key), ...(nextFrozen.includes(key) ? { fixed: 'left' } : {}) })), density: nextDensity }));
        setDensity(nextDensity);
        state.setDraft(nextQuery);
        state.setQuery(nextQuery);
        state.setSorts(nextSorts);
        state.setPageSize(nextPageSize);
        state.setPage(1);
        setHasSavedPreference(Boolean(preference));
        setPreferenceReady(true);
      })
      .catch(() => {
        if (!active) return;
        setHasSavedPreference(false);
        setSavedDisplay(JSON.stringify({ columns: defaults.columns, density: defaults.density }));
        setPreferenceReady(true);
      });
    return () => {
      active = false;
    };
    // Resource changes remount the generated page and own preference scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  const firstVisibleBusinessField = fields.find(field =>
    visibleColumnKeys.includes(field.key),
  );
  const columns = useMemo<TableColumnsType<ResourceRecord>>(
    () => [
      ...fields
        .filter((field) => visibleColumnKeys.includes(field.key))
        .map((field) => ({
          title: field.label,
          dataIndex: field.key,
          key: field.key,
          align: field.type === 'number.integer' || field.type === 'number.decimal'
            ? 'right' as const
            : undefined,
          width: ['date', 'time', 'boolean', 'number.integer', 'number.decimal'].includes(field.type) ? 140 : 200,
          ellipsis: true,
          fixed: frozenKeys.includes(field.key) ? 'left' as const : undefined,
          sorter: field.sortable ? { multiple: Math.max(1, fields.length - state.sorts.findIndex(sort => sort.field === field.key)) } : false,
          sortOrder: state.sorts.find(sort => sort.field === field.key)?.order === 'asc' ? 'ascend' as const : state.sorts.find(sort => sort.field === field.key)?.order === 'desc' ? 'descend' as const : null,
          render: (value: unknown, record: ResourceRecord) => {
            const rendered = (
              <SurfaceFieldValue
                field={field}
                resourceCode={code}
                value={value}
              />
            );
            return field.key === firstVisibleBusinessField?.key && generated.detail ? (
              <a onClick={() => setDetailId(record.id)}>
                {rendered}
              </a>
            ) : rendered;
          },
        })),
      ...(visibleColumnKeys.includes('created_at') ? [{
        title: '创建时间',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 190, fixed: frozenKeys.includes('created_at') ? 'left' as const : undefined,
        render: (value: unknown) => (value ? new Date(String(value)).toLocaleString('zh-CN') : '-'),
      }] : []),
      ...(visibleColumnKeys.includes('updated_at') ? [{
        title: '更新时间',
        dataIndex: 'updated_at',
        key: 'updated_at',
        width: 190, fixed: frozenKeys.includes('updated_at') ? 'left' as const : undefined,
        render: (value: unknown) => (value ? new Date(String(value)).toLocaleString('zh-CN') : '-'),
      }] : []),
      {
        title: '操作',
        key: 'actions',
        fixed: 'right' as const,
        width: 190,
        render: (_: unknown, record: ResourceRecord) => (
          <Space size={4}>
            {generated.detail && (
              <Button aria-label="查看" onClick={() => setDetailId(record.id)} size="small" type="link">查看</Button>
            )}
            {surface.mutationOwner === 'workflow' && identity.isAppSuperAdmin && <Button aria-label="编辑" onClick={() => setCorrectionId(record.id)} size="small" type="link">编辑</Button>}
            {generated.update && hasCapability(capabilities.update) && (
              <Button
                aria-label="编辑"
                onClick={() => setFormTarget({ mode: 'edit', id: record.id })}
                size="small"
                type="link"
              >编辑</Button>
            )}
            {generated.delete && hasCapability(capabilities.delete) && (
              <Popconfirm
                onConfirm={() =>
                  remove.mutate(
                    {
                      resource: code,
                      id: record.id,
                      meta: { expectedRevision: record.revision },
                    },
                    {
                      onSuccess: () => {
                        message.success('已删除');
                        void state.list.query.refetch();
                      },
                    }
                  )
                }
                title={`确定删除${name}？`}
              >
                <Button aria-label="删除" danger size="small" type="link">删除</Button>
              </Popconfirm>
            )}
            {rowContributions.map((contribution) => (
              <Fragment key={contribution.code}>
                {contribution.render({
                  record,
                  resource: code,
                  refresh: () => state.list.query.refetch(),
                })}
              </Fragment>
            ))}
          </Space>
        ),
      },
    ],
    [
      capabilities.delete,
      capabilities.update,
      code,
      fields,
      firstVisibleBusinessField,
      hasCapability,
      message,
      name,
      navigate,
      remove,
      rowContributions,
      state.list.query,
      state.sorts,
      frozenKeys,
      visibleColumnKeys,
    ]
  );
  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportResourceRows(code, name, surface, fields, state.query, state.sorts);
      message.success(`导出已生成（最多 ${result.rowLimit} 条）`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };
  const changeDisplay = (settings: ListDisplaySettings) => {
    setColumnOrder(settings.columns.map(column => column.key));
    setVisibleColumnKeys(settings.columns.filter(column => column.visible).map(column => column.key));
    setFrozenKeys(settings.columns.filter(column => column.fixed).map(column => column.key));
    setDensity(settings.density);
  };
  const savePreference = async () => {
    setPreferenceSaving(true);
    const snapshot = displaySignature;
    try {
      await saveResourceListPreference(listKey, preferencePayload());
      setSavedDisplay(snapshot); setHasSavedPreference(true); message.success('列表设置已保存');
    } catch (error) { message.error(error instanceof Error ? error.message : '列表设置保存失败'); }
    finally { setPreferenceSaving(false); }
  };
  const restorePreference = async () => {
    setPreferenceSaving(true);
    try {
      await resetResourceListPreference(listKey);
      const nextVisible = fields.map(field => field.key);
      const defaultPageSize = surface.list?.defaultPageSize || 20;
      setVisibleColumnKeys(nextVisible);
      setDensity('middle');
      setFrozenKeys([]); setColumnOrder(configurableColumns.map(column => column.key));
      setSavedDisplay(JSON.stringify({ columns: configurableColumns.map(column => ({ key: column.key, visible: nextVisible.includes(column.key) })), density: 'middle' }));
      state.setDraft({});
      state.setQuery({});
      state.setSorts(state.defaultSorts);
      state.setPageSize(defaultPageSize);
      state.setPage(1);
      setHasSavedPreference(false);
      message.success('已恢复默认设置');
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : '恢复默认设置失败');
      return false;
    } finally {
      setPreferenceSaving(false);
    }
  };
  const searchableFields = (surface.list?.searchableFields || []).filter((field) =>
    readableFieldCodes.has(field)
  );
  const searchLabels = searchableFields.map(key => fieldFor(surface, key).label);
  const keywordPlaceholder = searchLabels.length === 0
    ? '搜索关键词'
    : searchLabels.length === 1
      ? `搜索${searchLabels[0]}`
      : `搜索${searchLabels.slice(0, 2).join('或')}${searchLabels.length > 2 ? '等' : ''}`;
  const activeAdditionalCount = conditionCount(state.query.where) + filterFields.filter(key =>
    activeFilterValue(state.query.filters?.[key])
  ).length;
  const applyQuery = (next: Partial<GenericResourceQuery>) => {
    state.setDraft(next);
    state.setQuery(next);
    state.setPage(1);
  };
  const removeAppliedFilter = (key: string) => {
    if (key === 'advanced') { applyQuery({ ...state.query, where: undefined }); return; }
    if (key === 'keyword') {
      applyQuery({ ...state.query, keyword: undefined });
      return;
    }
    const filters = { ...(state.query.filters || {}) };
    delete filters[key];
    applyQuery({ ...state.query, filters });
  };
  const appliedConditions = [
    ...(state.query.where ? [{ key: 'advanced', label: `筛选条件：${conditionCount(state.query.where)} 项` }] : []),
    ...(state.query.keyword?.trim()
      ? [{ key: 'keyword', label: `关键词：${state.query.keyword.trim()}` }]
      : []),
    ...filterFields
      .filter(key => activeFilterValue(state.query.filters?.[key]))
      .map(key => ({
        key,
        label: `${fieldFor(surface, key).label}：${filterValueLabel(state.query.filters?.[key])}`,
      })),
  ];
  return (
    <ResourceListPage
      createCapability={generated.create ? capabilities.create : undefined}
      createPath={generated.create ? paths.create : undefined}
      readCapability={capabilities.read}
      resource={code}
      surface={surface}
      title={name}
    >
      {state.list.query.isError && (
        <Alert
          action={
            <Button onClick={() => void state.list.query.refetch()} size="small">
              重试
            </Button>
          }
          description={state.list.query.error instanceof Error ? state.list.query.error.message : '请稍后重试或联系平台管理员'}
          showIcon
          title="数据读取失败"
          type="error"
        />
      )}
      <ResourceAdvancedFilter open={moreFiltersOpen} fields={filterDefinitions} value={state.query.where}
        resourceCode={code} onClose={() => setMoreFiltersOpen(false)} onApply={where => applyQuery({ ...state.query, filters: undefined, where })} />
      <div className="oxa-list-toolbar">
        <Space className="oxa-list-toolbar-primary" wrap>
          {standardWorkflow && <Button aria-label="新增流程申请" icon={<PlusOutlined />} type="primary" onClick={() => setWorkflowOpen(true)}>新增</Button>}
          {generated.create && hasCapability(capabilities.create) && (
            <Button aria-label="新增" icon={<PlusOutlined />} onClick={() => setFormTarget({ mode: 'create' })} type="primary">
              新增
            </Button>
          )}
          {standardWorkflow?.processOperationCode && (
            <WorkflowResourceImportButton
              code={code}
              name={name}
              onCompleted={() => state.list.query.refetch()}
              processOperationCode={standardWorkflow.processOperationCode}
              surface={surface}
              workflowCode={standardWorkflow.code}
              writableFieldCodes={workflowImportFieldCodes}
            />
          )}
          {generated.create && hasCapability(capabilities.create) && (
            <ResourceImportButton
              code={code}
              name={name}
              surface={surface}
              writableFieldCodes={importWritableFieldCodes}
              onCompleted={() => state.list.query.refetch()}
            />
          )}
          <Button aria-label="导出" icon={<ExportOutlined />} loading={exporting} onClick={() => void handleExport()}>
            导出
          </Button>
          {toolbarContributions.map((contribution) => (
            <Fragment key={contribution.code}>
              {contribution.render({
                resource: code,
                selectedRecords: selectedRows,
                refresh: () => state.list.query.refetch(),
              })}
            </Fragment>
          ))}
        </Space>
        <Space className="oxa-list-toolbar-secondary" wrap>
          {displayDirty && <span className="oxa-list-dirty">你调整了显示列配置 <Button type="link" aria-label="保存显示列配置" loading={preferenceSaving} disabled={!visibleColumnKeys.length} onClick={() => void savePreference()}>保存</Button></span>}
          {searchableFields.length > 0 && <Input.Search
            className="oxa-list-search"
            aria-label="搜索数据"
            allowClear
            disabled={!preferenceReady}
            placeholder={keywordPlaceholder}
            value={state.draft.keyword}
            onChange={event => state.setDraft(current => ({ ...current, keyword: event.target.value }))}
            onSearch={value => applyQuery({ ...state.query, keyword: value })}
          />}
          {filterFields.length > 0 && <Button aria-label="筛选" icon={<FilterOutlined />} disabled={!preferenceReady}
            onClick={() => setMoreFiltersOpen(true)}>
            筛选{activeAdditionalCount ? ` (${activeAdditionalCount})` : ''}
          </Button>}
          <Popover trigger="click" placement="bottomRight" open={settingsOpen} onOpenChange={setSettingsOpen} destroyOnHidden
            content={<ResourceListSettings columns={configurableColumns} value={display} disabled={preferenceSaving} onChange={changeDisplay} onReset={() => void restorePreference()} />}>
            <Button aria-label="显示列" type="text" icon={<SettingOutlined />} disabled={!preferenceReady}>显示列</Button>
          </Popover>
          <Popover trigger="click" placement="bottomRight" open={sortsOpen} onOpenChange={setSortsOpen} destroyOnHidden
            content={<ResourceSortSettings key={String(sortsOpen)} fields={sortFields} value={state.sorts}
              onApply={sorts => { void (async () => {
                try {
                  await saveResourceListPreference(listKey, { ...preferencePayload(), ...JSON.parse(savedDisplay || displaySignature), sorts: sorts.map(sort => ({ field: sort.field, direction: sort.order === 'asc' ? 'ascend' : 'descend' })) });
                  state.setSorts(sorts); state.setPage(1); setSortsOpen(false);
                } catch (error) { message.error(error instanceof Error ? error.message : '排序保存失败'); }
              })(); }} />}>
            <Button aria-label="排序" type="text" icon={<SortAscendingOutlined />} disabled={!preferenceReady}>排序{state.sorts.length ? ` (${state.sorts.length})` : ''}</Button>
          </Popover>
        <Tooltip title="刷新">
          <Button aria-label="刷新数据" icon={<ReloadOutlined />} loading={state.list.query.isFetching}
            onClick={() => void state.list.query.refetch()} />
        </Tooltip>
        </Space>
      </div>
        {appliedConditions.length > 0 && (
          <div className="oxa-applied-filters">
            <span>已选条件</span>
            <div className="oxa-applied-filter-tags">
              {appliedConditions.map(condition => (
                <Tag
                  closable
                  key={condition.key}
                  onClose={(event) => {
                    event.preventDefault();
                    removeAppliedFilter(condition.key);
                  }}
                >
                  {condition.label}
                </Tag>
              ))}
            </div>
            <Button onClick={() => applyQuery({})} type="link">清空全部</Button>
          </div>
        )}
      {correctionId && <WorkflowRecordEditor resourceCode={code} recordId={correctionId} drawerState={drawerState} onDismiss={() => { setCorrectionId(undefined); setEntryFullScreen(false); }} onSaved={id => { setCorrectionId(undefined); if (generated.detail) setDetailId(id); void state.list.query.refetch(); }} />}
      {workflowOpen && standardWorkflow && <WorkflowSubmissionPage workflowCode={standardWorkflow.code} onDismiss={() => setWorkflowOpen(false)}
        onCompleted={id => { setWorkflowOpen(false); if (generated.detail) setDetailId(id); void state.list.query.refetch(); }} />}
      {detailId && <GeneratedResourceDetailPage definition={definition} paths={paths} variant="desktop"
        recordId={detailId} drawerState={drawerState} onDismiss={() => { setDetailId(undefined); setEntryFullScreen(false); }} onEdit={() => { if (surface.mutationOwner === 'workflow') setCorrectionId(detailId); else setFormTarget({ mode: 'edit', id: detailId }); setDetailId(undefined); }} />}
      {formTarget && <GeneratedResourceFormPage
        key={`${formTarget.mode}:${formTarget.id || ''}`}
        definition={definition} paths={paths} variant="desktop" mode={formTarget.mode} recordId={formTarget.id}
        drawerState={drawerState} onDismiss={() => { setFormTarget(undefined); setEntryFullScreen(false); }}
        onSaved={id => { setFormTarget(undefined); if (generated.detail) setDetailId(id); void state.list.query.refetch(); }}
      />}
      <ResourceBatchActions
        canDelete={Boolean(generated.delete && hasCapability(capabilities.delete))}
        code={code}
        name={name}
        onClear={() => setSelectedRowKeys([])}
        onCompleted={() => state.list.query.refetch()}
        rows={selectedRows}
        surface={surface}
        writableFields={batchWritableFields}
      />
      <Table<ResourceRecord>
        columns={[...columns.filter(column => column.key !== 'actions')].sort((a, b) => orderedKeys.indexOf(String(a.key)) - orderedKeys.indexOf(String(b.key))).sort((a, b) => Number(b.fixed === 'left') - Number(a.fixed === 'left')).concat(columns.filter(column => column.key === 'actions'))}
        dataSource={rows}
        loading={state.list.query.isFetching}
        locale={{ emptyText: <Empty description={visibleColumnKeys.length ? `暂无${name}` : '请选择至少一列'} /> }}
        rowKey="id"
        rowSelection={
          canBatch
            ? {
                selectedRowKeys,
                onChange: (keys) => {
                  const next = keys.map(String);
                  if (next.length > 100) message.warning('单次最多选择 100 条记录');
                  setSelectedRowKeys(next.slice(0, 100));
                },
              }
            : undefined
        }
        scroll={{ x: 'max-content' }}
        size={density}
        onChange={(_, __, sorter, extra) => {
          if (extra.action !== 'sort') return;
          const items = Array.isArray(sorter) ? sorter : [sorter];
          state.setPage(1);
          state.setSorts(items.filter(item => item.field && item.order).map(item => ({ field: String(item.field), order: item.order === 'ascend' ? 'asc' : 'desc' })));

        }}
        pagination={{
          current: state.page,
          pageSize: state.pageSize,
          total: state.list.result.total || 0,
          showSizeChanger: true,
          showTotal: total => `共 ${total} 条`,
          onChange: (next, size) => {
            state.setPage(next);
            state.setPageSize(size);
          },
        }}
      />
    </ResourceListPage>
  );
}

function GeneratedMobileList({ definition, paths }: { definition: GeneratedResourceDefinition; paths: GeneratedResourceRoutePaths }) {
  const navigate = useNavigate();
  const { hasCapability, hasReadCapability, identity } = useRuntime();
  const { message } = App.useApp();
  const { code, name, surface, capabilities } = definition;
  const generated = surface.generated!;
  const readableFieldCodes = new Set(
    Object.entries(surface.fields)
      .filter(([key, field]) => isGeneratedDetailFieldVisible({ key, ...field }) && fieldReadable({ key, ...field }, hasReadCapability, identity.isAppSuperAdmin))
      .map(([key]) => key)
  );
  const state = useGeneratedList(definition, readableFieldCodes);
  const [exporting, setExporting] = useState(false);
  const rows = (state.list.result.data || []) as unknown as ResourceRecord[];
  const fields = selectedSurfaceFields(surface, 'list')
    .filter((field) => fieldReadable(field, hasReadCapability, identity.isAppSuperAdmin))
    .slice(0, 4);
  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportResourceRows(code, name, surface, fields, state.query, state.sorts);
      message.success(`导出已生成（最多 ${result.rowLimit} 条）`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败');
    } finally {
      setExporting(false);
    }
  };
  return (
    <MobileResourceListPage
      createCapability={generated.create ? capabilities.create : undefined}
      createPath={generated.create ? paths.create : undefined}
      description={`${code} 资源`}
      onExport={() => void handleExport()}
      readCapability={capabilities.read}
      resource={code}
      surface={surface}
      title={name}
    >
      {state.list.query.isError && (
        <Alert
          action={
            <Button onClick={() => void state.list.query.refetch()} size="small">
              重试
            </Button>
          }
          description={state.list.query.error instanceof Error ? state.list.query.error.message : '请稍后重试或联系平台管理员'}
          showIcon
          title="数据读取失败"
          type="error"
        />
      )}
      <div className="oxa-mobile-filter">
        <Input
          allowClear
          placeholder="关键词"
          value={state.draft.keyword}
          onChange={(event) => state.setDraft((item) => ({ ...item, keyword: event.target.value }))}
          onPressEnter={() => {
            state.setPage(1);
            state.setQuery(state.draft);
          }}
        />
        <Button
          loading={state.list.query.isFetching}
          icon={<SearchOutlined />}
          onClick={() => {
            state.setPage(1);
            state.setQuery(state.draft);
          }}
          type="primary"
        >
          查询
        </Button>
      </div>
      {state.list.query.isFetching ? (
        <div className="oxa-page-loading">
          <Spin />
        </div>
      ) : rows.length ? (
        <div className="oxa-mobile-record-list">
          {rows.map((record) => {
            const primaryField = fields[0];
            const primaryValue = primaryField ? (
              <SurfaceFieldValue
                field={primaryField}
                resourceCode={code}
                value={record[primaryField.key]}
              />
            ) : (
              <>{record.id}</>
            );
            return (
              <Card className="oxa-mobile-record-card" key={record.id} size="small">
                <div className="oxa-mobile-record-heading">
                  {generated.detail ? (
                    <a onClick={() => navigate(resourceRecordPath(paths.detail, record.id))}>
                      {primaryValue}
                    </a>
                  ) : (
                    primaryValue
                  )}
                </div>
                <div className="oxa-mobile-record-fields">
                  {fields.slice(1).map((field) => (
                    <div key={field.key}>
                      <Typography.Text type="secondary">{field.label}</Typography.Text>
                      <div>
                        <SurfaceFieldValue field={field} resourceCode={code} value={record[field.key]} />
                      </div>
                    </div>
                  ))}
                </div>
                <Space>
                  {generated.detail && (
                    <Button onClick={() => navigate(resourceRecordPath(paths.detail, record.id))} size="small">
                      查看
                    </Button>
                  )}
                  {generated.update && hasCapability(capabilities.update) && (
                    <Button onClick={() => navigate(resourceRecordPath(paths.edit, record.id))} size="small">
                      编辑
                    </Button>
                  )}
                </Space>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty description={`暂无${name}`} />
        </Card>
      )}
      <div className="oxa-mobile-pagination">
        <Button disabled={state.page <= 1} onClick={() => state.setPage((item) => item - 1)}>
          上一页
        </Button>
        <Typography.Text>第 {state.page} 页</Typography.Text>
        <Button disabled={rows.length < (surface.list?.defaultPageSize || 20)} onClick={() => state.setPage((item) => item + 1)}>
          下一页
        </Button>
      </div>
    </MobileResourceListPage>
  );
}

function GeneratedResourceDetailPage({ definition, paths, variant, recordId, onDismiss, onEdit, drawerState }: { definition: GeneratedResourceDefinition; paths: GeneratedResourceRoutePaths; variant: 'desktop' | 'mobile'; recordId?: string; onDismiss?: () => void; onEdit?: () => void; drawerState?: ResourceFormDrawerState }) {
  if (definition.surface.mutationOwner === 'workflow') return <WorkflowRecordDetailPage resourceCode={definition.code} recordId={recordId} variant={variant} onDismiss={onDismiss} drawerState={drawerState} />;
  return <NativeResourceDetailPage definition={definition} paths={paths} variant={variant} recordId={recordId} onDismiss={onDismiss} onEdit={onEdit} drawerState={drawerState} />;
}

function NativeResourceDetailPage({ definition, paths, variant, recordId, onDismiss, onEdit, drawerState }: { definition: GeneratedResourceDefinition; paths: GeneratedResourceRoutePaths; variant: 'desktop' | 'mobile'; recordId?: string; onDismiss?: () => void; onEdit?: () => void; drawerState?: ResourceFormDrawerState }) {
  const params = useParams();
  const id = recordId ?? params.id ?? '';
  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const newPageHref = useHref(resourceRecordPath(paths.detail, id));
  const navigate = useNavigate();
  const { hasCapability, hasReadCapability, identity } = useRuntime();
  const contributions = useAdminResourceContributions(definition.code);
  const query = useOne<ResourceRecord>({
    resource: definition.code,
    id,
    queryOptions: { retry: false, enabled: hasReadCapability(definition.capabilities.read) },
  });
  const record = hasReadCapability(definition.capabilities.read) ? query.result : undefined;
  const detailContributions = (contributions?.detail || []).filter((item) =>
    isAdminContributionAllowed(item, hasCapability)
  );
  const [auditExpanded, setAuditExpanded] = useState(false);
  const readable = (field: SurfaceField) => fieldReadable(field, hasReadCapability, identity.isAppSuperAdmin);
  const fields = selectedSurfaceFields(definition.surface, 'detail').filter(readable);
  const titleField = selectedSurfaceFields(definition.surface, 'list').find(field =>
    field.type === 'text.short' && fields.some(visible => visible.key === field.key && !visible.system)
  ) || fields.find(field => !field.system && field.type === 'text.short');
  const recordTitle = titleField && record?.[titleField.key] ? String(record[titleField.key]) : definition.name;
  const statusField = fields.find(field => field.key === 'status' && field.type === 'option.single');
  const close = editing ? () => { if (!editBusy) setEditing(false); } : onDismiss || (() => navigate(paths.list || paths.fallback));
  const edit = definition.surface.generated?.update && (identity.isAppSuperAdmin || hasCapability(definition.capabilities.update))
    ? () => setEditing(true) : undefined;
  const creator = record?.created_by;
  const creatorLabel = creator && typeof creator === 'object' ? String((creator as Record<string, unknown>).label || (creator as Record<string, unknown>).displayName || '') : '';
  const createdTime = detailTime(record?.created_at);
  return <RecordDetailFrame title={`${definition.name}详情`} heading={record && recordTitle}
    status={statusField && record && record[statusField.key] != null && record[statusField.key] !== '' ? <Tag color="processing"><SurfaceFieldValue field={statusField} value={record[statusField.key]} /></Tag> : undefined}
    metadata={[creatorLabel, createdTime ? `${createdTime} 创建` : ''].filter(Boolean).join(' · ')} updatedAt={record?.updated_at}
    variant={variant} drawer={Boolean(onDismiss)} drawerState={drawerState} newPageHref={newPageHref} onClose={close} onEdit={record ? edit : undefined} busy={editBusy}
    editing={editing && record ? <GeneratedResourceFormPage definition={definition} paths={paths} variant={variant} recordId={id} mode="edit" embedded
      onBusyChange={setEditBusy} onDismiss={() => setEditing(false)} onSaved={() => { setEditing(false); void query.query.refetch(); }} /> : undefined}>
    {!hasReadCapability(definition.capabilities.read) ? <Result status="403" title="当前平台用户无此页面权限" />
      : query.query.isFetching && !record ? <Spin />
      : query.query.isError || !record ? <Alert type="error" title="数据读取失败" description={query.query.error?.message || '记录不存在'} action={<Button onClick={() => void query.query.refetch()}>重试</Button>} />
      : <>
        <RecordDetailSections groups={fieldsBySection(definition.surface, 'detail').map(group => ({ ...group, fields: group.fields.filter(readable) }))}
          renderValue={field => field.type === 'subtable' ? <SubtableValueDisplay field={field} mobile={variant === 'mobile'} parentRecordId={record.id} />
            : <SurfaceFieldValue field={field} mobile={variant === 'mobile'} resourceCode={definition.code} value={record[field.key]} />} />
        <Collapse className="oxa-audit-collapse" activeKey={auditExpanded ? ['audit'] : []} expandIconPlacement="end"
          onChange={keys => setAuditExpanded((Array.isArray(keys) ? keys : [keys]).includes('audit'))}
          items={[{ key: 'audit', label: '变更记录', children: auditExpanded ? <RecordChangeHistory resourceCode={definition.code} recordId={record.id} surface={definition.surface} readable={readable} /> : null }]} />
        {detailContributions.map(contribution => <Fragment key={contribution.code}>{contribution.render({ record, resource: definition.code, refresh: () => query.query.refetch() })}</Fragment>)}
      </>}
  </RecordDetailFrame>;
}
