import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ImportOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Form, Modal, Select, Space, Table, Typography, Upload } from 'antd';
import dayjs from 'dayjs';
import type { DataResourceSurface } from 'openxiangda-contracts/browser';
import { useMemo, useState } from 'react';
import { commitStandardProcess, transactNativeData } from '../../platform-client';
import { SurfaceFieldControl, SurfaceFieldValue, type SurfaceField } from './SurfaceFields';
import {
  buildResourceImportTemplate,
  parseResourceImportFile,
  resourceImportFieldGuides,
  type ResourceImportPreview,
} from './resource-import';
import {
  launchWorkflowImportRows,
  type WorkflowImportResult,
} from './workflow-resource-import';

type ResourceRecord = Record<string, unknown> & {
  id: string;
  revision: number;
};

export function ResourceImportButton({
  code,
  name,
  surface,
  writableFieldCodes,
  onCompleted,
}: {
  code: string;
  name: string;
  surface: DataResourceSurface;
  writableFieldCodes: string[];
  onCompleted: () => Promise<unknown> | unknown;
}) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ResourceImportPreview>();
  const [parsing, setParsing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const fieldGuides = useMemo(
    () => resourceImportFieldGuides(surface, writableFieldCodes),
    [surface, writableFieldCodes]
  );
  const importableFieldCount = fieldGuides.filter((field) => field.importable).length;
  const excludedFields = fieldGuides.filter((field) => !field.importable);
  const close = () => {
    if (submitting) return;
    setOpen(false);
    setPreview(undefined);
    setIdempotencyKey('');
  };
  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const template = await buildResourceImportTemplate(name, surface, writableFieldCodes);
      const url = URL.createObjectURL(
        new Blob([template.content], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = template.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      message.success('导入模板已下载');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入模板生成失败');
    } finally {
      setDownloading(false);
    }
  };
  const submit = async () => {
    if (!preview?.operations.length || preview.errors.length) return;
    setSubmitting(true);
    try {
      const key = idempotencyKey || crypto.randomUUID();
      if (!idempotencyKey) setIdempotencyKey(key);
      const result = await transactNativeData(preview.operations, key);
      message.success(`已导入 ${result.items.length} 条${name}`);
      await onCompleted();
      setOpen(false);
      setPreview(undefined);
      setIdempotencyKey('');
    } catch (error) {
      message.error(transactionFailureMessage(error, '导入失败'));
    } finally {
      setSubmitting(false);
    }
  };
  const previewColumns = useMemo(
    () => [
      { title: '行号', dataIndex: 'rowNumber', width: 72 },
      ...Object.entries(surface.fields)
        .filter(([code]) => writableFieldCodes.includes(code))
        .map(([fieldCode, field]) => ({
          title: field.label,
          key: fieldCode,
          render: (_: unknown, row: ResourceImportPreview['rows'][number]) => (
            <SurfaceFieldValue field={{ key: fieldCode, ...field }} value={row.data[fieldCode]} />
          ),
        })),
    ],
    [surface.fields, writableFieldCodes]
  );
  return (
    <>
      <Button
        disabled={!importableFieldCount}
        icon={<ImportOutlined />}
        title={!importableFieldCount ? '当前角色没有可通过表格导入的字段' : undefined}
        onClick={() => setOpen(true)}
      >
        导入
      </Button>
      <Modal
        cancelText="取消"
        destroyOnHidden
        okButtonProps={{ disabled: !preview?.operations.length || Boolean(preview.errors.length) }}
        okText={`确认导入${preview?.operations.length ? ` ${preview.operations.length} 条` : ''}`}
        open={open}
        title={`导入${name}`}
        width={960}
        confirmLoading={submitting}
        onCancel={close}
        onOk={() => void submit()}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            description="模板由当前资源的字段类型和新增权限实时生成。请保留表头，在“字段说明”工作表中查看选项、日期、用户、部门及关联资源的填写格式。"
            message="先下载模板，填写后上传预览"
            showIcon
            type="info"
          />
          <Space wrap>
            <Button
              icon={<DownloadOutlined />}
              loading={downloading}
              onClick={() => void downloadTemplate()}
            >
              下载导入模板
            </Button>
            <Typography.Text type="secondary">
              共 {importableFieldCount} 个可导入字段，单次最多 100 行、文件不超过 5MB
            </Typography.Text>
          </Space>
          {excludedFields.length > 0 && (
            <Typography.Text type="secondary">
              {excludedFields.map((field) => field.label).join('、')}需使用平台表单组件录入，模板字段说明中已标注。
            </Typography.Text>
          )}
          <Upload.Dragger
            accept=".csv,.xls,.xlsx"
            beforeUpload={async (file) => {
              setParsing(true);
              setPreview(undefined);
              try {
                setPreview(await parseResourceImportFile(file, code, surface, writableFieldCodes));
                setIdempotencyKey(crypto.randomUUID());
              } finally {
                setParsing(false);
              }
              return Upload.LIST_IGNORE;
            }}
            disabled={parsing || submitting}
            maxCount={1}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽已填写的模板到这里</p>
            <p className="ant-upload-hint">支持 CSV、XLS、XLSX；上传后先校验并预览，不会立即写入数据</p>
          </Upload.Dragger>
          {parsing && <Typography.Text type="secondary">正在解析并校验文件…</Typography.Text>}
          {preview && (
            <>
              <Typography.Text type="secondary">{preview.fileName} · 确认后所有数据将作为一个事务提交</Typography.Text>
            {preview.errors.length > 0 && (
              <Alert
                description={
                  <ul className="oxa-import-errors">
                    {preview.errors.slice(0, 20).map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                    {preview.errors.length > 20 && <li>另有 {preview.errors.length - 20} 个错误</li>}
                  </ul>
                }
                message="请先修正导入文件"
                showIcon
                type="error"
              />
            )}
            <Table
              columns={previewColumns}
              dataSource={preview.rows.slice(0, 20)}
              locale={{ emptyText: '没有可预览的数据' }}
              pagination={false}
              rowKey="rowNumber"
              scroll={{ x: 'max-content', y: 360 }}
              size="small"
            />
            {preview.rows.length > 20 && <Typography.Text type="secondary">仅预览前 20 行</Typography.Text>}
            </>
          )}
        </Space>
      </Modal>
    </>
  );
}

export function WorkflowResourceImportButton({
  code,
  name,
  processOperationCode,
  surface,
  workflowCode,
  writableFieldCodes,
  onCompleted,
}: {
  code: string;
  name: string;
  processOperationCode: string;
  surface: DataResourceSurface;
  workflowCode: string;
  writableFieldCodes: string[];
  onCompleted: () => Promise<unknown> | unknown;
}) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ResourceImportPreview>();
  const [parsing, setParsing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [batchId, setBatchId] = useState('');
  const [results, setResults] = useState<WorkflowImportResult[]>([]);
  const fieldGuides = useMemo(
    () => resourceImportFieldGuides(surface, writableFieldCodes),
    [surface, writableFieldCodes],
  );
  const importableFieldCount = fieldGuides.filter(field => field.importable).length;
  const resultByRow = useMemo(
    () => new Map(results.map(result => [result.rowNumber, result])),
    [results],
  );
  const pendingRows = preview?.rows.filter(
    row => resultByRow.get(row.rowNumber)?.status !== 'accepted',
  ) || [];
  const close = () => {
    if (submitting) return;
    setOpen(false);
    setPreview(undefined);
    setBatchId('');
    setResults([]);
  };
  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const template = await buildResourceImportTemplate(
        `${name}批量发起`,
        surface,
        writableFieldCodes,
      );
      const url = URL.createObjectURL(
        new Blob([template.content], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = template.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      message.success('批量发起模板已下载');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '模板生成失败');
    } finally {
      setDownloading(false);
    }
  };
  const submit = async () => {
    if (!preview || preview.errors.length || !pendingRows.length) return;
    setSubmitting(true);
    const stableBatchId = batchId || crypto.randomUUID();
    if (!batchId) setBatchId(stableBatchId);
    try {
      const completed = await launchWorkflowImportRows({
        rows: preview.rows,
        previousResults: results,
        batchId: stableBatchId,
        workflowCode,
        processOperationCode,
        commit: commitStandardProcess,
      });
      setResults(completed);
      const accepted = completed.filter(result => result.status === 'accepted').length;
      const failed = completed.filter(result => result.status === 'failed').length;
      if (accepted) await onCompleted();
      if (failed) message.warning(`已发起 ${accepted} 条，${failed} 条需要重试`);
      else message.success(`已批量发起 ${accepted} 条${name}申请`);
    } finally {
      setSubmitting(false);
    }
  };
  const previewColumns = useMemo(
    () => [
      { title: '行号', dataIndex: 'rowNumber', width: 72 },
      ...Object.entries(surface.fields)
        .filter(([fieldCode]) => writableFieldCodes.includes(fieldCode))
        .map(([fieldCode, field]) => ({
          title: field.label,
          key: fieldCode,
          render: (_: unknown, row: ResourceImportPreview['rows'][number]) => (
            <SurfaceFieldValue
              field={{ key: fieldCode, ...field }}
              value={row.data[fieldCode]}
            />
          ),
        })),
      {
        title: '发起结果',
        key: 'result',
        width: 180,
        render: (_: unknown, row: ResourceImportPreview['rows'][number]) => {
          const result = resultByRow.get(row.rowNumber);
          if (!result) return <Typography.Text type="secondary">待发起</Typography.Text>;
          return result.status === 'accepted' ? (
            <Typography.Text type="success">已受理</Typography.Text>
          ) : (
            <Typography.Text title={result.message} type="danger">发起失败</Typography.Text>
          );
        },
      },
    ],
    [resultByRow, surface.fields, writableFieldCodes],
  );
  return (
    <>
      <Button
        disabled={!importableFieldCount}
        icon={<ImportOutlined />}
        onClick={() => setOpen(true)}
        title={!importableFieldCount ? '当前流程没有可通过表格录入的字段' : undefined}
      >
        批量发起
      </Button>
      <Modal
        cancelText="关闭"
        confirmLoading={submitting}
        destroyOnHidden
        okButtonProps={{
          disabled:
            !preview?.rows.length ||
            Boolean(preview?.errors.length) ||
            !pendingRows.length,
        }}
        okText={results.length ? `重试失败项（${pendingRows.length}）` : `确认发起${preview?.rows.length ? ` ${preview.rows.length} 条` : ''}`}
        onCancel={close}
        onOk={() => void submit()}
        open={open}
        title={`批量发起${name}申请`}
        width={1040}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            description="文件会先完整校验；确认后每一行都会通过平台标准流程接口独立发起申请，不会直接导入业务数据。失败行可使用原幂等标识重试。"
            message="批量发起流程"
            showIcon
            type="info"
          />
          <Space wrap>
            <Button
              icon={<DownloadOutlined />}
              loading={downloading}
              onClick={() => void downloadTemplate()}
            >
              下载批量发起模板
            </Button>
            <Typography.Text type="secondary">
              单次最多 100 行，同时发起不超过 3 条
            </Typography.Text>
          </Space>
          <Upload.Dragger
            accept=".csv,.xls,.xlsx"
            beforeUpload={async file => {
              setParsing(true);
              setPreview(undefined);
              setResults([]);
              try {
                setPreview(
                  await parseResourceImportFile(
                    file,
                    code,
                    surface,
                    writableFieldCodes,
                  ),
                );
                setBatchId(crypto.randomUUID());
              } finally {
                setParsing(false);
              }
              return Upload.LIST_IGNORE;
            }}
            disabled={parsing || submitting}
            maxCount={1}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">点击或拖拽已填写的模板到这里</p>
            <p className="ant-upload-hint">支持 CSV、XLS、XLSX；上传后先校验并预览</p>
          </Upload.Dragger>
          {parsing && <Typography.Text type="secondary">正在解析并校验文件…</Typography.Text>}
          {preview?.errors.length ? (
            <Alert
              description={
                <ul className="oxa-import-errors">
                  {preview.errors.slice(0, 20).map(error => <li key={error}>{error}</li>)}
                  {preview.errors.length > 20 && <li>另有 {preview.errors.length - 20} 个错误</li>}
                </ul>
              }
              message="请先修正导入文件"
              showIcon
              type="error"
            />
          ) : null}
          {preview ? (
            <Table
              columns={previewColumns}
              dataSource={preview.rows.slice(0, 20)}
              locale={{ emptyText: '没有可预览的数据' }}
              pagination={false}
              rowKey="rowNumber"
              scroll={{ x: 'max-content', y: 360 }}
              size="small"
            />
          ) : null}
          {preview && preview.rows.length > 20 ? (
            <Typography.Text type="secondary">仅预览前 20 行，全部行都会提交</Typography.Text>
          ) : null}
        </Space>
      </Modal>
    </>
  );
}

