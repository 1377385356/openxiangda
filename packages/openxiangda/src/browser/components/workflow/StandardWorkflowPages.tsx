import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  EllipsisOutlined,
  ReloadOutlined,
  CloseOutlined,
  ExpandOutlined,
  CompressOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Result,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from 'antd';
import type {
  WorkflowInstance,
  WorkflowBusinessDetail,
  WorkflowCommandResult,
  WorkflowDetailSurfaceV2,
  WorkflowLaunchSurface,
  WorkflowOperationSurface,
  WorkflowPreparationRequirement,
  ProcessCommandSurface,
  WorkflowSurface,
  WorkflowTask,
  WorkflowWorkCenterItem,
  WorkflowTimeline,
  WorkflowTimelineDisplayEntry,
  ResourceReferenceValue,
  WorkflowNamedOperationLaunchIntent,
} from 'openxiangda-contracts/browser';
import {
  normalizeWorkflowBusinessDetail,
} from 'openxiangda-contracts/browser';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Link,
  Navigate,
  useHref,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { PlatformDirectoryPicker } from '../platform-fields/PlatformDirectoryPicker';
import { directoryStoredValues, type DirectoryStoredValue } from '../platform-fields/directory-value';
import {
  executeWorkflowOperation,
  executeWorkflowLaunchNamedOperation,
  loadWorkflowInstanceDetail,
  loadWorkflowRecordDetail,
  loadWorkflowDataAudit,
  loadWorkflowInstanceSurface,
  loadWorkflowLaunchSurface,
  loadWorkflowTaskSurface,
  loadWorkflowTaskDetail,
  loadWorkflowWorkCenter,
  answerBusinessProcessCommand,
  commitStandardProcess,
  createNativeResourceClient,
  loadProcessCommandSurface,
  retryBusinessProcessCommand,
  uploadOperationManagedFile,
  type WorkflowWorkCenterPage as WorkflowWorkCenterResult,
} from '../../platform-client';
import {
  useWorkflowDefinition,
  type GeneratedWorkflowNamedOperationIntent,
} from '../../workflow-definitions';
import { useResourceDefinitions } from '../../resource-definitions';
import { selectedSurfaceFields } from '../resource/resource-field-selection';
import type { GeneratedResourceDefinition } from '../resource/generated-resource-definition';
import { useRuntime } from '../../runtime';
import {
  MobileSurfaceFieldControl,
  SurfaceFieldControl,
  SurfaceFieldValue,
  type SurfaceField,
  type SurfaceFieldRenderers,
} from '../resource/SurfaceFields';
import {
  workflowContextScalarValue,
  processStatusReadRetryDelay,
  buildWorkflowNamedOperationInput,
  parseWorkflowNamedOperationResult,
  workflowLaunchContractJsonEqual,
} from '../../workflow-launch';
import {
  normalizeFormValues,
  normalizeRecordForForm,
} from '../platform-fields/field-form-codec';
import { RecordDetailFrame, RecordDetailSections, detailTime } from '../resource/RecordDetailFrame';
import { RecordChangeHistory } from '../resource/RecordChangeHistory';
import { ResourceFormContent, type ResourceFormDrawerState } from '../resource/ResourceFormFrame';
import { WorkflowRecordEditor } from './WorkflowRecordEditor';
import { PlatformAvatar } from '../PlatformAvatar';

type PageVariant = 'desktop' | 'mobile';
export type WorkflowPageVariant = PageVariant;
type JsonObject = Record<string, unknown>;

export type WorkflowSurfaceKind = 'task' | 'instance';

/**
 * An advanced task command has completed the current task and may have
 * created a new task. Reading the old task Surface in that case is expected
 * to fail, so only instance commands and non-advanced task commands refresh a
 * Surface through the current identifier.
 */
export function shouldRefreshWorkflowSurface(
  kind: WorkflowSurfaceKind,
  result: WorkflowCommandResult,
) {
  return kind === 'instance' || result.advanced !== true;
}

/**
 * Apply the command-completion lifecycle shared by the standard and
 * embeddable Workflow panels. The explicit command callback always receives
 * the platform result; the legacy Surface callback only runs when a valid
 * current Surface was refreshed.
 */
