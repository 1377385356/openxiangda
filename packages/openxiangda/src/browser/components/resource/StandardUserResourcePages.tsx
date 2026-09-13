import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useList, useOne } from '@refinedev/core';
import { Button, Drawer, Empty, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DataResourceSurface } from 'openxiangda-contracts/browser';
import { useRuntime } from '../../runtime';
import { useResourceDefinitions } from '../../resource-definitions';
import { GeneratedResourceFormPage } from './GeneratedResourceForm';
import { MobileResourceListPage, ResourceListPage } from './StandardResourcePages';
import { listSurfaceFields, SurfaceFieldValue } from './SurfaceFields';
import type { GeneratedResourceDefinition } from './generated-resource-definition';

/**
 * “我的记录”标准用户页：默认只显示当前登录用户创建的记录。
 * 展示过滤不是授权边界；行级只读隔离仍由平台 dataPolicies 声明承担。
 */
export function StandardUserRecordsPage({
  resourceCode,
  variant,
  labels,
  submitPath,
}: {
  resourceCode: string;
  variant: 'desktop' | 'mobile';
  labels: { list: string; submit: string };
  submitPath: string;
}) {
  const definitions = useResourceDefinitions();
  const definition = definitions[resourceCode];
  if (!definition) {
    return <Empty description={`应用未声明资源 ${resourceCode}`} />;
  }
  return <StandardUserRecordsWithRuntime
      resourceCode={resourceCode}
      variant={variant}
      labels={labels}
      submitPath={submitPath}
    />;
}

function StandardUserRecordsWithRuntime({
  resourceCode,
  variant,
  labels,
  submitPath,
}: {
  resourceCode: string;
  variant: 'desktop' | 'mobile';
  labels: { list: string; submit: string };
  submitPath: string;
}) {
  const { identity, hasCapability } = useRuntime();
  const definitions = useResourceDefinitions();
  const definition = definitions[resourceCode]!;
  const navigate = useNavigate();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  return (
    <>
    <StandardUserRecordsView
      definition={definition}
      variant={variant}
      labels={labels}
      submitPath={submitPath}
      canSubmit={hasCapability(definition.capabilities.create)}
      currentUserId={identity?.userId || ''}
      onOpenDetail={(id: string) => {
        setDetailId(id);
        setDetailOpen(true);
      }}
      onSubmit={() => navigate(submitPath)}
    />
    <StandardUserRecordDetailDrawer
      definition={definition}
      recordId={detailOpen ? detailId : null}
      open={detailOpen}
      onClose={() => setDetailOpen(false)}
    />
    </>
  );
}

function StandardUserRecordsView({
  definition,
  variant,
  labels,
  submitPath,
  canSubmit,
  currentUserId,
  onOpenDetail,
  onSubmit,
}: {
  definition: GeneratedResourceDefinition;
  variant: 'desktop' | 'mobile';
  labels: { list: string; submit: string };
  submitPath: string;
  canSubmit: boolean;
  currentUserId: string;
  onOpenDetail: (id: string) => void;
  onSubmit: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const surface = definition.surface as DataResourceSurface;
  const listFields = surface.list?.fieldOrder?.length
    ? surface.list.fieldOrder
    : listSurfaceFields(surface.fields).map(field => field.key);
  const list = useList({
    resource: definition.code,
    pagination: { currentPage: page, pageSize },
    meta: {
      query: currentUserId
        ? { createdBy: currentUserId }
        : undefined,
    },
  });
  const rows = (list.result.data || []) as Array<Record<string, unknown>>;
  const total = list.result.total || 0;
  const listError = list.query.error;
  const refresh = (
    <Button
      aria-label="刷新数据"
      icon={<ReloadOutlined />}
      loading={list.query.isFetching}
      onClick={() => void list.query.refetch()}
      size="small"
    >
      刷新
    </Button>
  );
  const submitEntry = canSubmit ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={onSubmit}>
      {labels.submit}
    </Button>
  ) : null;
  const title = `${labels.list}${total ? `（${total}）` : ''}`;

  if (variant === 'mobile') {
    return (
      <MobileResourceListPage
        readCapability={definition.capabilities.read}
        resource={definition.code}
        surface={surface}
        title={labels.list}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Typography.Text strong>{title}</Typography.Text>
            <Space>
              {refresh}
              {submitEntry}
            </Space>
          </Space>
          {rows.length === 0 && !list.query.isLoading ? (
            <Empty description={`暂无${labels.list}`} />
          ) : (
            rows.map(record => (
              <RecordCard
                key={String(record.id)}
                definition={definition}
                fields={listFields}
                record={record}
                onOpen={onOpenDetail}
              />
            ))
          )}
          <MobilePager
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={(next: number, size: number) => {
              setPage(next);
              setPageSize(size);
            }}
          />
        </Space>
      </MobileResourceListPage>
    );
  }

  const columns: TableColumnsType<Record<string, unknown>> = [
    ...listFields.map(code => ({
      title: surface.fields[code]?.label || code,
      dataIndex: code,
      key: code,
      render: (value: unknown) => (
        <SurfaceFieldValue
          field={{ key: code, ...surface.fields[code]! }}
          value={value}
          resourceCode={definition.code}
          presentation="default"
        />
      ),
    })),
  ];
  return (
    <ResourceListPage
      readCapability={definition.capabilities.read}
      resource={definition.code}
      surface={surface}
      title={labels.list}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {labels.list}
          </Typography.Title>
          <Space>
            {refresh}
            {submitEntry}
          </Space>
        </Space>
        <Table
          columns={columns}
          dataSource={rows}
          loading={list.query.isLoading}
          onRow={(record: Record<string, unknown>) => ({
            onClick: () => onOpenDetail(String(record.id)),
            style: { cursor: 'pointer' },
          })}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: false,
            onChange: (next: number, size: number) => {
              setPage(next);
              setPageSize(size);
            },
          }}
          rowKey="id"
          size="middle"
        />
      </Space>
    </ResourceListPage>
  );
}

