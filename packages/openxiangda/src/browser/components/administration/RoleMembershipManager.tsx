import { useEffect, useRef, useState } from 'react';
import type { Key } from 'react';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
} from 'antd';
import dayjs from 'dayjs';
import type {
  NativeAuthorizationManagementCatalog,
  NativeAuthorizationMutationReceipt,
  NativeRoleManagementAction,
  NativeRoleMembership,
  NativeRoleMembershipBatchItem,
  NativeRoleMembershipBatchItemResult,
  NativeRoleMembershipBatchResult,
  NativeRoleMembershipChange,
} from 'openxiangda-contracts/browser';
import { assertNativeRoleMembershipBatchInput } from 'openxiangda-contracts/browser';
import {
  executeRoleMembershipBatch,
  listRoleManagementScopeValues,
  listRoleMemberships,
  loadAuthorizationMutationReceipt,
  loadRoleManagementCatalog,
  loadWorkflowRoleReferences,
  previewRoleMembershipBatch,
  searchRoleManagementUsers,
} from '../../platform-client';
import {
  membershipBatchItems,
  membershipBatchMerge,
  membershipBatchPending,
  membershipBatchReceiptMatches,
  type MembershipBatchSettings,
} from './membership-batch-model';

type Catalog = NativeAuthorizationManagementCatalog;
type Edit = {
  operation: 'create' | 'update' | 'revoke';
  rows: NativeRoleMembership[];
  catalog: Catalog;
  roleCode: string;
};
type MemberFormValues = Omit<
  MembershipBatchSettings,
  'validFrom' | 'validTo'
> & {
  roleCode?: string;
  users?: string[];
  validFrom?: dayjs.Dayjs;
  validTo?: dayjs.Dayjs;
};
export interface RoleMembershipManagerProps {
  initialRoleCode?: string;
  refreshKey?: string | number;
}
const statusNames = { active: '有效', expired: '已过期', revoked: '已撤销' };
const outcomeNames = {
  ready: '可以提交',
  already_committed: '原操作已提交',
  committed: '已提交',
  replayed: '原回执已恢复',
  failed: '已拒绝',
  unconfirmed: '结果未知',
};
const errorText = (failure: unknown) =>
  failure instanceof Error ? failure.message : '读取失败，请重试';
function allowed(
  catalog: Catalog,
  roleCode: string,
  action: NativeRoleManagementAction
) {
  return (
    catalog.roleManagement.unrestricted ||
    catalog.roleManagement.wildcardActions.includes(action) ||
    Boolean(
      catalog.roleManagement.roles
        .find((role) => role.roleCode === roleCode)
        ?.actions.includes(action)
    )
  );
}
function useRead<T>(key: string | undefined, read: () => Promise<T>) {
  const reader = useRef(read);
  reader.current = read;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key?: string;
    attempt: number;
    data?: T;
    error: string;
    loading: boolean;
  }>({ key, attempt, error: '', loading: Boolean(key) });
  useEffect(() => {
    let active = true;
    setState({ key, attempt, error: '', loading: Boolean(key) });
    if (key)
      void reader
        .current()
        .then((data) => {
          if (active)
            setState({ key, attempt, data, error: '', loading: false });
        })
        .catch((failure) => {
          if (active)
            setState({
              key,
              attempt,
              error: errorText(failure),
              loading: false,
            });
        });
    return () => {
      active = false;
    };
  }, [key, attempt]);
  const current =
    state.key === key && state.attempt === attempt
      ? state
      : { data: undefined, error: '', loading: Boolean(key) };
  return { ...current, reload: () => setAttempt((value) => value + 1) };
}