export async function completeWorkflowCommand(
  kind: WorkflowSurfaceKind,
  result: WorkflowCommandResult,
  options: {
    refresh: () => Promise<WorkflowSurface | null>;
    onCommandCompleted?: (
      result: WorkflowCommandResult,
    ) => void | Promise<void>;
    onCompleted?: (
      surface: WorkflowSurface,
      result?: WorkflowCommandResult,
    ) => void | Promise<void>;
  },
): Promise<WorkflowSurface | null> {
  const refreshSurface = shouldRefreshWorkflowSurface(kind, result);
  const nextSurface = refreshSurface ? await options.refresh() : null;
  await options.onCommandCompleted?.(result);
  if (nextSurface) await options.onCompleted?.(nextSurface, result);
  return nextSurface;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function randomId(prefix: string) {
  const suffix =
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${prefix}:${suffix}`;
}

function formatTime(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf())
    ? String(value)
    : date.toLocaleString('zh-CN');
}

function workflowStatus(status: string) {
  const states: Record<string, { label: string; color: string }> = {
    assignment_pending: { label: '待分配', color: 'orange' },
    assigned: { label: '待处理', color: 'gold' },
    active: { label: '审批中', color: 'processing' },
    waiting: { label: '待处理', color: 'default' },
    running: { label: '审批中', color: 'processing' },
    returned: { label: '已退回', color: 'orange' },
    completed: { label: '已完成', color: 'success' },
    approved: { label: '已同意', color: 'success' },
    rejected: { label: '已拒绝', color: 'error' },
    withdrawn: { label: '已撤回', color: 'default' },
    terminated: { label: '已终止', color: 'error' },
    cancelled: { label: '已取消', color: 'default' },
    expired: { label: '已过期', color: 'default' },
    error: { label: '异常', color: 'error' },
  };
  return states[status] || { label: status || '未知', color: 'default' };
}

function workflowHasEnded(instance: WorkflowInstance) {
  return ['completed', 'approved', 'rejected', 'withdrawn', 'terminated', 'cancelled', 'expired'].includes(instance.status);
}

function StatusTag({ status }: { status: string }) {
  const state = workflowStatus(status);
  return <Tag color={state.color}>{state.label}</Tag>;
}

function surfaceInstance(surface: WorkflowSurface) {
  return surface.instance as WorkflowInstance;
}

function surfaceTask(surface: WorkflowSurface) {
  return surface.task as WorkflowTask | null;
}

function workflowSurfaceTaskId(surface: WorkflowSurface | null | undefined) {
  const task = surface?.task as { id?: unknown } | null | undefined;
  const taskId = typeof task?.id === 'string' ? task.id.trim() : '';
  return taskId || null;
}

function workflowSurfaceMatchesTask(
  surface: WorkflowSurface | null | undefined,
  taskId: string,
) {
  const normalizedTaskId = taskId.trim();
  return Boolean(
    normalizedTaskId && workflowSurfaceTaskId(surface) === normalizedTaskId,
  );
}

function workflowSurfaceInstanceId(surface: WorkflowSurface | null | undefined) {
  const instance = surface?.instance as { id?: unknown } | null | undefined;
  const instanceId = typeof instance?.id === 'string' ? instance.id : '';
  return instanceId || null;
}

function workflowSurfaceMatchesInstance(
  surface: WorkflowSurface | null | undefined,
  instanceId: string,
) {
  const normalizedInstanceId = instanceId.trim();
  return Boolean(
    normalizedInstanceId &&
      workflowSurfaceInstanceId(surface) === normalizedInstanceId,
  );
}

function surfaceBusinessDetail(surface: WorkflowSurface): WorkflowBusinessDetail {
  return normalizeWorkflowBusinessDetail(surface.presentation.businessDetail);
}

function workflowOperationSignature(operation: WorkflowOperationSurface) {
  return JSON.stringify({
    key: operation.key,
    kind: operation.kind,
    label: operation.label,
    placement: operation.placement,
    group: operation.group,
    audience: operation.audience,
    emphasis: operation.emphasis,
    tone: operation.tone,
    visible: operation.visible,
    enabled: operation.enabled,
    disabledReason: operation.disabledReason,
    inputSchema: operation.inputSchema,
    uiSchema: operation.uiSchema,
    execute: operation.execute,
    refresh: operation.refresh,
  });
}

const WORKFLOW_APP_ACTION_DISABLED_REASON = '应用动作由应用页面负责';

function standardWorkflowOperations(surface: WorkflowSurface) {
  if (
    !surface.commandToken ||
    !surface.commandTokenExpiresAt ||
    new Date(surface.commandTokenExpiresAt).getTime() <= Date.now()
  ) {
    return [];
  }
  return surface.operations
    .filter((operation) => operation.visible)
    .map((operation) => {
      if (operation.kind !== 'app_action') return operation;
      return {
        ...operation,
        enabled: false,
        disabledReason: operation.disabledReason
          ? `${WORKFLOW_APP_ACTION_DISABLED_REASON}：${operation.disabledReason}`
          : WORKFLOW_APP_ACTION_DISABLED_REASON,
      };
    });
}

function workflowDetailGroups(detail: WorkflowBusinessDetail) {
  const order = detail.surface?.detail?.fieldOrder || [];
  const groups = new Map<string, SurfaceField[]>();
  for (const key of order) {
    const field = detail.surface?.fields[key];
    if (!field || field.system === true) continue;
    const section = field.section || '申请信息';
    groups.set(section, [
      ...(groups.get(section) || []),
      { key, ...field },
    ]);
  }
  return [...groups.entries()].map(([section, fields]) => ({ section, fields }));
}

function workflowBusinessRecordPath(
  surface: WorkflowSurface,
  variant: PageVariant,
) {
  const target = surface.navigationTarget;
  if (!target || target.kind !== 'resource_record') return null;
  return variant === 'mobile' ? target.mobilePath : target.desktopPath;
}

function WorkflowSubtableValue({
  detail,
  field,
  instanceId,
  variant,
}: {
  detail: WorkflowBusinessDetail;
  field: SurfaceField;
  instanceId: string;
  variant: PageVariant;
}) {
  const subtable = detail.subtables[field.key];
  if (!subtable?.rows.length) return <Typography.Text type="secondary">暂无明细</Typography.Text>;
  const order = subtable.surface.detail?.fieldOrder || [];
  const fields = order.flatMap((key) => {
    const item = subtable.surface.fields[key];
    return item && item.system !== true
      ? [{ key, ...item } as SurfaceField]
      : [];
  });
  if (variant === 'mobile') {
    return (
      <div className="oxa-workflow-subtable-mobile">
        {subtable.rows.map((row, index) => (
          <div key={String(row.id || index)}>
            <strong>明细 {index + 1}</strong>
            {fields.map((child) => (
              <div key={child.key}>
                <Typography.Text type="secondary">{child.label}</Typography.Text>
                <SurfaceFieldValue
                  field={child}
                  mobile
                  presentation="workflow-detail"
                  resourceCode={subtable.resourceCode}
                  value={row[child.key]}
                  workflowFileBinding={{
                    instanceId,
                    resourceCode: subtable.resourceCode,
                    recordId: String(row.id),
                    fieldCode: child.key,
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  return (
    <Table
      columns={fields.map((child) => ({
        key: child.key,
        dataIndex: child.key,
        title: child.label,
        render: (value: unknown, row: Record<string, unknown>) => (
          <SurfaceFieldValue
            field={child}
            presentation="workflow-detail"
            resourceCode={subtable.resourceCode}
            value={value}
            workflowFileBinding={{
              instanceId,
              resourceCode: subtable.resourceCode,
              recordId: String(row.id),
              fieldCode: child.key,
            }}
          />
        ),
      }))}
      dataSource={subtable.rows}
      pagination={false}
      rowKey={(row) => String(row.id)}
      scroll={{ x: 'max-content' }}
      size="small"
    />
  );
}

export function WorkflowBusinessDetailSections({
  surface,
  variant,
}: {
  surface: WorkflowSurface;
  variant: PageVariant;
}) {
  const detail = surfaceBusinessDetail(surface);
  const instance = surfaceInstance(surface);
  const groups = workflowDetailGroups(detail);
  if (detail.status === 'missing') {
    return <Result status="404" title="业务记录已不存在" />;
  }
  if (detail.status === 'forbidden') {
    return <Result status="403" title="你无权查看该审批的业务详情" />;
  }
  const businessRecordPath =
    detail.status === 'unavailable'
      ? workflowBusinessRecordPath(surface, variant)
      : null;
  if (businessRecordPath) {
    return (
      <Result
        status="info"
        title="业务详情可在原始记录中查看"
        subTitle="该审批创建时间较早，业务信息已保留，可前往对应业务记录查看完整详情。"
        extra={(
          <Link to={businessRecordPath}>
            <Button type="primary">查看业务详情</Button>
          </Link>
        )}
      />
    );
  }
  if (detail.status === 'unavailable' || !detail.surface) {
    return <Result status="warning" title="业务详情暂时不可用" />;
  }
  return <RecordDetailSections groups={groups} renderValue={field => field.type === 'subtable'
    ? <WorkflowSubtableValue detail={detail} field={field} instanceId={instance.id} variant={variant} />
    : <SurfaceFieldValue field={field} presentation="workflow-detail" mobile={variant === 'mobile'}
        resourceCode={detail.resourceCode || undefined} value={detail.record[field.key]}
        workflowFileBinding={{ instanceId: instance.id, resourceCode: String(detail.resourceCode), recordId: String(detail.recordId), fieldCode: field.key }} />} />;
}

function timelineTone(status: WorkflowTimelineDisplayEntry['status']) {
  return `is-${status}`;
}

function workflowTimelineEntries(
  timeline: WorkflowTimeline | null,
): WorkflowTimelineDisplayEntry[] {
  if (timeline?.display?.entries?.length) return timeline.display.entries;
  return (timeline?.flow || []).map((item) => ({
    key: item.key,
    kind: item.key.startsWith('planned:') ? 'planned_node' : item.kind === 'start' ? 'submission' : 'node',
    nodeId: item.nodeId,
    nodeKind: item.kind,
    title: item.title,
    status: item.status,
    enteredAt: item.startedAt,
    leftAt: item.completedAt,
    primaryDisplayTime:
      item.operations.at(-1)?.createdAt || item.completedAt || item.startedAt,
    people: item.assignees.map((person) => ({
      userId: person.userId,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl || null,
      departmentDisplayName: person.departmentDisplayName || null,
    })),
    operations: item.operations.map((operation) => ({
      id: operation.id,
      operation: operation.operation,
      operationLabel: operation.operationLabel,
      actor: {
        userId: operation.actorUserId,
        displayName: operation.actorDisplayName,
        avatarUrl: operation.actorAvatarUrl || null,
        departmentDisplayName:
          operation.actorDepartmentDisplayName || null,
      },
      actingForUserId: operation.actingForUserId,
      reason: operation.reason,
      severity: operation.severity,
      occurredAt: operation.createdAt,
    })),
    result: item.result || {},
    terminalReason: null,
  }));
}

function visibleWorkflowTimelinePeople(
  item: WorkflowTimelineDisplayEntry,
  operations: WorkflowTimelineDisplayEntry['operations'],
) {
  const operationActors = new Set(
    operations.map((operation) => operation.actor.userId),
  );
  if (
    operations.length > 0 &&
    item.status !== 'active' &&
    item.status !== 'waiting'
  ) {
    return [];
  }
  return item.people.filter(
    (assignee) => !operationActors.has(assignee.userId),
  );
}

export function WorkflowStatusIcon({
  status,
}: {
  status: WorkflowTimelineDisplayEntry['status'];
}) {
  let glyph;
  if (status === 'completed') {
    glyph = (
      <>
        <circle cx="12" cy="12" r="9" />
        <path
          className="oxa-workflow-status-icon-contrast"
          d="M7.5 12.5l3 3 6-7"
        />
      </>
    );
  } else if (status === 'active') {
    glyph = (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle
          className="oxa-workflow-status-icon-center"
          cx="12"
          cy="12"
          r="2.25"
        />
      </>
    );
  } else if (status === 'waiting') {
    glyph = <circle cx="12" cy="12" r="9" />;
  } else if (status === 'returned' || status === 'withdrawn') {
    glyph = (
      <>
        <path d="M9 7H5V3" />
        <path d="M5 7a8 8 0 1 1-1 8" />
      </>
    );
  } else if (status === 'rejected' || status === 'error') {
    glyph = (
      <>
        <circle cx="12" cy="12" r="9" />
        <path
          className="oxa-workflow-status-icon-contrast"
          d="M8 8l8 8M16 8l-8 8"
        />
      </>
    );
  } else {
    glyph = (
      <>
        <circle cx="12" cy="12" r="9" />
        <path
          className="oxa-workflow-status-icon-contrast"
          d="M8 12h8"
        />
      </>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className={`oxa-workflow-status-icon is-${status}`}
      viewBox="0 0 24 24"
    >
      {glyph}
    </svg>
  );
}

export function WorkflowTimelineSection({
  timeline,
}: {
  timeline: WorkflowTimeline | null;
}) {
  const entries = workflowTimelineEntries(timeline);
  return (
    <Card className="oxa-workflow-timeline-card" title="审批流程">
      {entries.length ? (
        <div className="oxa-workflow-timeline">
          {entries.map((item) => {
            const operations = item.operations || [];
            const visiblePeople = visibleWorkflowTimelinePeople(item, operations);
            return (
            <div className={timelineTone(item.status)} key={item.key}>
              <span className="oxa-workflow-timeline-dot">
                <WorkflowStatusIcon status={item.status} />
              </span>
              <div>
                <div className="oxa-workflow-timeline-title">
                  <strong>{item.title}</strong>
                  <StatusTag status={item.status} />
                </div>
                {visiblePeople.length > 0 && (
                  <div className="oxa-workflow-timeline-assignees">
                    {visiblePeople.map((person, index) => (
                      <div key={`${person.userId || person.displayName}:${index}`}>
                        <PlatformAvatar avatarUrl={person.avatarUrl} size={20} />
                        <span>
                          <Typography.Text>{person.displayName}</Typography.Text>
                          {person.departmentDisplayName && (
                            <small>{person.departmentDisplayName}</small>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {operations.length > 0 && (
                  <div className="oxa-workflow-timeline-operations">
                    {operations.map((operation) => (
                      <div key={operation.id}>
                        <PlatformAvatar avatarUrl={operation.actor.avatarUrl} size={20} />
                        <span className="oxa-workflow-operation-content">
                          <span>
                            <Typography.Text>{operation.actor.displayName}</Typography.Text>
                            <strong>{operation.operationLabel}</strong>
                          </span>
                          {operation.reason && (
                            <span className="oxa-workflow-operation-opinion">
                              <Typography.Text type="secondary">意见</Typography.Text>
                              <Typography.Text>{operation.reason}</Typography.Text>
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {item.terminalReason && !operations.some(operation => operation.reason) && (
                  <Typography.Text type="secondary">
                    原因：{item.terminalReason}
                  </Typography.Text>
                )}
                {item.primaryDisplayTime && (
                  <time className="oxa-workflow-primary-time">
                    {formatTime(item.primaryDisplayTime)}
                  </time>
                )}
              </div>
            </div>
            );
          })}
        </div>
      ) : (
        <Empty
          description="暂无流程轨迹"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
    </Card>
  );
}

function WorkflowMemberPicker({ id, placeholder, value, onChange, multiple = false, variant }: {
  id?: string; placeholder?: string; value?: string | string[];
  onChange?: (value: string | string[] | undefined) => void;
  multiple?: boolean; variant: PageVariant;
}) {
  const [snapshots, setSnapshots] = useState<DirectoryStoredValue[]>([]);
  const ids = Array.isArray(value) ? value : value ? [value] : [];
  const selected = ids.map(id => snapshots.find(item => item.value === id) || { value: id, label: '已选成员' });
  return <PlatformDirectoryPicker id={id} kind="user" mobile={variant === 'mobile'}
    multiple={multiple} placeholder={placeholder || '请选择成员'}
    value={multiple ? selected : selected[0]} onChange={next => {
      const items = directoryStoredValues(next);
      setSnapshots(items);
      onChange?.(multiple ? items.map(item => item.value) : items[0]?.value);
    }} />;
}

function schemaProperties(operation: WorkflowOperationSurface) {
  const schema = operation.inputSchema as {
    required?: string[];
    properties?: Record<
      string,
      {
        type?: string;
        title?: string;
        format?: string;
        maxLength?: number;
        minItems?: number;
        maxItems?: number;
        enum?: string[];
        enumNames?: string[];
        default?: unknown;
      }
    >;
  };
  const ui = operation.uiSchema as {
    properties?: Record<string, { component?: string; placeholder?: string; mode?: string }>;
  };
  return Object.entries(schema.properties || {}).map(([key, property]) => ({
    key,
    property,
    ui: ui.properties?.[key] || {},
    required: schema.required?.includes(key) === true,
  }));
}

function OperationFields({
  operation, variant,
}: {
  operation: WorkflowOperationSurface; variant: PageVariant;
}) {
  return (
    <>
      {schemaProperties(operation).map(({ key, property, required, ui }) => {
        const rules = [
          ...(required ? [{ required: true, message: `请填写${property.title || key}` }] : []),
          ...(property.type === 'array' ? [{ validator: async (_rule: unknown, value: unknown) => {
            if (value == null && !required) return;
            if (!Array.isArray(value) || value.length < (property.minItems ?? 0) || value.length > (property.maxItems ?? 200)) {
              throw new Error(`请选择 ${property.minItems ?? 0} 至 ${property.maxItems ?? 200} 位人员`);
            }
          } }] : []),
        ];
        let control = <Input placeholder={ui.placeholder} />;
        if (ui.component === 'user_select') control = <WorkflowMemberPicker variant={variant} multiple={property.type === 'array' || ui.mode === 'multiple'} placeholder={ui.placeholder || `请选择${property.title || '成员'}`} />;
        else if (property.enum) {
          control = (
            <Select
              options={property.enum.map((value, index) => ({
                label: property.enumNames?.[index] || value,
                value,
              }))}
            />
          );
        } else if (property.format === 'textarea') {
          control = (
            <Input.TextArea
              autoSize={{ minRows: 4, maxRows: 8 }}
              maxLength={property.maxLength}
              showCount
            />
          );
        } else if (property.format === 'date-time') {
          control = <Input type="datetime-local" />;
        }
        return (
          <Form.Item
            initialValue={property.default}
            key={key}
            label={property.title || key}
            name={key}
            rules={rules}
          >
            {control}
          </Form.Item>
        );
      })}
    </>
  );
}

function OperationDialog({
  operation,
  submitting,
  variant,
  onCancel,
  onSubmit,
}: {
  operation: WorkflowOperationSurface | null;
  submitting: boolean;
  variant: PageVariant;
  onCancel: () => void;
  onSubmit: (values: JsonObject) => void;
}) {
  const [form] = Form.useForm<JsonObject>();
  useEffect(() => {
    form.resetFields();
  }, [form, operation]);
  if (!operation) return null;
  const ui = operation.uiSchema as {
    confirmText?: string;
    confirmation?: { description?: string };
  };
  const formNode = (
    <Form form={form} layout="vertical" onFinish={onSubmit}>
      {ui.confirmation?.description && (
        <Alert
          className="oxa-workflow-operation-alert"
          description={ui.confirmation.description}
          showIcon
          type={operation.emphasis === 'danger' ? 'warning' : 'info'}
        />
      )}
      <OperationFields operation={operation} variant={variant} />
    </Form>
  );
  if (variant === 'mobile') {
    return (
      <Drawer
        extra={
          <Button
            loading={submitting}
            onClick={() => form.submit()}
            type="primary"
          >
            {ui.confirmText || `确认${operation.label}`}
          </Button>
        }
        rootClassName="oxa-workflow-operation-drawer"
        styles={{ body: { overflowY: 'auto', minHeight: 0 } }}
        keyboard={!submitting}
        mask={{ closable: !submitting }}
        closable={!submitting}
        onClose={submitting ? undefined : onCancel}
        open
        placement="bottom"
        size="min(640px, 92dvh)"
        title={operation.label}
      >
        {formNode}
      </Drawer>
    );
  }
  return (
    <Modal
      cancelText="取消"
      confirmLoading={submitting}
      okText={ui.confirmText || `确认${operation.label}`}
      onCancel={onCancel}
      onOk={() => form.submit()}
      open
      title={operation.label}
    >
      {formNode}
    </Modal>
  );
}

function WorkflowOperations({
  surface,
  variant,
  onRefresh,
  onCommandSuccess,
}: {
  surface: WorkflowSurface;
  variant: PageVariant;
  onRefresh: () => Promise<void>;
  onCommandSuccess: (result: WorkflowCommandResult) => Promise<void>;
}) {
  const { message } = App.useApp();
  const [selectedState, setSelectedState] = useState<{
    operation: WorkflowOperationSurface;
    operationSignature: string;
    surface: WorkflowSurface;
  } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const operations = standardWorkflowOperations(surface);
  const selected = selectedState?.surface === surface
    ? operations.find(
        (operation) =>
          operation.key === selectedState.operation.key &&
          workflowOperationSignature(operation) ===
            selectedState.operationSignature,
      ) || null
    : null;
  useEffect(() => {
    if (selectedState && !selected) setSelectedState(null);
  }, [selected, selectedState]);
  const selectOperation = (operation: WorkflowOperationSurface) => {
    setSelectedState({
      operation,
      operationSignature: workflowOperationSignature(operation),
      surface,
    });
  };
  const submit = async (values: JsonObject) => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      if (selected.kind !== 'workflow_command') {
        throw new Error('WORKFLOW_APP_ACTION_NOT_EXECUTABLE_IN_STANDARD_PANEL');
      }
      const commandToken = surface.commandToken;
      if (!commandToken || !surface.commandTokenExpiresAt) {
        await onRefresh();
        throw new Error('WORKFLOW_FRESH_COMMAND_TOKEN_REQUIRED');
      }
      if (new Date(surface.commandTokenExpiresAt).getTime() <= Date.now()) {
        await onRefresh();
        throw new Error('WORKFLOW_COMMAND_SURFACE_EXPIRED');
      }
      const result = await executeWorkflowOperation(
        surface,
        selected,
        values,
        { idempotencyKey: randomId(`workflow:${selected.key}`) },
      );
      message.success(`${selected.label}已提交`);
      setSelectedState(null);
      await onCommandSuccess(result);
    } catch (error) {
      const hasFreshSurface = Boolean(
        (error as { data?: { freshSurface?: unknown } })?.data?.freshSurface,
      );
      if (hasFreshSurface) {
        await onRefresh();
        setSelectedState(null);
        message.warning('内容已更新，请刷新后重试');
      } else {
        message.error(errorMessage(error, `${selected.label}失败`));
      }
    } finally {
      setSubmitting(false);
    }
  };
  if (!operations.length) return null;
  const primary = operations
    .filter((operation) => operation.placement === 'primary')
    .sort((left, right) => {
      if (variant !== 'mobile') return 0;
      const order: Record<string, number> = { reject: 0, approve: 1 };
      return (order[left.key] ?? 10) - (order[right.key] ?? 10);
    });
  const secondary = operations.filter(
    (operation) => operation.placement !== 'primary',
  );
  return (
    <>
      <div className={`oxa-workflow-actions oxa-workflow-actions-${variant}`}>
        {primary.map((operation) => (
          <Button
            danger={operation.emphasis === 'danger'}
            disabled={submitting || !operation.enabled}
            key={operation.key}
            onClick={() => selectOperation(operation)}
            title={operation.disabledReason}
            type={operation.emphasis === 'primary' ? 'primary' : 'default'}
          >
            {operation.label}
          </Button>
        ))}
        {secondary.length > 0 && (
          <Button
            className="oxa-workflow-more-trigger"
            disabled={submitting}
            icon={<EllipsisOutlined />}
            onClick={() => setMoreOpen((value) => !value)}
          >
            更多操作
          </Button>
        )}
        {secondary.length > 0 && moreOpen && (
          <div className="oxa-workflow-more-actions">
            {secondary.map((operation) => (
              <Button
                disabled={submitting || !operation.enabled}
                key={operation.key}
                onClick={() => {
                  setMoreOpen(false);
                  selectOperation(operation);
                }}
                type="text"
                title={operation.disabledReason}
              >
                {operation.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      <OperationDialog
        onCancel={() => setSelectedState(null)}
        onSubmit={(values) => void submit(values)}
        operation={selected}
        submitting={submitting}
        variant={variant}
      />
    </>
  );
}

interface WorkflowOperationsPanelProps {
  identifier: string;
  surfaceKind: WorkflowSurfaceKind;
  variant: WorkflowPageVariant;
  surface?: WorkflowSurface | null;
  onSurfaceChange?: (surface: WorkflowSurface) => void;
  onCompleted?: (
    surface: WorkflowSurface,
    result?: WorkflowCommandResult,
  ) => void | Promise<void>;
  onCommandCompleted?: (
    result: WorkflowCommandResult,
  ) => void | Promise<void>;
  loadSurface: (identifier: string) => Promise<WorkflowSurface>;
  matchesSurface: (
    surface: WorkflowSurface | null | undefined,
    identifier: string,
  ) => boolean;
  missingIdentifierMessage: string;
  surfaceMismatchMessage: string;
  loadingLabel: string;
  loadErrorFallback: string;
}

/**
 * Shared lifecycle for the embeddable task and instance operation panels.
 *
 * The panel owns only Surface loading and presentation state. The Workflow
 * Kernel remains the owner of operation visibility, command authorization,
 * idempotency, and state transitions; all operation controls continue to be
 * rendered by WorkflowOperations above.
 */
function WorkflowOperationsPanel({
  identifier,
  surfaceKind,
  variant,
  surface: suppliedSurface,
  onSurfaceChange,
  onCompleted,
  onCommandCompleted,
  loadSurface,
  matchesSurface,
  missingIdentifierMessage,
  surfaceMismatchMessage,
  loadingLabel,
  loadErrorFallback,
}: WorkflowOperationsPanelProps) {
  const normalizedIdentifier = identifier.trim();
  const inputSurface = suppliedSurface || null;
  const suppliedSurfaceMatches = matchesSurface(
    inputSurface,
    normalizedIdentifier,
  );
  const initialSurface = suppliedSurfaceMatches ? inputSurface : null;
  const [surface, setSurface] = useState<WorkflowSurface | null>(
    initialSurface,
  );
  const [surfaceIdentifier, setSurfaceIdentifier] = useState<string | null>(
    initialSurface ? normalizedIdentifier : null,
  );
  const [acceptedInputSurface, setAcceptedInputSurface] = useState<
    WorkflowSurface | null
  >(initialSurface ? inputSurface : null);
  const [loading, setLoading] = useState(!initialSurface);
  const [loadingIdentifier, setLoadingIdentifier] = useState<string | null>(
    initialSurface ? null : normalizedIdentifier,
  );
  const [errorState, setErrorState] = useState<{
    identifier: string;
    message: string;
  } | null>(null);
  const requestSequence = useRef(0);
  const currentIdentifierRef = useRef(normalizedIdentifier);
  const currentInputSurfaceRef = useRef(inputSurface);
  const generationRef = useRef(0);
  const activeRef = useRef(false);
  const onSurfaceChangeRef = useRef(onSurfaceChange);
  const onCompletedRef = useRef(onCompleted);
  const onCommandCompletedRef = useRef(onCommandCompleted);
  if (currentIdentifierRef.current !== normalizedIdentifier) {
    currentIdentifierRef.current = normalizedIdentifier;
    generationRef.current += 1;
  }
  if (currentInputSurfaceRef.current !== inputSurface) {
    currentInputSurfaceRef.current = inputSurface;
    // A parent may mirror the exact fresh Surface emitted by onSurfaceChange.
    // That is the same lifecycle value, not a stale-input replacement; every
    // other supplied Surface transition invalidates in-flight work.
    if (surface !== inputSurface) generationRef.current += 1;
  }
  const panelGeneration = generationRef.current;
  onSurfaceChangeRef.current = onSurfaceChange;
  onCompletedRef.current = onCompleted;
  onCommandCompletedRef.current = onCommandCompleted;

  const refresh = useCallback(async () => {
    const requestIdentifier = normalizedIdentifier;
    const requestGeneration = generationRef.current;
    const isCurrentRequest = (sequence: number) =>
      activeRef.current &&
      sequence === requestSequence.current &&
      currentIdentifierRef.current === requestIdentifier &&
      generationRef.current === requestGeneration;
    const sequence = ++requestSequence.current;
    if (
      !requestIdentifier ||
      currentIdentifierRef.current !== requestIdentifier ||
      generationRef.current !== requestGeneration
    ) {
      setSurface(null);
      setSurfaceIdentifier(null);
      setLoadingIdentifier(null);
      setErrorState({
        identifier: requestIdentifier,
        message: missingIdentifierMessage,
      });
      setLoading(false);
      return null;
    }
    const requestInputSurface = currentInputSurfaceRef.current;
    setAcceptedInputSurface(requestInputSurface);
    setSurface(null);
    setSurfaceIdentifier(null);
    setLoading(true);
    setLoadingIdentifier(requestIdentifier);
    setErrorState(null);
    try {
      const nextSurface = await loadSurface(requestIdentifier);
      if (!isCurrentRequest(sequence)) return null;
      if (currentInputSurfaceRef.current !== requestInputSurface) return null;
      if (!matchesSurface(nextSurface, requestIdentifier)) {
        setErrorState({
          identifier: requestIdentifier,
          message: surfaceMismatchMessage,
        });
        return null;
      }
      setSurface(nextSurface);
      setSurfaceIdentifier(requestIdentifier);
      if (isCurrentRequest(sequence)) {
        onSurfaceChangeRef.current?.(nextSurface);
      }
      return nextSurface;
    } catch (reason) {
      if (isCurrentRequest(sequence)) {
        setErrorState({
          identifier: requestIdentifier,
          message: errorMessage(reason, loadErrorFallback),
        });
      }
      return null;
    } finally {
      if (isCurrentRequest(sequence)) {
        setLoading(false);
        setLoadingIdentifier(null);
      }
    }
  }, [
    loadErrorFallback,
    loadSurface,
    matchesSurface,
    missingIdentifierMessage,
    normalizedIdentifier,
    surfaceMismatchMessage,
  ]);

  useEffect(() => {
    activeRef.current = true;
    requestSequence.current += 1;
    if (!normalizedIdentifier) {
      setSurface(null);
      setSurfaceIdentifier(null);
      setAcceptedInputSurface(inputSurface);
      setLoadingIdentifier(null);
      setErrorState({
        identifier: normalizedIdentifier,
        message: missingIdentifierMessage,
      });
      setLoading(false);
      return () => {
        activeRef.current = false;
        requestSequence.current += 1;
      };
    }
    if (suppliedSurfaceMatches && inputSurface) {
      setSurface(inputSurface);
      setSurfaceIdentifier(normalizedIdentifier);
      setAcceptedInputSurface(inputSurface);
      setErrorState(null);
      setLoadingIdentifier(null);
      setLoading(false);
      return () => {
        activeRef.current = false;
        requestSequence.current += 1;
      };
    }
    setSurface(null);
    setSurfaceIdentifier(null);
    void refresh();
    return () => {
      activeRef.current = false;
      requestSequence.current += 1;
    };
  }, [
    inputSurface,
    missingIdentifierMessage,
    normalizedIdentifier,
    refresh,
    suppliedSurfaceMatches,
  ]);

  const isCurrentGeneration = useCallback(
    (identifierAtStart: string, generationAtStart: number) =>
      activeRef.current &&
      currentIdentifierRef.current === identifierAtStart &&
      generationRef.current === generationAtStart,
    [],
  );

  const refreshCurrent = useCallback(async () => {
    const identifierAtStart = normalizedIdentifier;
    const generationAtStart = panelGeneration;
    if (!isCurrentGeneration(identifierAtStart, generationAtStart)) return;
    await refresh();
  }, [isCurrentGeneration, normalizedIdentifier, panelGeneration, refresh]);

  const completed = useCallback(async (result: WorkflowCommandResult) => {
    const identifierAtStart = normalizedIdentifier;
    const generationAtStart = panelGeneration;
    if (!isCurrentGeneration(identifierAtStart, generationAtStart)) return;
    if (!shouldRefreshWorkflowSurface(surfaceKind, result)) {
      // The old task has become terminal. Remove its controls immediately so
      // a consumer without the explicit callback cannot submit the stale
      // command token a second time.
      setSurface(null);
      // Keep the identifier marked as current. Clearing it would make the
      // generic loading predicate spin forever because no refresh is expected
      // for a terminal task; the explicit callback is responsible for loading
      // the resulting instance or navigating away.
      setLoading(false);
      setLoadingIdentifier(null);
    }
    await completeWorkflowCommand(surfaceKind, result, {
      refresh: async () => {
        if (!isCurrentGeneration(identifierAtStart, generationAtStart)) {
          return null;
        }
        const nextSurface = await refresh();
        return isCurrentGeneration(identifierAtStart, generationAtStart)
          ? nextSurface
          : null;
      },
      onCommandCompleted: async (commandResult) => {
        if (!isCurrentGeneration(identifierAtStart, generationAtStart)) {
          return;
        }
        await onCommandCompletedRef.current?.(commandResult);
      },
      onCompleted: async (nextSurface, commandResult) => {
        if (!isCurrentGeneration(identifierAtStart, generationAtStart)) {
          return;
        }
        const callback = onCompletedRef.current;
        if (!callback) return;
        await callback(nextSurface, commandResult);
      },
    });
  }, [
    isCurrentGeneration,
    normalizedIdentifier,
    panelGeneration,
    refresh,
    surfaceKind,
  ]);

  const stateSurfaceMatches =
    surfaceIdentifier === normalizedIdentifier &&
    matchesSurface(surface, normalizedIdentifier);
  const acceptedInput = acceptedInputSurface === inputSurface;
  const currentSurface = acceptedInput && stateSurfaceMatches ? surface : null;
  const renderSurface = currentSurface ||
    (suppliedSurfaceMatches &&
    inputSurface &&
    surface === inputSurface &&
    surfaceIdentifier === normalizedIdentifier
      ? inputSurface
      : null);
  const renderError = normalizedIdentifier
    ? errorState?.identifier === normalizedIdentifier
      ? errorState.message
      : ''
    : missingIdentifierMessage;
  const renderLoading =
    Boolean(normalizedIdentifier) &&
    !renderSurface &&
    !renderError &&
    (loading ||
      loadingIdentifier === normalizedIdentifier ||
      surfaceIdentifier !== normalizedIdentifier ||
      !acceptedInput);

  if (renderLoading) {
    return (
      <div
        aria-busy="true"
        aria-label={loadingLabel}
        className={`oxa-workflow-actions-loading oxa-workflow-actions-loading-${variant}`}
      >
        <Spin />
      </div>
    );
  }
  if (renderError && !renderSurface) {
    return (
      <Alert
        action={<Button onClick={() => void refresh()}>重试</Button>}
        description={renderError}
        showIcon
        type="error"
      />
    );
  }
  if (!renderSurface) return null;
  return (
    <>
      {renderError && (
        <Alert description={renderError} showIcon type="warning" />
      )}
      <WorkflowOperations
        onCommandSuccess={completed}
        onRefresh={refreshCurrent}
        surface={renderSurface}
        variant={variant}
      />
    </>
  );
}

export interface WorkflowTaskOperationsPanelProps {
  /** The platform task identifier. It is never inferred from application data. */
  taskId: string;
  /** Desktop renders a sticky action bar; mobile renders the same actions for touch surfaces. */
  variant?: WorkflowPageVariant;
  /** An already loaded task Surface. When omitted, the panel loads it from the platform. */
  surface?: WorkflowSurface | null;
  /** Called whenever the panel obtains a fresh task Surface. */
  onSurfaceChange?: (surface: WorkflowSurface) => void;
  /**
   * Called after a command succeeds and the task Surface has been refreshed.
   * The optional second argument carries the unchanged platform command
   * result for existing consumers that still use this callback.
   */
  onCompleted?: (
    surface: WorkflowSurface,
    result?: WorkflowCommandResult,
  ) => void | Promise<void>;
  /** Called with the platform command result after successful completion. */
  onCommandCompleted?: (
    result: WorkflowCommandResult,
  ) => void | Promise<void>;
}

/** Public, embeddable Workflow task operation surface. */
export function WorkflowTaskOperationsPanel({
  taskId,
  variant = 'desktop',
  surface,
  onSurfaceChange,
  onCompleted,
  onCommandCompleted,
}: WorkflowTaskOperationsPanelProps) {
  return (
    <WorkflowOperationsPanel
      identifier={taskId}
      onCommandCompleted={onCommandCompleted}
      loadErrorFallback="审批任务加载失败"
      loadSurface={loadWorkflowTaskSurface}
      matchesSurface={workflowSurfaceMatchesTask}
      missingIdentifierMessage="WORKFLOW_TASK_ID_REQUIRED"
      onCompleted={onCompleted}
      onSurfaceChange={onSurfaceChange}
      surface={surface}
      surfaceMismatchMessage="WORKFLOW_TASK_SURFACE_TASK_MISMATCH"
      surfaceKind="task"
      variant={variant}
      loadingLabel="正在加载审批操作"
    />
  );
}

export interface WorkflowInstanceOperationsPanelProps {
  /** The platform workflow instance identifier. It is never inferred from business data. */
  instanceId: string;
  /** Desktop renders a sticky action bar; mobile renders the same actions for touch surfaces. */
  variant?: WorkflowPageVariant;
  /** An already loaded instance Surface. When omitted, the panel loads it from the platform. */
  surface?: WorkflowSurface | null;
  /** Called whenever the panel obtains a fresh instance Surface. */
  onSurfaceChange?: (surface: WorkflowSurface) => void;
  /**
   * Called after a command succeeds and the instance Surface has been
   * refreshed. The optional second argument carries the platform command
   * result for existing consumers that still use this callback.
   */
  onCompleted?: (
    surface: WorkflowSurface,
    result?: WorkflowCommandResult,
  ) => void | Promise<void>;
  /** Called with the platform command result after successful completion. */
  onCommandCompleted?: (
    result: WorkflowCommandResult,
  ) => void | Promise<void>;
}

/** Public, embeddable Workflow instance operation surface. */
export function WorkflowInstanceOperationsPanel({
  instanceId,
  variant = 'desktop',
  surface,
  onSurfaceChange,
  onCompleted,
  onCommandCompleted,
}: WorkflowInstanceOperationsPanelProps) {
  return (
    <WorkflowOperationsPanel
      identifier={instanceId}
      onCommandCompleted={onCommandCompleted}
      loadErrorFallback="流程实例加载失败"
      loadSurface={loadWorkflowInstanceSurface}
      matchesSurface={workflowSurfaceMatchesInstance}
      missingIdentifierMessage="WORKFLOW_INSTANCE_ID_REQUIRED"
      onCompleted={onCompleted}
      onSurfaceChange={onSurfaceChange}
      surface={surface}
      surfaceMismatchMessage="WORKFLOW_INSTANCE_SURFACE_INSTANCE_MISMATCH"
      surfaceKind="instance"
      variant={variant}
      loadingLabel="正在加载流程操作"
    />
  );
}

export function WorkflowSummarySection({ surface }: { surface: WorkflowSurface }) {
  const summary = surface.presentation.summary;
  const initiator = summary.initiator || {
    userId: null,
    displayName: summary.initiatorDisplayName,
    avatarUrl: null,
    departmentDisplayName: summary.departmentDisplayName,
  };
  return (
    <div className="oxa-workflow-summary-metadata">
      <span>
        <Typography.Text type="secondary">申请人</Typography.Text>
        <span className="oxa-workflow-applicant">
          <PlatformAvatar avatarUrl={initiator.avatarUrl} size={32} />
          <span>
            <strong>{initiator.displayName}</strong>
            {initiator.departmentDisplayName && (
              <small>{initiator.departmentDisplayName}</small>
            )}
          </span>
        </span>
      </span>
      <span><Typography.Text type="secondary">提交时间</Typography.Text>{formatTime(summary.submittedAt)}</span>
      {summary.businessNumber && (
        <span><Typography.Text type="secondary">业务编号</Typography.Text>{summary.businessNumber}</span>
      )}
    </div>
  );
}

interface WorkflowDetailRendererProps {
  surface: WorkflowSurface;
  timeline: WorkflowTimeline | null;
  warning: string;
  operations: ReactNode;
  onClose?: () => void;
  onEdit?: () => void;
  drawer?: boolean;
  drawerState?: ResourceFormDrawerState;
  newPageHref?: string;
  editing?: ReactNode; busy?: boolean;
}

function StandardWorkflowDetailRenderer({ surface, timeline, warning, operations, variant,
  onClose, onEdit, drawer, drawerState, newPageHref, editing, busy,
}: WorkflowDetailRendererProps & { variant: PageVariant }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('application');
  const instance = surfaceInstance(surface);
  const business = surfaceBusinessDetail(surface);
  const summary = surface.presentation.summary;
  const titleField = workflowDetailGroups(business).flatMap(group => group.fields).find(field => field.type === 'text.short');
  const title = titleField && business.record[titleField.key] ? String(business.record[titleField.key]) : summary.title;
  const activeNode = timeline?.display?.entries.find(entry => entry.status === 'active');
  const people = activeNode?.people.map(person => person.displayName).filter(Boolean).join('、');
  const statusTone = workflowStatus(instance.status).color;
  const bannerTone = statusTone === 'error' ? 'error' : 'active';
  const edit = workflowHasEnded(instance) ? onEdit : undefined;
  const hasActions = standardWorkflowOperations(surface).length > 0;
  const loadAudit = useCallback(() => loadWorkflowDataAudit(instance.id), [instance.id]);
  const back = onClose || (() => navigate(variant === 'mobile' ? '/m/work-center' : '/work-center'));
  return <RecordDetailFrame variant={variant} title="申请详情" heading={title} status={<StatusTag status={instance.status} />}
    metadata={[summary.initiator?.displayName || summary.initiatorDisplayName, summary.initiator?.departmentDisplayName || summary.departmentDisplayName,
      summary.submittedAt ? `${detailTime(summary.submittedAt)} 创建` : ''].filter(Boolean).join(' · ')}
    updatedAt={business.record.updated_at || instance.completedAt || instance.startedAt}
    onClose={back} onEdit={edit} editing={editing} busy={busy} drawer={drawer} drawerState={drawerState} newPageHref={newPageHref}
    footer={hasActions || edit ? <>{operations}{edit && <Button onClick={edit}>编辑</Button>}</> : null}>
    {warning && <Alert description={warning} showIcon type="warning" />}
    {!workflowHasEnded(instance) && activeNode && <div className={`oxa-workflow-current-node is-${bannerTone}`} role="status"><span><ClockCircleOutlined />当前节点：{activeNode.title}</span>
      {people && <span>等待{people}处理</span>}</div>}
    <Tabs activeKey={tab} onChange={setTab} items={[
      { key: 'application', label: '申请内容', children: <WorkflowBusinessDetailSections surface={surface} variant={variant} /> },
      { key: 'history', label: '审批历史', children: <WorkflowTimelineSection timeline={timeline} /> },
      { key: 'changes', label: '变更记录', children: tab === 'changes' && business.surface && business.resourceCode && business.recordId
        ? <RecordChangeHistory resourceCode={business.resourceCode} recordId={business.recordId} surface={business.surface} readable={() => true} loadPage={loadAudit} />
        : <Empty description="暂无变更记录" /> },
    ]} />
  </RecordDetailFrame>;
}

export function DesktopWorkflowDetailRenderer(props: WorkflowDetailRendererProps) {
  return <StandardWorkflowDetailRenderer {...props} variant="desktop" />;
}
export function MobileWorkflowDetailRenderer(props: WorkflowDetailRendererProps) {
  return <StandardWorkflowDetailRenderer {...props} variant="mobile" />;
}

export function useWorkflowDetail({ kind, id, resourceCode }: {
  kind: 'task' | 'instance' | 'record'; id: string; resourceCode?: string;
}) {
  const { identity } = useRuntime();
  const detailKey = `${identity.identityScope}:${identity.environment.id}:${kind}:${resourceCode || ''}:${id}`;
  const [state, setState] = useState<{
    detailKey: string;
    detail: WorkflowDetailSurfaceV2 | null;
    error: string;
  }>({ detailKey, detail: null, error: '' });
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);
  const activeRef = useRef(false);
  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const isCurrent = () =>
      activeRef.current && sequence === requestSequence.current;
    setLoading(true);
    setState((current) =>
      current.detailKey === detailKey
        ? { ...current, error: '' }
        : { detailKey, detail: null, error: '' },
    );
    try {
      const detail =
        kind === 'record' ? await loadWorkflowRecordDetail(resourceCode!, id) : kind === 'task'
          ? await loadWorkflowTaskDetail(id)
          : await loadWorkflowInstanceDetail(id);
      if (!isCurrent()) return null;
      if (kind === 'task' && !workflowSurfaceMatchesTask(detail.surface, id)) {
        throw new Error('WORKFLOW_TASK_SURFACE_TASK_MISMATCH');
      }
      if (
        kind === 'instance' &&
        !workflowSurfaceMatchesInstance(detail.surface, id)
      ) {
        throw new Error('WORKFLOW_INSTANCE_SURFACE_INSTANCE_MISMATCH');
      }
      setState({ detailKey, detail, error: '' });
      return detail;
    } catch (reason) {
      if (isCurrent()) {
        setState((current) => ({
          detailKey,
          detail: current.detailKey === detailKey ? current.detail : null,
          error: errorMessage(reason, '流程详情加载失败'),
        }));
      }
      return null;
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [detailKey, id, kind, resourceCode]);
  useEffect(() => {
    activeRef.current = true;
    void refresh();
    return () => {
      activeRef.current = false;
      requestSequence.current += 1;
    };
  }, [refresh]);
  const current = state.detailKey === detailKey ? state : {
    detailKey,
    detail: null,
    error: '',
  };
  return {
    detail: current.detail,
    surface: current.detail?.surface || null,
    timeline: current.detail?.timeline || null,
    loading,
    error: current.error,
    refresh,
  };
}

function WorkflowDetailPage({ kind, variant, resourceCode, recordId, onDismiss, drawerState }: {
  kind: 'task' | 'instance' | 'record'; variant: PageVariant; resourceCode?: string; recordId?: string;
  onDismiss?: () => void; drawerState?: ResourceFormDrawerState;
}) {
  const params = useParams();
  const id = recordId || String(kind === 'task' ? params.taskId || '' : kind === 'record' ? params.id || '' : params.instanceId || '');
  const navigate = useNavigate();
  const { identity } = useRuntime();
  const [editing, setEditing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const { detail, surface, timeline, loading, error, refresh } = useWorkflowDetail({ kind, id, resourceCode });
  const instance = surface ? surfaceInstance(surface) : null;
  const task = surface ? surfaceTask(surface) : null;
  const business = surface ? surfaceBusinessDetail(surface) : null;
  const detailPath = surface ? (variant === 'mobile' ? surface.detailNavigation.mobilePath : surface.detailNavigation.desktopPath) : '';
  const newPageHref = useHref(detailPath || '.');
  const close = onDismiss || (() => navigate(detail ? variant === 'mobile' ? detail.navigationContext.mobileReturnPath : detail.navigationContext.desktopReturnPath : variant === 'mobile' ? '/m/work-center' : '/work-center'));
  if (!surface || !detail || !instance) return <RecordDetailFrame variant={variant} title="申请详情" drawer={Boolean(onDismiss)} drawerState={drawerState} onClose={close}>
    {loading ? <Spin /> : <Result status="error" title="流程详情加载失败" subTitle={error || '流程不存在'} extra={<Button onClick={() => void refresh()}>重试</Button>} />}
  </RecordDetailFrame>;
  if (surface.detailNavigation.custom) return <Navigate replace to={detailPath} />;
  const onCommandCompleted = async (result: WorkflowCommandResult) => {
    if (kind === 'task' && result.advanced === true) {
      const nextId = String(result.instanceId || '').trim();
      if (!nextId) return;
      const next = await loadWorkflowInstanceDetail(nextId);
      navigate(variant === 'mobile' ? next.surface.detailNavigation.mobilePath : next.surface.detailNavigation.desktopPath, { replace: true });
    } else await refresh();
  };
  const operations = task
    ? <WorkflowTaskOperationsPanel key={task.id} onCommandCompleted={onCommandCompleted} surface={surface} taskId={task.id} variant={variant} />
    : <WorkflowInstanceOperationsPanel instanceId={instance.id} onCommandCompleted={onCommandCompleted} surface={surface} variant={variant} />;
  return <StandardWorkflowDetailRenderer surface={surface} timeline={timeline} warning={error} operations={operations}
    variant={variant} drawer={Boolean(onDismiss)} drawerState={drawerState} newPageHref={newPageHref} onClose={editing ? () => { if (!editBusy) setEditing(false); } : close} busy={editBusy}
    editing={editing && business?.resourceCode && business.recordId ? <WorkflowRecordEditor resourceCode={business.resourceCode} recordId={business.recordId}
      variant={variant} presentation="embedded" onBusyChange={setEditBusy} onDismiss={() => setEditing(false)} onSaved={() => { setEditing(false); void refresh(); }} /> : undefined}
    onEdit={workflowHasEnded(instance) && identity.isAppSuperAdmin && (business?.status === 'ready' || business?.status === 'stale') ? () => setEditing(true) : undefined} />;
}

export function WorkflowRecordDetailPage({ variant = 'desktop', ...props }: {
  resourceCode: string; recordId?: string; variant?: PageVariant; onDismiss?: () => void; drawerState?: ResourceFormDrawerState;
}) { return <WorkflowDetailPage {...props} variant={variant} kind="record" />; }

export function WorkflowTaskPage({
  variant = 'desktop',
}: {
  variant?: PageVariant;
}) {
  return <WorkflowDetailPage kind="task" variant={variant} />;
}

export function WorkflowInstancePage({
  variant = 'desktop',
}: {
  variant?: PageVariant;
}) {
  return <WorkflowDetailPage kind="instance" variant={variant} />;
}

const WORK_VIEWS = [
  { value: 'created', label: '我创建的' }, { value: 'pending', label: '待我审批' },
  { value: 'handled', label: '我已处理' }, { value: 'cc', label: '抄送我的' },
] as const;

export function WorkflowWorkCenterPage({ variant = 'desktop' }: { variant?: PageVariant }) {
  const navigate = useNavigate();
  const [view, setView] = useState<import('openxiangda-contracts/browser').WorkflowWorkCenterView>('pending');
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState<WorkflowWorkCenterResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setPage(null);
    void loadWorkflowWorkCenter({ view, limit: pageSize, offset: (pageNumber - 1) * pageSize })
      .then(result => { if (active) setPage(result); })
      .catch(reason => { if (active) setError(errorMessage(reason, '待办加载失败')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt, pageNumber, pageSize, view]);
  const open = (item: WorkflowWorkCenterItem) => navigate(variant === 'mobile' ? item.detailNavigation.mobilePath : item.detailNavigation.desktopPath);
  const columns: TableColumnsType<WorkflowWorkCenterItem> = [
    { title: '申请事项', key: 'title', render: (_, item) => <Button type="link" className="oxa-work-item-link" onClick={() => open(item)}>{item.title}</Button> },
    { title: '流程', dataIndex: 'workflowTitle', render: value => value || '—' },
    { title: '当前节点', dataIndex: 'taskTitle', render: value => value || '—' },
    { title: '状态', dataIndex: 'instanceStatus', render: (value, item) => <StatusTag status={String(value || item.status)} /> },
    { title: view === 'created' ? '创建时间' : view === 'cc' ? '抄送时间' : '更新时间', dataIndex: 'occurredAt', render: formatTime },
  ];
  const content = <main className={`oxa-application-work-center oxa-application-work-center-${variant}`}>
    <header><h1>待办中心</h1><Button icon={<ReloadOutlined />} loading={loading} onClick={() => setAttempt(value => value + 1)}>刷新</Button></header>
    <Tabs activeKey={view} onChange={value => { setView(value as typeof view); setPageNumber(1); }} items={WORK_VIEWS.map(item => ({
      key: item.value, label: <span>{item.label}{page?.counts && <small className="oxa-work-count">{page.counts[item.value]}</small>}</span>,
    }))} />
    {error && <Alert title="待办加载失败" description={error} type="error" showIcon action={<Button onClick={() => setAttempt(value => value + 1)}>重试</Button>} />}
    {variant === 'desktop' ? <Table rowKey="id" columns={columns} dataSource={page?.items || []} loading={loading} pagination={{
      current: pageNumber, pageSize, total: page?.total || 0, showSizeChanger: true,
      onChange: (number, size) => { setPageNumber(number); setPageSize(size); },
    }} /> : <>
      {loading && <Spin />}
      <div className="oxa-work-center-mobile-list">{page?.items.map(item => <button type="button" key={item.id} className="oxa-work-center-item" onClick={() => open(item)}>
        <div><strong>{item.title}</strong><StatusTag status={item.instanceStatus || item.status} /></div>
        <p>{[item.workflowTitle, item.taskTitle].filter(Boolean).join(' · ')}</p><time>{formatTime(item.occurredAt)}</time>
      </button>)}</div>
      {!loading && !page?.items.length && !error && <Empty description="暂无相关申请" />}
      {Boolean(page && page.total > pageSize) && <div className="oxa-mobile-pagination">
        <Button disabled={pageNumber <= 1} onClick={() => setPageNumber(value => value - 1)}>上一页</Button>
        <span>第 {pageNumber} 页</span><Button disabled={pageNumber * pageSize >= (page?.total || 0)} onClick={() => setPageNumber(value => value + 1)}>下一页</Button>
      </div>}
    </>}
  </main>;
  return content;
}

function RequirementFields({
  requirements,
}: {
  requirements: WorkflowPreparationRequirement[];
}) {
  return (
    <>
      {requirements.map((requirement) => (
        <Form.Item
          key={requirement.id}
          label={requirement.title}
          name={requirement.id}
          rules={
            requirement.required
              ? [{ required: true, message: `请选择${requirement.title}` }]
              : []
          }
        >
          <Select
            mode={
              'max' in requirement && Number(requirement.max || 1) > 1
                ? 'multiple'
                : undefined
            }
            options={(requirement.candidates || []).map((candidate) => ({
              label:
                'displayName' in candidate
                  ? candidate.displayName || candidate.userId
                  : 'label' in candidate
                    ? candidate.label
                    : candidate.userId,
              value: 'userId' in candidate ? candidate.userId : candidate.value,
            }))}
          />
        </Form.Item>
      ))}
    </>
  );
}

function namedLaunchIntentMatches(
  generated: GeneratedWorkflowNamedOperationIntent | undefined,
  surface: WorkflowNamedOperationLaunchIntent | undefined,
) {
  if (!generated || !surface) return generated === surface;
  return (
    generated.operationCode === surface.operationCode &&
    generated.method === surface.method &&
    generated.path === surface.href &&
    generated.requiredCapability === surface.requiredCapability &&
    generated.requestSchemaDigest === surface.requestSchemaDigest &&
    generated.responseSchemaDigest === surface.responseSchemaDigest &&
    workflowLaunchContractJsonEqual(generated.inputs, surface.inputs) &&
    workflowLaunchContractJsonEqual(generated.output, surface.output)
  );
}

function fieldValueLabel(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const item = value as Record<string, unknown>;
    if (typeof item.label === 'string') return item.label;
  }
  if (Array.isArray(value)) return value.map(fieldValueLabel).filter(Boolean).join('、');
  return String(value);
}

function subjectRecordLabel(
  record: Record<string, unknown>,
  definition: GeneratedResourceDefinition,
) {
  const preferred = definition.surface.list?.searchableFields || [];
  const candidates = [
    ...preferred,
    ...(definition.surface.form?.fieldOrder || []),
    ...Object.keys(definition.surface.fields),
  ];
  for (const fieldCode of candidates) {
    const label = fieldValueLabel(record[fieldCode]);
    if (label) return label;
  }
  return String(record.id || '业务记录');
}

function SubjectRecordSelector({
  definition,
  value,
  onChange,
}: {
  definition: GeneratedResourceDefinition;
  value?: string;
  onChange: (value?: string) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [options, setOptions] = useState<Array<{ label: string; value: string }>>(
    [],
  );
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void createNativeResourceClient(definition.code, definition.surface)
        .list({ page: 1, pageSize: 20, ...(keyword.trim() ? { keyword } : {}) })
        .then(page => {
          if (!active) return;
          setOptions(
            page.rows
              .map(record => ({
                value: String(record.id || ''),
                label: subjectRecordLabel(record, definition),
              }))
              .filter(option => option.value),
          );
        })
        .catch(() => {
          if (active) setOptions([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [definition, keyword]);
  return (
    <Select
      allowClear
      filterOption={false}
      loading={loading}
      onChange={next => onChange(next || undefined)}
      onSearch={setKeyword}
      options={options}
      placeholder="搜索并选择已有业务记录"
      showSearch
      value={value || undefined}
    />
  );
}

async function workflowContextPrefillValue(
  field: SurfaceField,
  rawValue: string,
  resources: ReturnType<typeof useResourceDefinitions>,
): Promise<unknown> {
  const value = rawValue.trim();
  if (!value || value.length > 500) {
    throw new Error('OPENXIANGDA_WORKFLOW_LAUNCH_CONTEXT_VALUE_INVALID');
  }
  if (field.type === 'resource-ref.single') {
    const source = field.source;
    const target = source ? resources[source.resourceCode] : undefined;
    if (!source || !target) {
      throw new Error('OPENXIANGDA_WORKFLOW_LAUNCH_CONTEXT_SOURCE_REQUIRED');
    }
    const record = await createNativeResourceClient(
      target.code,
      target.surface,
    ).get(value);
    const label = fieldValueLabel(record[source.labelField]);
    if (!label || String(record.id || '') !== value) {
      throw new Error('OPENXIANGDA_WORKFLOW_LAUNCH_CONTEXT_RECORD_INVALID');
    }
    const description = (source.descriptionFields || [])
      .map(fieldCode => fieldValueLabel(record[fieldCode]))
      .filter(Boolean)
      .join(' · ');
    const snapshot = Object.fromEntries(
      (source.snapshotFields || []).map(fieldCode => [
        fieldCode,
        record[fieldCode],
      ]),
    );
    return {
      resourceCode: source.resourceCode,
      value,
      label,
      ...(description ? { description } : {}),
      ...(Object.keys(snapshot).length ? { snapshot } : {}),
    } satisfies ResourceReferenceValue;
  }
  return workflowContextScalarValue(field, value);
}

export function WorkflowSubmissionPage({
  instancePath,
  workflowCode: declaredWorkflowCode,
  variant = 'desktop',
  onDismiss,
  onCompleted,
}: {
  instancePath?: string;
  workflowCode?: string;
  variant?: PageVariant;
  onDismiss?: () => void;
  onCompleted?: (subjectId: string) => void;
} = {}) {
  const { workflowCode: routeWorkflowCode = '' } = useParams();
  const workflowCode = declaredWorkflowCode || routeWorkflowCode;
  const definition = useWorkflowDefinition(workflowCode);
  const resources = useResourceDefinitions();
  const { hasCapability, identity } = useRuntime();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [subjectForm] = Form.useForm<JsonObject>();
  const [requirementForm] = Form.useForm<JsonObject>();
  const [loading, setLoading] = useState(false);
  const [launchSurface, setLaunchSurface] =
    useState<WorkflowLaunchSurface | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [processSurface, setProcessSurface] =
    useState<ProcessCommandSurface | null>(null);
  const [processError, setProcessError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<{
    subjectId: string;
    subjectRevision?: number;
  } | null>(null);
  const submitInFlight = useRef(false);
  const submissionAttempt = useRef<{ signature: string; idempotencyKey: string; requestedAt: string } | null>(null);
  const completedCommandId = useRef('');
  const completionHandler = useRef(onCompleted);
  completionHandler.current = onCompleted;
  const [processRefreshAttempt, setProcessRefreshAttempt] = useState(0);
  const [loadedSubjectRevision, setLoadedSubjectRevision] = useState<number>();
  const [localCommandId, setLocalCommandId] = useState('');
  const [localSubjectId, setLocalSubjectId] = useState('');
  const launchPagePath = useRef('');
  const [fullScreen, setFullScreen] = useState(false);
  const pathCommandId = useParams<{ commandId?: string }>().commandId;
  const commandId = onDismiss ? localCommandId : pathCommandId || searchParams.get('processCommandId') || '';
  const subjectId = onDismiss ? localSubjectId : searchParams.get('subjectId') || '';
  const newPageQuery = new URLSearchParams();
  if (commandId) newPageQuery.set('processCommandId', commandId);
  else if (subjectId) newPageQuery.set('subjectId', subjectId);
  const newPageHref = useHref(`${launchPagePath.current}${newPageQuery.size ? `?${newPageQuery}` : ''}`);
  const generatedNamedSubmission = definition?.launch.submission;
  const [submissionMode, setSubmissionMode] = useState<'create' | 'existing'>(
    subjectId ? 'existing' : 'create',
  );

  const subjectDefinition = definition
    ? resources[definition.subject.resourceCode]
    : undefined;
  useEffect(() => {
    if (!generatedNamedSubmission) return;
    if (subjectId && generatedNamedSubmission.existing) {
      setSubmissionMode('existing');
      return;
    }
    if (submissionMode === 'create' && generatedNamedSubmission.create) return;
    if (submissionMode === 'existing' && generatedNamedSubmission.existing) return;
    setSubmissionMode(
      generatedNamedSubmission.create ? 'create' : 'existing',
    );
  }, [generatedNamedSubmission, subjectId, submissionMode]);
  const surfaceNamedSubmission =
    launchSurface?.submission.kind === 'named-operation'
      ? launchSurface.submission
      : undefined;
  const namedIntent = surfaceNamedSubmission?.[submissionMode];
  const mutationMode: 'create' | 'update' = generatedNamedSubmission
    ? submissionMode === 'existing'
      ? 'update'
      : 'create'
    : subjectId
      ? 'update'
      : 'create';
  const fields = useMemo(() => {
    if (!subjectDefinition) return [];
    return selectedSurfaceFields(subjectDefinition.surface, 'form')
      .filter(field => !field.system && field.widget !== 'readonly')
      .filter(field => {
        if (namedIntent) {
          return Object.values(namedIntent.inputs).some(
            binding =>
              binding.source === 'field' && binding.fieldCode === field.key,
          );
        }
        // A standard process is the sealed mutation owner. Its platform
        // operation writes the subject atomically; Native CRUD grants must
        // not be required or leaked to the launching user.
        return true;
      });
  }, [
    hasCapability,
    identity.isAppSuperAdmin,
    mutationMode,
    namedIntent,
    subjectDefinition,
  ]);

  useEffect(() => {
    let active = true;
    setLaunchSurface(null);
    setLaunchError(null);
    if (!workflowCode || commandId) return () => { active = false; };
    void loadWorkflowLaunchSurface(workflowCode)
      .then(surface => {
        const expectedProjection = definition
          ? Object.entries(definition.subject.factProjection).sort()
          : [];
        const actualProjection = Object.entries(
          surface.subject.factProjection,
        ).sort();
        const expectedSummaryFields = definition
          ? [...(definition.subject.summaryFields || [])].sort()
          : [];
        const actualSummaryFields = [
          ...(surface.subject.summaryFields || []),
        ].sort();
        const generatedSubmission = definition?.launch.submission;
        const submissionMatches = generatedSubmission
          ? surface.submission.kind === 'named-operation' &&
            namedLaunchIntentMatches(
              generatedSubmission.create,
              surface.submission.create,
            ) &&
            namedLaunchIntentMatches(
              generatedSubmission.existing,
              surface.submission.existing,
            ) &&
            workflowLaunchContractJsonEqual(
              generatedSubmission.context || [],
              surface.submission.context,
            )
          : surface.submission.kind === 'standard-process' &&
            surface.submission.processOperationCode ===
              definition?.processOperationCode;
        if (
          !definition ||
          surface.environmentKey !== identity.environment.key ||
          surface.environmentId !== identity.environment.id ||
          !submissionMatches ||
          surface.subject.resourceCode !== definition.subject.resourceCode ||
          JSON.stringify(actualProjection) !== JSON.stringify(expectedProjection) ||
          JSON.stringify(actualSummaryFields) !==
            JSON.stringify(expectedSummaryFields)
        ) {
          throw new Error('OPENXIANGDA_WORKFLOW_LAUNCH_CONTRACT_MISMATCH');
        }
        if (active) {
          launchPagePath.current = variant === 'mobile' ? surface.paths.mobile : surface.paths.desktop;
          setLaunchSurface(surface);
        }
      })
      .catch(error => {
        if (active) setLaunchError(errorMessage(error, '发起页面当前不可用'));
      });
    return () => {
      active = false;
    };
  }, [commandId, definition, identity.environment.id, identity.environment.key, workflowCode, variant]);

  useEffect(() => {
    setLoadedSubjectRevision(undefined);
    if (
      !subjectDefinition ||
      !subjectId ||
      commandId ||
      mutationMode !== 'update' ||
      !launchSurface
    ) return;
    let active = true;
    const client = createNativeResourceClient(
      subjectDefinition.code,
      subjectDefinition.surface,
    );
    void client
      .get(subjectId)
      .then(record => {
        if (active) {
          const revision = Number(record.revision);
          if (!Number.isSafeInteger(revision) || revision < 1) {
            throw new Error('OPENXIANGDA_STANDARD_PROCESS_SUBJECT_REVISION_REQUIRED');
          }
          setLoadedSubjectRevision(revision);
          subjectForm.setFieldsValue(
            normalizeRecordForForm(record, subjectDefinition.surface),
          );
        }
      })
      .catch(error => {
        if (active) setLaunchError(errorMessage(error, '业务记录读取失败'));
      });
    return () => {
      active = false;
    };
  }, [commandId, launchSurface, mutationMode, subjectDefinition, subjectForm, subjectId]);

  useEffect(() => {
    if (
      !surfaceNamedSubmission ||
      !namedIntent ||
      !subjectDefinition ||
      commandId ||
      mutationMode !== 'create'
    ) return;
    const declaredFields = new Set(
      Object.values(namedIntent.inputs).flatMap(binding =>
        binding.source === 'field' ? [binding.fieldCode] : [],
      ),
    );
    const requested = surfaceNamedSubmission.context
      .map(context => ({
        ...context,
        value: searchParams.get(context.queryParameter),
      }))
      .filter(
        (context): context is typeof context & { value: string } =>
          Boolean(context.value) && declaredFields.has(context.fieldCode),
      );
    if (!requested.length) return;
    let active = true;
    void Promise.all(
      requested.map(async context => {
        const field = subjectDefinition.surface.fields[context.fieldCode];
        if (!field || field.system || field.widget === 'readonly') {
          throw new Error('OPENXIANGDA_WORKFLOW_LAUNCH_CONTEXT_FIELD_INVALID');
        }
        return [
          context.fieldCode,
          await workflowContextPrefillValue(
            { key: context.fieldCode, ...field },
            context.value,
            resources,
          ),
        ] as const;
      }),
    )
      .then(entries => {
        if (active) subjectForm.setFieldsValue(Object.fromEntries(entries));
      })
      .catch(error => {
        if (active) {
          setLaunchError(errorMessage(error, '上下文预填失败'));
        }
      });
    return () => {
      active = false;
    };
  }, [
    commandId,
    mutationMode,
    namedIntent,
    resources,
    searchParams,
    subjectDefinition,
    subjectForm,
    surfaceNamedSubmission,
  ]);

  useEffect(() => {
    if (!commandId) {
      setProcessSurface(null);
      setProcessError(null);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let failures = 0;
    let controller: AbortController | undefined;
    const refresh = async () => {
      if (!active) return;
      if (Date.now() - startedAt >= 60_000) {
        setProcessError('申请已提交，处理尚未结束；可稍后刷新状态，无需重复提交');
        return;
      }
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(new DOMException('状态读取超时', 'TimeoutError')), Math.min(10_000, 60_000 - (Date.now() - startedAt)));
      try {
        const next = await loadProcessCommandSurface(commandId, controller.signal);
        if (!active) return;
        if (
          next.command.id !== commandId ||
          next.command.environmentKey !== identity.environment.key ||
          next.command.workflowCode !== workflowCode ||
          next.command.subject.resourceCode !== definition?.subject.resourceCode
        ) {
          throw new Error('OPENXIANGDA_PROCESS_COMMAND_SCOPE_MISMATCH');
        }
        failures = 0;
        setProcessSurface(next);
        setProcessError(null);
        if (next.command.status === 'started' && next.command.workflowInstanceId) {
          if (completionHandler.current) {
            if (completedCommandId.current !== next.command.id) {
              completedCommandId.current = next.command.id;
              completionHandler.current(next.command.subject.id);
            }
            return;
          }
          if (
            !instancePath ||
            (instancePath.match(/:instanceId/g) || []).length !== 1
          ) {
            throw new Error('OPENXIANGDA_WORKFLOW_INSTANCE_ROUTE_MISSING');
          }
          navigate(
            instancePath.replace(
              ':instanceId',
              encodeURIComponent(next.command.workflowInstanceId),
            ),
            { replace: true },
          );
          return;
        }
        if (
          ['accepted', 'resolving', 'ready', 'starting', 'retry_wait'].includes(
            next.command.status,
          )
        ) {
          timer = setTimeout(() => void refresh(), 1500);
        }
      } catch (error) {
        if (!active) return;
        const delay = processStatusReadRetryDelay(error, ++failures, Date.now() - startedAt);
        setProcessError(delay === null ? '申请已提交，暂时无法读取处理状态；请稍后刷新，无需重复提交' : '申请已提交，正在重新读取处理状态，请勿重复提交');
        if (delay !== null) timer = setTimeout(() => void refresh(), delay);
      } finally {
        clearTimeout(timeout);
      }
    };
    void refresh();
    return () => {
      active = false;
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [
    commandId,
    definition,
    identity.environment.key,
    instancePath,
    navigate,
    workflowCode,
    processRefreshAttempt,
  ]);

  useEffect(() => {
    const recordId = processSurface?.subject.recordId;
    if (
      !commandId ||
      !recordId ||
      !subjectDefinition ||
      subjectForm.isFieldsTouched()
    ) {
      return;
    }
    let active = true;
    void createNativeResourceClient(
      subjectDefinition.code,
      subjectDefinition.surface,
    )
      .get(recordId)
      .then(record => {
        if (active) {
          subjectForm.setFieldsValue(
            normalizeRecordForForm(record, subjectDefinition.surface),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [commandId, processSurface?.subject.recordId, subjectDefinition, subjectForm]);

  const drawerBusy = loading || Boolean(commandId && (!processSurface || ['accepted', 'resolving', 'ready', 'starting', 'retry_wait'].includes(processSurface.command.status)) && !processError);
  const dismissDrawer = () => { if (!submitInFlight.current && !drawerBusy) onDismiss?.(); };
  const frame = (content: ReactNode) =>
    onDismiss ? <Drawer open title={definition?.title || '新增流程申请'} closable={false}
      rootClassName="oxa-resource-drawer oxa-workflow-launch-drawer"
      size={fullScreen || variant === 'mobile' ? '100vw' : 'min(850px, calc(100vw - 48px))'}
      styles={{ body: { padding: 0, overflow: 'auto' } }} keyboard={!drawerBusy} mask={{ closable: !drawerBusy }}
      onClose={dismissDrawer}
      extra={<Space size={4}><Button type="text" aria-label={fullScreen ? '退出全屏' : '全屏'} icon={fullScreen ? <CompressOutlined /> : <ExpandOutlined />} onClick={() => setFullScreen(value => !value)} />
        {launchPagePath.current && <Tooltip title={commandId ? '新开页面继续查看当前申请' : '新开页面（未提交内容不会带入）'}>
          <Button type="text" aria-label="新开页面" icon={<ExportOutlined />} href={newPageHref} target="_blank" rel="noopener noreferrer" disabled={loading} />
        </Tooltip>}
        <Button type="text" aria-label="关闭" disabled={drawerBusy} icon={<CloseOutlined />} onClick={dismissDrawer} /></Space>}
    >{content}</Drawer> : variant === 'desktop' ? (
      <div className="oxa-workflow-desktop-page oxa-workflow-submission-standalone-page">
        {content}
      </div>
    ) : content;

  if (!definition)
    return frame(<Result status="404" title="未声明该工作流" />);
  if (
    definition.launch.mode !== 'standalone' &&
    definition.launch.mode !== 'hidden-handoff'
  )
    return frame(<Result status="404" title="该工作流不提供标准发起页面" />);
  if (!subjectDefinition)
    return frame(<Result status="500" title="标准流程合同不完整" />);
  if (launchError && !commandId)
    return frame(<Result status="error" title="发起页面当前不可用" subTitle={launchError} />);
  if (!launchSurface && !commandId)
    return frame(<Spin className="oxa-workflow-launch-loading" size="large" />);
  if (
    !commandId &&
    generatedNamedSubmission &&
    (!surfaceNamedSubmission || !namedIntent)
  ) {
    return frame(<Result status="500" title="Named Action 提交合同不完整" />);
  }
  if (
    !commandId &&
    !generatedNamedSubmission &&
    (!definition.processOperationCode ||
      launchSurface?.submission.kind !== 'standard-process')
  ) {
    return frame(<Result status="500" title="标准流程合同不完整" />);
  }

  if (!commandId && fields.some(field => field.type === 'subtable')) {
    return frame(
      <Result
        status="error"
        title="标准流程不支持包含可写子表的主体表单"
        subTitle="当前标准提交 Surface 尚未声明可写子表渲染器。"
      />,
    );
  }

  const submit = async (values: JsonObject) => {
    if (submitInFlight.current || commandId || completion || !launchSurface) return;
    submitInFlight.current = true;
    setLoading(true);
    try {
      const encoded = normalizeFormValues(values, subjectDefinition.surface);
      const data = Object.fromEntries(fields.filter(field => Object.hasOwn(encoded, field.key)).map(field => [field.key, encoded[field.key]]));
      const signature = JSON.stringify({ workflowCode, subjectId, environmentKey: identity.environment.key, submissionMode, data });
      if (submissionAttempt.current?.signature !== signature) {
        submissionAttempt.current = { signature, idempotencyKey: randomId(`process:${workflowCode}`), requestedAt: new Date().toISOString() };
      }
      const attempt = submissionAttempt.current;
      if (namedIntent && launchSurface) {
        let subject: { id: string; revision: number } | undefined;
        if (submissionMode === 'existing') {
          if (!subjectId) {
            throw new Error('OPENXIANGDA_WORKFLOW_EXISTING_SUBJECT_REQUIRED');
          }
          const revision = loadedSubjectRevision;
          if (revision === undefined) {
            throw new Error(
              'OPENXIANGDA_WORKFLOW_EXISTING_SUBJECT_REVISION_REQUIRED',
            );
          }
          subject = { id: subjectId, revision };
        }
        const response = await executeWorkflowLaunchNamedOperation(
          namedIntent,
          buildWorkflowNamedOperationInput(namedIntent, {
            values: data,
            idempotencyKey: attempt.idempotencyKey,
            requestedAt: attempt.requestedAt,
            subjectProfile: identity.subjectProfile,
            ...(subject ? { subject } : {}),
          }),
        );
        const outcome = parseWorkflowNamedOperationResult(
          namedIntent,
          response,
          {
            appCode: launchSurface.appCode,
            environmentKey: launchSurface.environmentKey,
            workflowCode,
            resourceCode: subjectDefinition.code,
          },
        );
        if (outcome.kind === 'workflow-command') {
          if (onDismiss) { setLocalCommandId(outcome.command.id); return; }
          const next = new URLSearchParams(searchParams);
          next.set('processCommandId', outcome.command.id);
          next.delete('subjectId');
          setSearchParams(next, { replace: true });
        } else {
          setCompletion({
            subjectId: outcome.subjectId,
            ...(outcome.subjectRevision
              ? { subjectRevision: outcome.subjectRevision }
              : {}),
          });
          message.success('业务提交成功，无需审批');
          completionHandler.current?.(outcome.subjectId);
        }
        return;
      }
      let mutation:
        | { kind: 'create'; data: JsonObject }
        | { kind: 'update'; id: string; expectedRevision: number; data: JsonObject };
      if (subjectId) {
        const revision = loadedSubjectRevision;
        if (revision === undefined) {
          throw new Error('OPENXIANGDA_STANDARD_PROCESS_SUBJECT_REVISION_REQUIRED');
        }
        mutation = {
          kind: 'update',
          id: subjectId,
          expectedRevision: revision,
          data,
        };
      } else {
        mutation = { kind: 'create', data };
      }
      const command = await commitStandardProcess({
        processOperationCode: definition.processOperationCode!,
        workflowCode,
        idempotencyKey: attempt.idempotencyKey,
        mutation,
      });
      if (onDismiss) { setLocalCommandId(command.id); return; }
      const next = new URLSearchParams(searchParams);
      next.set('processCommandId', command.id);
      next.delete('subjectId');
      setSearchParams(next, { replace: true });
    } catch (error) {
      message.error(errorMessage(error, '业务与流程命令提交失败'));
    } finally {
      submitInFlight.current = false;
      setLoading(false);
    }
  };

  const answer = async (answers: JsonObject) => {
    if (!processSurface?.resume.answer || submitInFlight.current) return;
    submitInFlight.current = true;
    setLoading(true);
    try {
      await answerBusinessProcessCommand(commandId, {
        expectedRevision: processSurface.resume.answer.expectedRevision!,
        answers,
      });
      setProcessSurface(null);
      setProcessRefreshAttempt(value => value + 1);
      requirementForm.resetFields();
    } catch (error) {
      message.error(errorMessage(error, '补充发起信息失败'));
    } finally {
      submitInFlight.current = false;
      setLoading(false);
    }
  };
  const retry = async () => {
    if (!processSurface?.resume.retry || submitInFlight.current) return;
    submitInFlight.current = true;
    setLoading(true);
    try {
      await retryBusinessProcessCommand(commandId, {
        expectedRevision: processSurface.resume.retry.expectedRevision!,
      });
      setProcessSurface(null);
      setProcessRefreshAttempt(value => value + 1);
    } catch (error) {
      message.error(errorMessage(error, '重试命令失败'));
    } finally {
      submitInFlight.current = false;
      setLoading(false);
    }
  };

  const selectMode = (nextMode: 'create' | 'existing') => {
    if (!generatedNamedSubmission?.[nextMode] || submitInFlight.current || commandId) return;
    setSubmissionMode(nextMode);
    setCompletion(null);
    subjectForm.resetFields();
    if (onDismiss) { setLocalSubjectId(''); return; }
    const next = new URLSearchParams(searchParams);
    next.delete('processCommandId');
    if (nextMode === 'create') next.delete('subjectId');
    setSearchParams(next, { replace: true });
  };
  const selectSubject = (nextSubjectId?: string) => {
    if (submitInFlight.current || commandId) return;
    setCompletion(null);
    subjectForm.resetFields();
    if (onDismiss) { setLocalSubjectId(nextSubjectId || ''); return; }
    const next = new URLSearchParams(searchParams);
    next.delete('processCommandId');
    if (nextSubjectId) next.set('subjectId', nextSubjectId);
    else next.delete('subjectId');
    setSearchParams(next, { replace: true });
  };
  const launchControls = generatedNamedSubmission ? (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {generatedNamedSubmission.create && generatedNamedSubmission.existing ? (
        <Segmented
          onChange={value => selectMode(value as 'create' | 'existing')}
          options={[
            { label: '新建并提交', value: 'create' },
            { label: '选择已有记录', value: 'existing' },
          ]}
          value={submissionMode}
        />
      ) : null}
      {submissionMode === 'existing' && subjectDefinition ? (
        <SubjectRecordSelector
          definition={subjectDefinition}
          onChange={selectSubject}
          value={subjectId}
        />
      ) : null}
    </Space>
  ) : null;
  const uploadOperationCode =
    namedIntent?.operationCode || definition.processOperationCode;
  const fieldRenderers: SurfaceFieldRenderers | undefined = uploadOperationCode
    ? {
        ...(namedIntent ? { referenceLaunch: { workflowCode: definition.code, operationCode: namedIntent.operationCode } } : {}),
        upload: async (field, file) =>
          await uploadOperationManagedFile({
            operationCode: uploadOperationCode,
            resourceCode: subjectDefinition.code,
            fieldCode: field.key,
            intent: submissionMode === 'existing' ? 'update' : 'create',
            file,
            ...(submissionMode === 'existing' && subjectId
              ? { recordId: subjectId }
              : {}),
          }),
      }
    : undefined;

  const processStatus = processSurface?.command.status;
  const processing = Boolean(
    commandId &&
      !processError &&
      (!processStatus ||
        ['accepted', 'resolving', 'ready', 'starting', 'retry_wait'].includes(
          processStatus,
        )),
  );

  const shared = {
    title: launchSurface?.title || definition.title,
    description:
      definition.description ||
      (namedIntent
        ? '业务操作将在服务端完成校验、幂等提交，并按规则决定是否进入审批'
        : '业务数据和流程发起意图将原子提交'),
    fields,
    subjectDefinition,
    subjectForm,
    requirementForm,
    processSurface,
    processError,
    loading,
    processing,
    submitted: Boolean(commandId),
    mutationMode,
    launchControls,
    completion,
    embedded: Boolean(onDismiss),
    fieldRenderers,
    recordId: mutationMode === 'update' ? subjectId : undefined,
    onBack: onDismiss ? dismissDrawer : () => navigate(-1),
    onSubmit: submit,
    onAnswer: answer,
    onRetry: retry,
    onRefresh: () => { setProcessError(null); setProcessRefreshAttempt(value => value + 1); },
  };
  return frame(
    variant === 'mobile' ? (
      <MobileProcessSubmissionRenderer {...shared} />
    ) : (
      <DesktopProcessSubmissionRenderer {...shared} />
    ),
  );
}

interface ProcessSubmissionRendererProps {
  embedded?: boolean;
  title: string;
  description: string;
  fields: SurfaceField[];
  subjectDefinition: GeneratedResourceDefinition;
  subjectForm: ReturnType<typeof Form.useForm<JsonObject>>[0];
  requirementForm: ReturnType<typeof Form.useForm<JsonObject>>[0];
  processSurface: ProcessCommandSurface | null;
  processError: string | null;
  loading: boolean;
  processing: boolean;
  submitted: boolean;
  mutationMode: 'create' | 'update';
  launchControls: ReactNode;
  completion: { subjectId: string; subjectRevision?: number } | null;
  fieldRenderers?: SurfaceFieldRenderers;
  recordId?: string;
  onBack: () => void;
  onSubmit: (values: JsonObject) => Promise<void>;
  onAnswer: (answers: JsonObject) => Promise<void>;
  onRetry: () => Promise<void>;
  onRefresh: () => void;
}

function ProcessCommandPanel({
  form,
  surface,
  error,
  loading,
  onAnswer,
  onRetry,
  onRefresh,
}: {
  form: ProcessSubmissionRendererProps['requirementForm'];
  surface: ProcessCommandSurface | null;
  error: string | null;
  loading: boolean;
  onAnswer: ProcessSubmissionRendererProps['onAnswer'];
  onRetry: ProcessSubmissionRendererProps['onRetry'];
  onRefresh: ProcessSubmissionRendererProps['onRefresh'];
}) {
  if (error) {
    return (
      <Alert
        description="请刷新提交状态确认结果，当前申请不会重复发起。"
        action={<Button onClick={onRefresh}>刷新提交状态</Button>}
        message="暂时无法确认申请状态"
        showIcon
        type="warning"
      />
    );
  }
  if (!surface) return null;
  const command = surface.command;
  if (
    !['awaiting_input', 'cancelled', 'dead_letter'].includes(command.status)
  ) {
    return null;
  }
  return (
    <div className="oxa-workflow-submission-followup">
      {command.status === 'awaiting_input' ? (
        <Card title="还需要补充一些信息">
          <Form form={form} layout="vertical" onFinish={values => void onAnswer(values)}>
            <RequirementFields requirements={surface.requirements} />
            <Button htmlType="submit" loading={loading} type="primary">
              提交补充信息
            </Button>
          </Form>
        </Card>
      ) : null}
      {['cancelled', 'dead_letter'].includes(command.status) ? (
        <Result
          extra={surface.resume.retry ? (
            <Button loading={loading} onClick={() => void onRetry()} type="primary">
              重新尝试
            </Button>
          ) : null}
          status="error"
          subTitle="请稍后重试；如问题持续，请联系管理员。"
          title="申请暂未发起成功"
        />
      ) : null}
    </div>
  );
}

function StandardProcessSubmissionRenderer(props: ProcessSubmissionRendererProps & { variant: PageVariant }) {
  const groups = [...props.fields.reduce((groups, field) => {
    const section = field.section || 'default';
    groups.set(section, [...(groups.get(section) || []), field]);
    return groups;
  }, new Map<string, SurfaceField[]>())].map(([section, fields]) => ({ section, fields }));
  if (props.completion) return <Result status="success" title="提交成功" extra={<Button onClick={props.onBack}>返回</Button>} />;
  return <div className={props.variant === 'mobile' ? 'oxa-mobile-page oxa-mobile-entry oxa-workflow-submission-mobile' : 'oxa-workflow-entry'}>
    {!props.embedded && <header className={props.variant === 'mobile' ? 'oxa-mobile-header' : 'oxa-workflow-entry-header'}>
      <Button type="text" aria-label="返回" icon={<ArrowLeftOutlined />} disabled={props.processing} onClick={props.onBack} />
      <h3>{props.title}</h3><span />
    </header>}
    <ResourceFormContent variant={props.variant} mode={props.mutationMode === 'update' ? 'edit' : 'create'}
      resourceCode={props.subjectDefinition.code} recordId={props.recordId} groups={groups}
      form={props.subjectForm} busy={props.loading || props.submitted} pending={props.loading || props.processing}
      submitDisabled={props.submitted} submitLabel="提交审批" canWriteField={() => true} renderers={props.fieldRenderers}
      feedback={<>{props.launchControls}{props.processing && <Alert type="info" showIcon title="正在提交申请，请稍候…" />}</>}
      onSubmit={values => void props.onSubmit(values)} />
    <ProcessCommandPanel error={props.processError} form={props.requirementForm} loading={props.loading}
      onAnswer={props.onAnswer} onRetry={props.onRetry} onRefresh={props.onRefresh} surface={props.processSurface} />
  </div>;
}
function DesktopProcessSubmissionRenderer(props: ProcessSubmissionRendererProps) { return <StandardProcessSubmissionRenderer {...props} variant="desktop" />; }
function MobileProcessSubmissionRenderer(props: ProcessSubmissionRendererProps) { return <StandardProcessSubmissionRenderer {...props} variant="mobile" />; }