function MobilePager({
  current,
  pageSize,
  total,
  onChange,
}: {
  current: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <Space style={{ justifyContent: 'center', width: '100%' }}>
      <Button disabled={current <= 1} onClick={() => onChange(current - 1, pageSize)} size="small">
        上一页
      </Button>
      <Typography.Text>
        {current} / {pages}
      </Typography.Text>
      <Button disabled={current >= pages} onClick={() => onChange(current + 1, pageSize)} size="small">
        下一页
      </Button>
    </Space>
  );
}

function RecordCard({
  definition,
  fields,
  record,
  onOpen,
}: {
  definition: GeneratedResourceDefinition;
  fields: string[];
  record: Record<string, unknown>;
  onOpen: (id: string) => void;
}) {
  const surface = definition.surface as DataResourceSurface;
  return (
    <Button block onClick={() => onOpen(String(record.id))} style={{ textAlign: 'left', height: 'auto', padding: 12 }}>
      <Space direction="vertical" size={2} style={{ width: '100%' }}>
        {fields.slice(0, 3).map(code => (
          <Space key={code} size="small" wrap>
            <Typography.Text type="secondary">{surface.fields[code]?.label || code}：</Typography.Text>
            <SurfaceFieldValue
              field={{ key: code, ...surface.fields[code]! }}
              value={record[code]}
              resourceCode={definition.code}
              presentation="default"
              mobile
            />
          </Space>
        ))}
      </Space>
    </Button>
  );
}

/** “提交”标准用户页：复用生成表单，成功后回到我的记录。 */
export function StandardUserSubmitPage({
  resourceCode,
  variant,
  listPath,
}: {
  resourceCode: string;
  variant: 'desktop' | 'mobile';
  listPath: string;
}) {
  const definitions = useResourceDefinitions();
  const definition = definitions[resourceCode];
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  if (!definition) {
    return <Empty description={`应用未声明资源 ${resourceCode}`} />;
  }
  return <StandardUserSubmitInner definition={definition} variant={variant} listPath={listPath} />;
}

function StandardUserSubmitInner({
  definition,
  variant,
  listPath,
}: {
  definition: GeneratedResourceDefinition;
  variant: 'desktop' | 'mobile';
  listPath: string;
}) {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  if (saved) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <Empty description="提交成功" />
        <Button type="primary" onClick={() => navigate(listPath)} style={{ marginTop: 16 }}>
          返回我的记录
        </Button>
      </div>
    );
  }
  return (
    <GeneratedResourceFormPage
      definition={definition}
      mode="create"
      variant={variant}
      paths={{ list: listPath, fallback: listPath }}
      onSaved={() => setSaved(true)}
    />
  );
}

/** 详情抽屉：按声明字段只读渲染当前记录。 */
export function StandardUserRecordDetailDrawer({
  definition,
  recordId,
  open,
  onClose,
}: {
  definition: GeneratedResourceDefinition;
  recordId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const query = useOne({
    resource: definition.code,
    id: recordId || '',
    queryOptions: { enabled: open && Boolean(recordId), retry: false },
  });
  const record = query.result as Record<string, unknown> | undefined;
  const surface = definition.surface as DataResourceSurface;
  const detailFields = surface.detail?.fieldOrder?.length
    ? surface.detail.fieldOrder
    : listSurfaceFields(surface.fields).map(field => field.key);
  return (
    <Drawer open={open} onClose={onClose} title={definition.name} width={520}>
      {record ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {detailFields.map(code => (
            <div key={code}>
              <Typography.Text type="secondary">
                {surface.fields[code]?.label || code}
              </Typography.Text>
              <div>
                <SurfaceFieldValue
                  field={{ key: code, ...surface.fields[code]! }}
                  value={record[code]}
                  resourceCode={definition.code}
                />
              </div>
            </div>
          ))}
          {record.revision ? (
            <Tag style={{ marginTop: 8 }}>版本 {String(record.revision)}</Tag>
          ) : null}
        </Space>
      ) : (
        <Empty />
      )}
    </Drawer>
  );
}


/** 懒加载入口：按清单 kind 装配“我的记录”或“提交”页。 */
export function StandardUserResourceBundle({
  kind,
  resourceCode,
  variant,
  listPath,
  submitPath,
}: {
  kind: 'resource-records' | 'resource-submit';
  resourceCode: string;
  variant: 'desktop' | 'mobile';
  listPath: string;
  submitPath: string;
}) {
  const definitions = useResourceDefinitions();
  const definition = definitions[resourceCode];
  if (kind === 'resource-submit') {
    return (
      <StandardUserSubmitPage
        resourceCode={resourceCode}
        variant={variant}
        listPath={listPath}
      />
    );
  }
  return (
    <StandardUserRecordsPage
      resourceCode={resourceCode}
      variant={variant}
      labels={{ list: listLabel(definition), submit: submitLabel(definition) }}
      submitPath={submitPath}
    />
  );
}

function listLabel(definition: GeneratedResourceDefinition | undefined) {
  return definition ? `我的${definition.name}` : '我的记录';
}
function submitLabel(definition: GeneratedResourceDefinition | undefined) {
  return definition ? `新建${definition.name}` : '新建';
}