/** Current-user administration, shared by platform and application pages. */
export function RoleMembershipManager({
  initialRoleCode = '',
  refreshKey = 0,
}: RoleMembershipManagerProps) {
  const { message } = App.useApp();
  const catalog = useRead(
    `members-catalog:${refreshKey}`,
    loadRoleManagementCatalog
  );
  const [roleCode, setRoleCode] = useState(initialRoleCode),
    [keyword, setKeyword] = useState(''),
    [status, setStatus] = useState<'active' | 'expired' | 'revoked' | 'all'>(
      'active'
    );
  const [dimensionCode, setDimensionCode] = useState(''),
    [scopeValue, setScopeValue] = useState<string[]>(),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<NativeRoleMembership[]>([]),
    [editing, setEditing] = useState<Edit>(),
    [reference, setReference] = useState<string>();
  const blocked = Boolean(editing),
    query = {
      roleCode,
      keyword,
      status: status === 'all' ? undefined : status,
      ...(dimensionCode && scopeValue?.[0]
        ? { dimensionCode, scopeValue: scopeValue[0] }
        : {}),
      limit: 20,
      offset: (page - 1) * 20,
    };
  const members = useRead(
    catalog.data ? JSON.stringify([refreshKey, query]) : undefined,
    () => listRoleMemberships(query)
  );
  const role = catalog.data?.roles.find((item) => item.code === roleCode);
  const canCreate = catalog.data?.roles.some((item) =>
    allowed(catalog.data!, item.code, 'membership.assign')
  );
  const canUpdate = Boolean(
    selected.length &&
      catalog.data &&
      selected.every((row) =>
        allowed(catalog.data!, row.roleCode, 'membership.update')
      ) &&
      new Set(selected.map((row) => row.roleCode)).size === 1
  );
  const canRevoke = Boolean(
    selected.length &&
      catalog.data &&
      selected.every((row) =>
        allowed(catalog.data!, row.roleCode, 'membership.revoke')
      )
  );
  const selectRole = (value: string) => {
    setRoleCode(value);
    setSelected([]);
    setPage(1);
    setDimensionCode('');
    setScopeValue(undefined);
  };
  const open = (operation: Edit['operation'], rows = selected) => {
    if (catalog.data)
      setEditing({
        operation,
        rows,
        catalog: catalog.data,
        roleCode: rows[0]?.roleCode || roleCode,
      });
  };
  const rowSelect = (rows: NativeRoleMembership[]) => {
    if (rows.length > 50) {
      void message.info('一次最多选择 50 位成员');
      return;
    }
    setSelected(rows);
  };
  const selectable = (row: NativeRoleMembership) =>
    Boolean(
      row.maintainable &&
        row.status !== 'revoked' &&
        catalog.data &&
        (allowed(catalog.data, row.roleCode, 'membership.update') ||
          allowed(catalog.data, row.roleCode, 'membership.revoke'))
    );
  return (
    <div className="oxa-member-management">
      <div className="oxa-member-toolbar">
        <p className="oxa-member-help">
          在这里维护职责成员、业务范围与有效期。角色权限和流程条件由应用代码定义。
        </p>
        <Button
          type="primary"
          disabled={blocked || !canCreate}
          onClick={() => open('create', [])}
        >
          分配成员
        </Button>
      </div>
      {catalog.loading && <Skeleton active />}
      {catalog.error && (
        <Alert
          type="error"
          showIcon
          title="无法读取成员维护权限"
          description={catalog.error}
          action={
            <Button disabled={blocked} onClick={catalog.reload}>
              重试
            </Button>
          }
        />
      )}
      {catalog.data && (
        <div className="oxa-member-layout">
          <aside className="oxa-member-roles" aria-label="应用角色目录">
            <div className="oxa-member-role-title">
              应用角色 · {catalog.data.roles.length}
            </div>
            <Select
              aria-label="筛选应用角色"
              className="oxa-member-role-select"
              value={roleCode}
              disabled={blocked}
              options={[
                { value: '', label: '全部角色' },
                ...catalog.data.roles.map((item) => ({
                  value: item.code,
                  label: item.name,
                })),
              ]}
              onChange={selectRole}
            />
            <div className="oxa-member-role-buttons">
              <button
                type="button"
                className={!roleCode ? 'active' : ''}
                disabled={blocked}
                onClick={() => selectRole('')}
              >
                全部角色
              </button>
              {catalog.data.roles.map((item) => (
                <button
                  type="button"
                  className={roleCode === item.code ? 'active' : ''}
                  key={item.code}
                  disabled={blocked}
                  onClick={() => selectRole(item.code)}
                >
                  <strong>{item.name}</strong>
                  <small>{item.description || item.code}</small>
                </button>
              ))}
            </div>
          </aside>
          <section className="oxa-member-main">
            <div className="oxa-member-toolbar">
              <div>
                <h3>{role?.name || '全部成员'}</h3>
                <span className="oxa-member-help">
                  {role?.description ||
                    (role ? role.code : '仅显示当前有权读取的角色')}
                </span>
              </div>
              {role && (
                <Button
                  disabled={blocked}
                  onClick={() => setReference(role.code)}
                >
                  查看关联流程
                </Button>
              )}
            </div>
            <div className="oxa-member-filters">
              <Input.Search
                aria-label="搜索角色成员"
                allowClear
                placeholder="搜索成员名称或编号"
                disabled={blocked}
                onSearch={(value) => {
                  setKeyword(value.trim());
                  setPage(1);
                }}
              />
              <Select
                aria-label="成员状态"
                value={status}
                disabled={blocked}
                onChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
                options={[
                  { value: 'active', label: '有效成员' },
                  { value: 'expired', label: '已过期' },
                  { value: 'revoked', label: '已撤销' },
                  { value: 'all', label: '全部状态' },
                ]}
              />
              <Select
                aria-label="筛选范围维度"
                value={dimensionCode || undefined}
                allowClear
                disabled={blocked}
                placeholder="业务范围"
                options={catalog.data.scopeDimensions.map((item) => ({
                  value: item.code,
                  label: item.name,
                }))}
                onChange={(value) => {
                  setDimensionCode(value || '');
                  setScopeValue(undefined);
                  setPage(1);
                }}
              />
              {dimensionCode && (
                <ScopeChoices
                  key={dimensionCode}
                  dimensionCode={dimensionCode}
                  value={scopeValue}
                  disabled={blocked}
                  multiple={false}
                  onChange={(value) => {
                    setScopeValue(value);
                    setPage(1);
                  }}
                />
              )}
              <Button
                disabled={blocked}
                onClick={() => {
                  members.reload();
                  catalog.reload();
                }}
              >
                刷新成员
              </Button>
            </div>
            <div className="oxa-member-selection">
              <span>
                {selected.length
                  ? `已选择 ${selected.length} 位成员`
                  : '可跨页选择，最多 50 位'}
              </span>
              <Space wrap>
                <Button
                  disabled={blocked || !canUpdate}
                  onClick={() => open('update')}
                >
                  批量调整
                </Button>
                <Button
                  danger
                  disabled={blocked || !canRevoke}
                  onClick={() => open('revoke')}
                >
                  批量撤销
                </Button>
                {selected.length > 0 && (
                  <Button disabled={blocked} onClick={() => setSelected([])}>
                    清除选择
                  </Button>
                )}
              </Space>
            </div>
            {members.error && (
              <Alert
                type="error"
                showIcon
                title="成员读取失败"
                description={members.error}
                action={
                  <Button disabled={blocked} onClick={members.reload}>
                    重试
                  </Button>
                }
              />
            )}
            <Table<NativeRoleMembership>
              rowKey="id"
              size="small"
              loading={members.loading}
              dataSource={members.error ? [] : members.data?.items}
              scroll={{ x: 840 }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      members.error
                        ? '本次成员未读取成功，请重试'
                        : members.loading
                        ? '正在读取角色成员'
                        : '当前筛选下没有角色成员'
                    }
                  />
                ),
              }}
              rowSelection={{
                selectedRowKeys: selected.map((row) => row.id),
                preserveSelectedRowKeys: true,
                getCheckboxProps: (row) => ({
                  disabled: blocked || !selectable(row),
                }),
                onChange: (_keys: Key[], rows) => rowSelect(rows),
              }}
              pagination={{
                current: page,
                total: members.data?.total,
                pageSize: 20,
                showSizeChanger: false,
                disabled: blocked,
                onChange: setPage,
              }}
              columns={[
                {
                  title: '成员',
                  width: 170,
                  render: (_, row) => (
                    <>
                      <b>{row.userName || row.userId}</b>
                      <small className="oxa-member-sub">{row.userId}</small>
                    </>
                  ),
                },
                {
                  title: '角色 / 来源',
                  width: 165,
                  render: (_, row) => (
                    <>
                      {row.roleName || row.roleCode}
                      <small className="oxa-member-sub">
                        {row.maintainable
                          ? '手动维护'
                          : row.immutableReason === 'authenticated_user_role'
                          ? '系统认证成员'
                          : '同步授权投影'}{' '}
                        · r{row.revision}
                      </small>
                    </>
                  ),
                },
                {
                  title: '业务范围',
                  render: (_, row) =>
                    row.scopeGrants.length ? (
                      row.scopeGrants.map((grant) => (
                        <Tag key={grant.dimensionCode}>
                          {catalog.data?.scopeDimensions.find(
                            (item) => item.code === grant.dimensionCode
                          )?.name || grant.dimensionCode}{' '}
                          · {grant.values.length} 项
                        </Tag>
                      ))
                    ) : (
                      <span className="oxa-member-help">未单独限定</span>
                    ),
                },
                {
                  title: '有效期',
                  width: 180,
                  render: (_, row) => (
                    <>
                      {row.validTo ? formatTime(row.validTo) : '长期有效'}
                      {row.validFrom && (
                        <small className="oxa-member-sub">
                          自 {formatTime(row.validFrom)}
                        </small>
                      )}
                    </>
                  ),
                },
                {
                  title: '状态',
                  width: 85,
                  render: (_, row) => (
                    <Tag color={row.status === 'active' ? 'green' : 'default'}>
                      {statusNames[row.status]}
                    </Tag>
                  ),
                },
                {
                  title: '操作',
                  width: 135,
                  render: (_, row) =>
                    !row.maintainable ? (
                      <span className="oxa-member-help">来源只读</span>
                    ) : row.status === 'revoked' ? (
                      '—'
                    ) : (
                      <Space>
                        <Button
                          type="link"
                          size="small"
                          disabled={
                            blocked ||
                            !allowed(
                              catalog.data!,
                              row.roleCode,
                              'membership.update'
                            )
                          }
                          onClick={() => open('update', [row])}
                        >
                          调整
                        </Button>
                        <Button
                          type="link"
                          size="small"
                          danger
                          disabled={
                            blocked ||
                            !allowed(
                              catalog.data!,
                              row.roleCode,
                              'membership.revoke'
                            )
                          }
                          onClick={() => open('revoke', [row])}
                        >
                          撤销
                        </Button>
                      </Space>
                    ),
                },
              ]}
            />
          </section>
        </div>
      )}
      {editing && (
        <MembershipBatchEditor
          edit={editing}
          onClose={() => {
            setEditing(undefined);
            setSelected([]);
            members.reload();
            catalog.reload();
          }}
          onChanged={members.reload}
        />
      )}
      {reference && (
        <RoleReferences
          roleCode={reference}
          onClose={() => setReference(undefined)}
        />
      )}
    </div>
  );
}