export function ResourceBatchActions({
  code,
  name,
  surface,
  rows,
  writableFields,
  canDelete,
  onCompleted,
  onClear,
}: {
  code: string;
  name: string;
  surface: DataResourceSurface;
  rows: ResourceRecord[];
  writableFields: SurfaceField[];
  canDelete: boolean;
  onCompleted: () => Promise<unknown> | unknown;
  onClear: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedField, setSelectedField] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  if (!rows.length) return null;
  const submitUpdate = async (values: Record<string, unknown>) => {
    const field = writableFields.find((item) => item.key === selectedField);
    if (!field) return;
    const value = normalizeValue(field, values[selectedField]);
    const changed = rows.filter((row) => !sameValue(row[selectedField], value));
    if (!changed.length) {
      message.info('所选记录的该字段已经是目标值');
      return;
    }
    setSubmitting(true);
    try {
      const key = idempotencyKey || crypto.randomUUID();
      if (!idempotencyKey) setIdempotencyKey(key);
      await transactNativeData(
        changed.map((row) => ({
          operation: 'update',
          resourceCode: code,
          id: row.id,
          expectedRevision: row.revision,
          data: { [selectedField]: value },
        })),
        key
      );
      message.success(`已更新 ${changed.length} 条${name}`);
      await onCompleted();
      onClear();
      setUpdateOpen(false);
      setIdempotencyKey('');
      form.resetFields();
      setSelectedField('');
    } catch (error) {
      message.error(transactionFailureMessage(error, '批量更新失败'));
    } finally {
      setSubmitting(false);
    }
  };
  const submitDelete = async () => {
    setSubmitting(true);
    try {
      const key = idempotencyKey || crypto.randomUUID();
      if (!idempotencyKey) setIdempotencyKey(key);
      await transactNativeData(
        rows.map((row) => ({
          operation: 'delete',
          resourceCode: code,
          id: row.id,
          expectedRevision: row.revision,
        })),
        key
      );
      message.success(`已删除 ${rows.length} 条${name}`);
      await onCompleted();
      onClear();
      setDeleteOpen(false);
      setIdempotencyKey('');
    } catch (error) {
      message.error(transactionFailureMessage(error, '批量删除失败'));
    } finally {
      setSubmitting(false);
    }
  };
  const field = writableFields.find((item) => item.key === selectedField);
  return (
    <>
      <div className="oxa-batch-bar">
        <Typography.Text>已选择 {rows.length} 条</Typography.Text>
        <Space>
          {writableFields.length > 0 && (
            <Button icon={<EditOutlined />} onClick={() => setUpdateOpen(true)}>
              批量修改
            </Button>
          )}
          {canDelete && (
            <Button danger icon={<DeleteOutlined />} onClick={() => setDeleteOpen(true)}>
              批量删除
            </Button>
          )}
          <Button onClick={onClear} type="link">
            取消选择
          </Button>
        </Space>
      </div>
      <Modal
        cancelText="取消"
        okText="确认修改"
        open={updateOpen}
        title={`批量修改 ${rows.length} 条${name}`}
        confirmLoading={submitting}
        onCancel={() => !submitting && setUpdateOpen(false)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void submitUpdate(values as Record<string, unknown>)}
          onValuesChange={() => setIdempotencyKey('')}
        >
          <Form.Item label="修改字段" required>
            <Select
              options={writableFields.map((item) => ({
                label: item.label,
                value: item.key,
              }))}
              placeholder="选择要统一修改的字段"
              value={selectedField || undefined}
              onChange={(value) => {
                form.resetFields();
                setSelectedField(value);
                setIdempotencyKey('');
              }}
            />
          </Form.Item>
          {field && (
            <SurfaceFieldControl
              disabled={false}
              field={{ ...field, requiredHint: true }}
              operation="update"
              resourceCode={code}
            />
          )}
        </Form>
      </Modal>
      <Modal
        cancelText="取消"
        okButtonProps={{ danger: true }}
        okText="确认删除"
        open={deleteOpen}
        title={`删除 ${rows.length} 条${name}`}
        confirmLoading={submitting}
        onCancel={() => !submitting && setDeleteOpen(false)}
        onOk={() => void submitDelete()}
      >
        <Alert description="任意一条记录发生权限或版本冲突时，本次删除将全部回滚。" message="删除后不可恢复" showIcon type="warning" />
      </Modal>
    </>
  );
}

function normalizeValue(field: SurfaceField, value: unknown) {
  if (field.widget !== 'date' && field.widget !== 'datetime') return value;
  if (!value) return value;
  return field.widget === 'datetime' ? dayjs(value as never).toISOString() : dayjs(value as never).format('YYYY-MM-DD');
}

function sameValue(left: unknown, right: unknown) {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function transactionFailureMessage(error: unknown, fallback: string) {
  const index = Number((error as any)?.data?.operationIndex);
  const message = error instanceof Error ? error.message : fallback;
  return Number.isSafeInteger(index) && index >= 0 ? `第 ${index + 1} 条操作失败：${message}` : message;
}