function ScopeChoices({
  dimensionCode,
  value,
  onChange,
  disabled,
  multiple = true,
}: {
  dimensionCode: string;
  value?: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  multiple?: boolean;
}) {
  const [term, setTerm] = useState(''),
    [search, setSearch] = useState(''),
    [offset, setOffset] = useState(0),
    [known, setKnown] = useState<Record<string, string>>({});
  const listKey = JSON.stringify([dimensionCode, search]);
  const [pages, setPages] = useState<{
    key: string;
    options: Array<{ value: string; label: string }>;
  }>({ key: listKey, options: [] });
  const options = pages.key === listKey ? pages.options : [];
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(term);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);
  const result = useRead(JSON.stringify([dimensionCode, search, offset]), () =>
    listRoleManagementScopeValues(dimensionCode, {
      keyword: search,
      limit: 20,
      offset,
    })
  );
  useEffect(() => {
    if (result.data) {
      const data = result.data;
      setKnown((previous) =>
        Object.fromEntries([
          ...(value || []).map((id) => [id, previous[id] || id]),
          ...data.items.map((item) => [item.id, item.label]),
        ])
      );
      setPages((previous) => ({
        key: listKey,
        options: [
          ...new Map(
            [
              ...(data.offset && previous.key === listKey
                ? previous.options
                : []),
              ...data.items.map((item) => ({
                value: item.id,
                label: item.label,
              })),
            ].map((item) => [item.value, item])
          ).values(),
        ].slice(0, 200),
      }));
    }
  }, [result.data]);
  const choices = new Map([
    ...(value || []).map((id) => [id, known[id] || id] as const),
    ...options.map((item) => [item.value, item.label] as const),
  ]);
  return (
    <div className="oxa-member-picker">
      <Select<string | string[]>
        aria-label="选择范围值"
        mode={multiple ? 'multiple' : undefined}
        maxCount={multiple ? 100 : undefined}
        allowClear
        disabled={disabled}
        showSearch={{ filterOption: false, onSearch: setTerm }}
        loading={result.loading}
        value={multiple ? value : value?.[0]}
        placeholder="搜索并选择范围值"
        options={[...choices].map(([id, label]) => ({ value: id, label }))}
        onChange={(items) =>
          onChange(Array.isArray(items) ? items : items ? [items] : [])
        }
      />
      {result.error && (
        <span className="oxa-member-help" role="alert">
          {result.error}{' '}
          <Button
            type="link"
            size="small"
            disabled={disabled}
            onClick={result.reload}
          >
            重试
          </Button>
        </span>
      )}
      {result.data?.items.length === 20 && (
        <Button
          type="link"
          size="small"
          disabled={disabled || result.loading || options.length >= 200}
          onClick={() => setOffset((value) => value + 20)}
        >
          {options.length >= 200 ? '请细化搜索' : '更多范围值'}
        </Button>
      )}
    </div>
  );
}

function MemberChoices({
  value,
  onChange,
}: {
  value?: string[];
  onChange?: (value: string[]) => void;
}) {
  const [term, setTerm] = useState(''),
    [search, setSearch] = useState(''),
    [cursor, setCursor] = useState<string>(),
    [known, setKnown] = useState<Record<string, string>>({});
  const [pages, setPages] = useState<{
    key: string;
    options: Array<{ value: string; label: string; disabled: boolean }>;
  }>({ key: search, options: [] });
  const options = pages.key === search ? pages.options : [];
  const searchReady =
    search.length <= 64 &&
    (search.length >= 2 || /^\p{Script=Han}$/u.test(search));
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(term.trim());
      setCursor(undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);
  const result = useRead(
    searchReady ? JSON.stringify([search, cursor]) : undefined,
    () => searchRoleManagementUsers({ keyword: search, cursor, limit: 20 })
  );
  useEffect(() => {
    if (result.data) {
      const values = result.data.items.map((item) => ({
        value: item.id,
        label: item.label,
        disabled: !item.selectable,
      }));
      setKnown((previous) =>
        Object.fromEntries([
          ...(value || []).map((id) => [id, previous[id] || id]),
          ...values.map((item) => [item.value, item.label]),
        ])
      );
      setPages((previous) => ({
        key: search,
        options: [
          ...new Map(
            [
              ...(cursor && previous.key === search ? previous.options : []),
              ...values,
            ].map((item) => [item.value, item])
          ).values(),
        ].slice(0, 200),
      }));
    }
  }, [result.data]);
  const choices = new Map([
    ...(value || []).map(
      (id) =>
        [id, { value: id, label: known[id] || id, disabled: false }] as const
    ),
    ...options.map((item) => [item.value, item] as const),
  ]);
  return (
    <>
      <Select
        aria-label="选择成员"
        mode="multiple"
        maxCount={50}
        value={value}
        onChange={onChange}
        loading={result.loading}
        showSearch={{ filterOption: false, onSearch: setTerm }}
        placeholder="搜索并选择成员，最多 50 位"
        notFoundContent={searchReady ? undefined : '请输入姓名或账号搜索'}
        options={[...choices.values()]}
      />
      {!searchReady && (
        <p className="oxa-member-help">
          输入姓名或账号搜索，至少 2 个字符或 1 个汉字，最多 64 个字符。
        </p>
      )}
      {result.error && (
        <p className="oxa-member-help" role="alert">
          {result.error}{' '}
          <Button type="link" size="small" onClick={result.reload}>
            重试
          </Button>
        </p>
      )}
      {result.data?.nextCursor && (
        <Button
          type="link"
          size="small"
          disabled={result.loading || options.length >= 200}
          onClick={() => setCursor(result.data!.nextCursor!)}
        >
          {options.length >= 200 ? '请细化搜索' : '更多成员'}
        </Button>
      )}
    </>
  );
}

function MembershipBatchEditor({
  edit,
  onClose,
  onChanged,
}: {
  edit: Edit;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { modal } = App.useApp(),
    [form] = Form.useForm<MemberFormValues>();
  const [rows, setRows] = useState(edit.rows),
    [catalog, setCatalog] = useState(edit.catalog),
    [items, setItems] = useState<NativeRoleMembershipBatchItem[]>(),
    [proposal, setProposal] = useState<NativeRoleMembershipBatchResult>();
  const [outcomes, setOutcomes] = useState<
      Record<string, NativeRoleMembershipBatchItemResult>
    >({}),
    [receipts, setReceipts] = useState<
      Record<string, NativeAuthorizationMutationReceipt>
    >({}),
    [unknown, setUnknown] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [attempted, setAttempted] = useState(false),
    [dirty, setDirty] = useState(false);
  const roleCode =
    Form.useWatch('roleCode', form) ||
    edit.roleCode ||
    catalog.roles.find((role) =>
      allowed(catalog, role.code, 'membership.assign')
    )?.code ||
    '';
  const scopeMode = Form.useWatch('scopeMode', form),
    dimensionCode = Form.useWatch('dimensionCode', form),
    fromMode = Form.useWatch('fromMode', form),
    toMode = Form.useWatch('toMode', form);
  const dimensions = catalog.scopeDimensions.filter(
    (dimension) =>
      dimension.applicability.allRoles ||
      dimension.applicability.roleCodes.includes(roleCode)
  );
  const pending = items
      ? membershipBatchPending(items, outcomes, receipts)
      : [],
    unconfirmed = pending.filter(
      (item) =>
        unknown.includes(item.operationId) ||
        outcomes[item.operationId]?.status === 'unconfirmed'
    );
  const ready = pending.filter((item) =>
    ['ready'].includes(outcomes[item.operationId]?.status || '')
  );
  const unfinished = items ? pending.length > 0 : dirty;
  useEffect(() => {
    if (!unfinished && !busy) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [unfinished, busy]);
  const close = () => {
    if (busy) return;
    if (unfinished)
      modal.confirm({
        title: unconfirmed.length
          ? '关闭前请保留原操作编号'
          : '放弃当前未完成的成员维护？',
        content: unconfirmed.length
          ? '结果未知的操作可能已经提交。关闭后可按下方操作编号核对回执，请先复制编号。'
          : '已提交项会保留，未提交的草稿将被放弃。',
        okText: '关闭',
        cancelText: '继续核对',
        onOk: onClose,
      });
    else onClose();
  };
  const preview = async () => {
    setError('');
    let values: MemberFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (
      edit.operation === 'update' &&
      values.scopeMode === 'keep' &&
      values.fromMode === 'keep' &&
      values.toMode === 'keep'
    ) {
      setError('请选择至少一项需要调整的范围或有效期设置');
      return;
    }
    setBusy(true);
    try {
      const settings: MembershipBatchSettings = {
        reason: values.reason,
        scopeMode: values.scopeMode,
        dimensionCode: values.dimensionCode,
        scopeValues: values.scopeValues || [],
        fromMode: values.fromMode,
        toMode: values.toMode,
        validFrom: values.validFrom?.toISOString(),
        validTo: values.validTo?.toISOString(),
      };
      const candidate = membershipBatchItems(
        edit.operation,
        rows,
        values.users || [],
        roleCode,
        settings
      );
      assertNativeRoleMembershipBatchInput({
        schemaVersion: 'openxiangda.native-role-membership-batch-request/v2',
        items: candidate,
      });
      const response = await previewRoleMembershipBatch({ items: candidate });
      if (response.mode !== 'preview')
        throw new Error('预览响应与请求不一致，请重试');
      setOutcomes(membershipBatchMerge(candidate, {}, response.items));
      setProposal(response);
      setItems(candidate);
      setUnknown([]);
      setAttempted(false);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };
  const execute = async (target: NativeRoleMembershipBatchItem[]) => {
    if (!target.length) return;
    setBusy(true);
    setError('');
    setAttempted(true);
    try {
      const response = await executeRoleMembershipBatch({ items: target });
      if (
        response.mode !== 'execute' ||
        response.items.some(
          (item) =>
            item.status === 'ready' || item.status === 'already_committed'
        )
      )
        throw new Error('提交结果无法核对，请保留原操作编号');
      const merged = membershipBatchMerge(target, outcomes, response.items);
      setOutcomes(merged);
      setUnknown((previous) =>
        previous.filter((id) => !target.some((item) => item.operationId === id))
      );
      setReceipts((previous) => ({
        ...previous,
        ...Object.fromEntries(
          response.items.flatMap((item) =>
            item.status === 'committed' || item.status === 'replayed'
              ? [[item.operationId, item.result.receipt]]
              : []
          )
        ),
      }));
      onChanged();
    } catch (failure) {
      setError(errorText(failure));
      setUnknown((previous) => [
        ...new Set([...previous, ...target.map((item) => item.operationId)]),
      ]);
    } finally {
      setBusy(false);
    }
  };
  const recover = async () => {
    setBusy(true);
    setError('');
    let missing = 0;
    for (const item of unconfirmed) {
      try {
        const receipt = await loadAuthorizationMutationReceipt(
          item.operationId
        );
        if (!membershipBatchReceiptMatches(item, receipt))
          throw new Error('回执与原成员操作不一致');
        setReceipts((previous) => ({
          ...previous,
          [item.operationId]: receipt,
        }));
        setUnknown((previous) =>
          previous.filter((id) => id !== item.operationId)
        );
      } catch {
        missing++;
      }
    }
    if (missing)
      setError(
        `${missing} 项尚未核对到匹配回执，请保留原操作编号；可显式重试相同操作。`
      );
    else onChanged();
    setBusy(false);
  };
  const rebase = async () => {
    if (unconfirmed.length) return;
    setBusy(true);
    setError('');
    try {
      const nextCatalog = await loadRoleManagementCatalog();
      if (items && edit.operation !== 'create') {
        const wanted = rows.filter((row) =>
          pending.some(
            (item) =>
              item.operation !== 'create' && item.membershipId === row.id
          )
        );
        const fresh: NativeRoleMembership[] = [];
        for (const row of wanted) {
          const page = await listRoleMemberships({
            userId: row.userId,
            roleCode: row.roleCode,
            limit: 20,
            offset: 0,
          });
          const current = page.items.find((item) => item.id === row.id);
          if (!current || !current.maintainable || current.status === 'revoked')
            throw new Error(
              `成员 ${
                row.userName || row.userId
              } 已撤销或不再可维护，请关闭后重新选择`
            );
          fresh.push(current);
        }
        setRows(fresh);
      } else if (items && edit.operation === 'create')
        form.setFieldValue(
          'users',
          pending.flatMap((item) =>
            item.operation === 'create' ? [item.userId] : []
          )
        );
      setCatalog(nextCatalog);
      setItems(undefined);
      setProposal(undefined);
      setOutcomes({});
      setUnknown([]);
      setAttempted(false);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };
  const title =
    edit.operation === 'create'
      ? '分配角色成员'
      : edit.operation === 'update'
      ? '调整角色成员'
      : '撤销角色成员';
  return (
    <Drawer
      open
      title={title}
      size={900}
      className="oxa-member-drawer"
      onClose={close}
      footer={
        <div className="oxa-member-footer">
          <span>
            {busy
              ? '正在核对平台结果'
              : items
              ? `待处理 ${pending.length} 项 · 原操作编号已保留`
              : '预览后核对差异，再显式提交'}
          </span>
          <Space wrap>
            <Button disabled={busy} onClick={close}>
              关闭
            </Button>
            {!items ? (
              <Button
                type="primary"
                loading={busy}
                disabled={busy}
                onClick={() => void preview()}
              >
                预览变更
              </Button>
            ) : (
              <>
                {!attempted && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setItems(undefined);
                      setProposal(undefined);
                      setOutcomes({});
                    }}
                  >
                    返回编辑
                  </Button>
                )}
                {pending.length > 0 && !unconfirmed.length && (
                  <Button disabled={busy} onClick={() => void rebase()}>
                    载入最新基准并保留输入
                  </Button>
                )}
                {unconfirmed.length > 0 ? (
                  <>
                    <Button disabled={busy} onClick={() => void recover()}>
                      核对未知结果
                    </Button>
                    <Button
                      type="primary"
                      loading={busy}
                      disabled={busy}
                      onClick={() => void execute(unconfirmed)}
                    >
                      重试相同操作 · {unconfirmed.length} 项
                    </Button>
                  </>
                ) : (
                  ready.length > 0 && (
                    <Button
                      type="primary"
                      danger={edit.operation === 'revoke'}
                      loading={busy}
                      disabled={busy}
                      onClick={() => void execute(ready)}
                    >
                      提交可执行的 {ready.length} 项
                    </Button>
                  )
                )}
              </>
            )}
          </Space>
        </div>
      }
    >
      <p className="oxa-member-help">
        只维护成员授权。已有待办保留参与快照，实际办理仍复核当前资格；新成员在以后分派时参与解析。
      </p>
      {error && (
        <Alert
          type="error"
          showIcon
          title="成员维护尚未完成"
          description={error}
          style={{ marginBottom: 16 }}
        />
      )}
      {!items ? (
        <Form
          form={form}
          layout="vertical"
          disabled={busy}
          onValuesChange={() => setDirty(true)}
          initialValues={{
            roleCode:
              edit.roleCode ||
              catalog.roles.find((role) =>
                allowed(catalog, role.code, 'membership.assign')
              )?.code,
            scopeMode: 'keep',
            scopeValues: [],
            fromMode: 'keep',
            toMode: 'keep',
          }}
        >
          {edit.operation === 'create' ? (
            <>
              <Form.Item
                name="users"
                label="成员"
                rules={[
                  {
                    required: true,
                    type: 'array',
                    min: 1,
                    message: '请选择至少一位成员',
                  },
                ]}
              >
                <MemberChoices />
              </Form.Item>
              <Form.Item
                name="roleCode"
                label="角色"
                rules={[{ required: true, message: '请选择角色' }]}
              >
                <Select
                  aria-label="分配的应用角色"
                  options={catalog.roles
                    .filter((role) =>
                      allowed(catalog, role.code, 'membership.assign')
                    )
                    .map((role) => ({ value: role.code, label: role.name }))}
                  onChange={() => {
                    form.setFieldValue('dimensionCode', undefined);
                    form.setFieldValue('scopeValues', []);
                  }}
                />
              </Form.Item>
            </>
          ) : (
            <div className="oxa-member-draft-summary">
              <b>
                {rows.length} 位成员 ·{' '}
                {catalog.roles.find((role) => role.code === roleCode)?.name ||
                  roleCode}
              </b>
              <p>{rows.map((row) => row.userName || row.userId).join('、')}</p>
              <span>使用读取时的成员修订；其他管理员修改后会明确冲突。</span>
            </div>
          )}
          {edit.operation !== 'revoke' && (
            <>
              <Form.Item name="scopeMode" label="业务范围">
                <Select
                  aria-label="范围调整方式"
                  options={[
                    {
                      value: 'keep',
                      label:
                        edit.operation === 'create'
                          ? '不单独限定范围'
                          : '保持每位成员的现有范围',
                    },
                    ...(dimensions.length
                      ? [
                          {
                            value: 'replace_dimension',
                            label: '调整一个范围维度',
                          },
                        ]
                      : []),
                    ...(edit.operation === 'update'
                      ? [{ value: 'clear_all', label: '清空全部成员范围' }]
                      : []),
                  ]}
                />
              </Form.Item>
              {scopeMode === 'replace_dimension' && (
                <>
                  <Form.Item
                    name="dimensionCode"
                    label="范围维度"
                    rules={[{ required: true, message: '请选择范围维度' }]}
                  >
                    <Select
                      aria-label="调整的范围维度"
                      options={dimensions.map((dimension) => ({
                        value: dimension.code,
                        label: dimension.name,
                      }))}
                      onChange={() => form.setFieldValue('scopeValues', [])}
                    />
                  </Form.Item>
                  {dimensionCode && (
                    <Form.Item
                      name="scopeValues"
                      label="范围值"
                      help="替换此维度的值，保留其他维度及已有操作上限；留空仅移除此维度。"
                    >
                      <ScopeChoices
                        key={dimensionCode}
                        dimensionCode={dimensionCode}
                        value={form.getFieldValue('scopeValues')}
                        onChange={(value) => {
                          form.setFieldValue('scopeValues', value);
                          setDirty(true);
                        }}
                      />
                    </Form.Item>
                  )}
                </>
              )}
              {scopeMode === 'clear_all' && (
                <Alert
                  type="warning"
                  showIcon
                  title="将清空所有成员范围"
                  description="角色本身的权限保持，范围变化将由已发布的数据规则解释。"
                />
              )}
              <div className="oxa-member-time-grid">
                <div>
                  <Form.Item name="fromMode" label="开始时间">
                    <Select
                      aria-label="开始时间调整方式"
                      options={[
                        {
                          value: 'keep',
                          label:
                            edit.operation === 'create'
                              ? '立即开始'
                              : '保持原开始时间',
                        },
                        { value: 'set', label: '指定开始时间' },
                        { value: 'clear', label: '取消开始限制' },
                      ]}
                    />
                  </Form.Item>
                  {fromMode === 'set' && (
                    <Form.Item
                      name="validFrom"
                      label="新的开始时间"
                      rules={[{ required: true, message: '请填写开始时间' }]}
                    >
                      <DatePicker showTime style={{ width: '100%' }} />
                    </Form.Item>
                  )}
                </div>
                <div>
                  <Form.Item name="toMode" label="到期时间">
                    <Select
                      aria-label="到期时间调整方式"
                      options={[
                        {
                          value: 'keep',
                          label:
                            edit.operation === 'create'
                              ? '长期有效'
                              : '保持原到期时间',
                        },
                        { value: 'set', label: '指定到期时间' },
                        { value: 'clear', label: '取消到期限制' },
                      ]}
                    />
                  </Form.Item>
                  {toMode === 'set' && (
                    <Form.Item
                      name="validTo"
                      label="新的到期时间"
                      rules={[{ required: true, message: '请填写到期时间' }]}
                    >
                      <DatePicker showTime style={{ width: '100%' }} />
                    </Form.Item>
                  )}
                </div>
              </div>
            </>
          )}
          <Form.Item
            name="reason"
            label="操作原因"
            rules={[
              {
                required: true,
                whitespace: true,
                message: '请填写此次成员维护的原因',
              },
            ]}
          >
            <Input.TextArea rows={2} maxLength={1000} />
          </Form.Item>
          {edit.operation === 'revoke' && (
            <Alert
              type="warning"
              showIcon
              title="撤销成员角色"
              description="撤销后的权限在后续请求中重新计算。这里不会改派已经生成的流程待办。"
            />
          )}
        </Form>
      ) : (
        <>
          <Alert
            type={
              unconfirmed.length
                ? 'warning'
                : pending.length
                ? 'info'
                : 'success'
            }
            showIcon
            title={
              unconfirmed.length
                ? '部分操作结果未知，请按原编号恢复'
                : pending.length
                ? '逐项核对变更和平台结果'
                : '本次操作均已核对'
            }
            description={
              proposal
                ? '预览没有持久修改。提交会逐项再次检查权限、范围和修订，允许部分成功。'
                : undefined
            }
          />
          <Table
            rowKey="operationId"
            size="small"
            dataSource={items}
            scroll={{ x: 650 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            columns={[
              {
                title: '成员 / 操作编号',
                render: (_, item) => (
                  <>
                    {item.operation === 'create'
                      ? item.userId
                      : rows.find((row) => row.id === item.membershipId)
                          ?.userName ||
                        rows.find((row) => row.id === item.membershipId)
                          ?.userId ||
                        item.membershipId}
                    <small className="oxa-member-operation-id">
                      {item.operationId}
                    </small>
                  </>
                ),
              },
              {
                title: '核对结果',
                width: 165,
                render: (_, item) => {
                  const receipt = receipts[item.operationId],
                    outcome = outcomes[item.operationId];
                  return (
                    <>
                      <Tag
                        color={
                          receipt
                            ? 'green'
                            : unknown.includes(item.operationId) ||
                              outcome?.status === 'unconfirmed'
                            ? 'orange'
                            : outcome?.status === 'failed'
                            ? 'red'
                            : 'blue'
                        }
                      >
                        {receipt
                          ? '已提交 · 回执可核对'
                          : unknown.includes(item.operationId)
                          ? '结果未知'
                          : outcomeNames[outcome?.status || 'unconfirmed']}
                      </Tag>
                      {outcome &&
                        (outcome.status === 'failed' ||
                          outcome.status === 'unconfirmed') &&
                        !receipt && (
                          <small className="oxa-member-sub">
                            {memberError(outcome.error.code)}
                            <br />
                            {outcome.error.pointer}
                          </small>
                        )}
                    </>
                  );
                },
              },
              { title: '修改原因', render: (_, item) => item.reason },
            ]}
            expandable={{
              defaultExpandAllRows: items.length <= 3,
              expandedRowRender: (item) => {
                const outcome = outcomes[item.operationId],
                  receipt = receipts[item.operationId];
                return outcome &&
                  (outcome.status === 'ready' ||
                    outcome.status === 'already_committed') ? (
                  <div className="oxa-member-diff">
                    <MemberChange title="修改前" value={outcome.before} />
                    <MemberChange title="修改后" value={outcome.after} />
                  </div>
                ) : receipt ? (
                  <Descriptions
                    size="small"
                    column={1}
                    items={[
                      {
                        key: 'operation',
                        label: '原操作编号',
                        children: receipt.operationId,
                      },
                      {
                        key: 'createdAt',
                        label: '提交时间',
                        children: formatTime(receipt.createdAt),
                      },
                      {
                        key: 'kind',
                        label: '操作',
                        children: receipt.operationKind,
                      },
                    ]}
                  />
                ) : (
                  <p>请先处理此项的拒绝或未知结果。</p>
                );
              },
              rowExpandable: (item) =>
                Boolean(
                  outcomes[item.operationId] || receipts[item.operationId]
                ),
            }}
          />
        </>
      )}
      {Object.keys(receipts).length > 0 && (
        <p className="oxa-member-help">
          此页面已核对 {Object.keys(receipts).length}{' '}
          项原回执；重新编辑只处理尚未提交的成员。
        </p>
      )}
    </Drawer>
  );
}

function MemberChange({
  title,
  value,
}: {
  title: string;
  value: NativeRoleMembershipChange | null;
}) {
  return (
    <section>
      <h4>{title}</h4>
      {value ? (
        <Descriptions
          size="small"
          column={1}
          items={[
            { key: 'member', label: '成员', children: value.userId },
            { key: 'role', label: '角色', children: value.roleCode },
            {
              key: 'scopes',
              label: '范围',
              children: value.scopeGrants.length
                ? value.scopeGrants.map((grant) => (
                    <div key={grant.dimensionCode}>
                      {grant.dimensionCode}：{grant.values.join('、')}（
                      {grant.operations.join('、')}）
                    </div>
                  ))
                : '未单独限定',
            },
            {
              key: 'from',
              label: '开始',
              children: value.validFrom
                ? formatTime(value.validFrom)
                : '立即开始',
            },
            {
              key: 'to',
              label: '到期',
              children: value.validTo ? formatTime(value.validTo) : '长期有效',
            },
            {
              key: 'status',
              label: '状态',
              children: statusNames[value.status],
            },
          ]}
        />
      ) : (
        <p>尚无成员授权</p>
      )}
    </section>
  );
}
function memberError(code: string) {
  if (code.includes('REVISION_CONFLICT')) return '成员已被修改，请载入最新基准';
  if (code.includes('ACTION_REQUIRED') || code.includes('FORBIDDEN'))
    return '没有此角色的维护权限';
  if (code.includes('IMMUTABLE') || code.includes('PROJECTION'))
    return '该来源由平台自动维护';
  if (code.includes('SCOPE')) return '范围配置不合法或已失效';
  return code;
}
function formatTime(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}
function RoleReferences({
  roleCode,
  onClose,
}: {
  roleCode: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    [keyword, setKeyword] = useState('');
  const result = useRead(JSON.stringify([roleCode, page, keyword]), () =>
    loadWorkflowRoleReferences(roleCode, {
      keyword,
      limit: 20,
      offset: (page - 1) * 20,
    })
  );
  return (
    <Drawer open title="角色关联的潜在流程节点" size={900} onClose={onClose}>
      <p className="oxa-member-help">
        按激活和在途固定版本查看可能使用此职责的节点。路由许可来源不表示规则实际命中，也不代表旧任务会被改派。
      </p>
      <Input.Search
        aria-label="搜索关联流程节点"
        placeholder="搜索流程或节点"
        allowClear
        onSearch={(value) => {
          setKeyword(value.trim());
          setPage(1);
        }}
        style={{ marginBottom: 16 }}
      />
      {result.error && (
        <Alert
          type="error"
          showIcon
          title="关联流程读取失败或没有管理权限"
          description={result.error}
          action={<Button onClick={result.reload}>重试</Button>}
        />
      )}
      <Table
        rowKey={(item) =>
          `${item.workflowCode}:${item.definitionVersion}:${
            item.bindingVersion
          }:${item.nodeId}:${item.source}:${item.routingSourceCode || ''}`
        }
        size="small"
        loading={result.loading}
        dataSource={result.data?.items}
        scroll={{ x: 750 }}
        pagination={{
          current: page,
          total: result.data?.total,
          pageSize: 20,
          showSizeChanger: false,
          onChange: setPage,
        }}
        columns={[
          {
            title: '流程 / 节点',
            render: (_, item) => (
              <>
                <b>{item.workflowTitle}</b>
                <small className="oxa-member-sub">
                  {item.nodeTitle} · {item.workflowCode}/{item.nodeId}
                </small>
              </>
            ),
          },
          {
            title: '版本',
            render: (_, item) => (
              <>
                定义 v{item.definitionVersion} / 绑定 v{item.bindingVersion}
                <small className="oxa-member-sub">
                  配置 r{item.configurationRevision}
                </small>
              </>
            ),
          },
          {
            title: '使用上下文',
            render: (_, item) =>
              item.contexts.map((context) => (
                <Tag key={context}>
                  {context === 'active' ? '当前激活' : '在途固定版本'}
                </Tag>
              )),
          },
          {
            title: '来源',
            render: (_, item) => (
              <>
                {item.source === 'default_binding'
                  ? '代码默认角色'
                  : item.source === 'node_override'
                  ? '节点配置覆盖'
                  : '代码许可路由来源'}
                {item.routingSourceCode && (
                  <small className="oxa-member-sub">
                    {item.routingSourceCode}
                  </small>
                )}
                {item.scopeDimensionCode && (
                  <small className="oxa-member-sub">
                    范围维度：{item.scopeDimensionCode}
                  </small>
                )}
              </>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
