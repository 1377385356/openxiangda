import { PresentationTime } from '../../presentation-time';
import {
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FilterOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type {
  ApplicationTodoCenterPageV2,
  ApplicationTodoItemV2,
  ApplicationTodoViewV2,
} from 'openxiangda-contracts/browser';
import {
  App,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Pagination,
  Segmented,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminContributions } from '../../admin-contributions';
import {
  loadApplicationTodos,
  recordApplicationTodoInteraction,
} from '../../platform-client';
import type {
  StandardApplicationTodoCenterProps,
  StandardApplicationTodoQuery,
  StandardApplicationTodoQueryUpdate,
} from '../../standard-user-surfaces';

type PageVariant = 'desktop' | 'mobile';

const VIEW_LABELS: Record<ApplicationTodoViewV2, string> = {
  all: '全部消息',
  pending: '待处理',
  informational: '消息',
  completed: '已完成',
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '待办加载失败';
}

function freezeTodoPage(
  page: ApplicationTodoCenterPageV2,
): ApplicationTodoCenterPageV2 {
  return Object.freeze({
    ...page,
    counts: Object.freeze({ ...page.counts }),
    items: Object.freeze(
      page.items.map(item =>
        Object.freeze({
          ...item,
          fields: Object.freeze(
            item.fields.map(field => Object.freeze({ ...field })),
          ),
          actions: Object.freeze(
            item.actions.map(action => Object.freeze({ ...action })),
          ),
          navigation: Object.freeze({ ...item.navigation }),
        }),
      ),
    ),
  }) as ApplicationTodoCenterPageV2;
}

function stateLabel(state: ApplicationTodoItemV2['state']) {
  return {
    action_required: '待处理',
    informational: '提醒',
    completed: '已完成',
    rejected: '已拒绝',
    cancelled: '已取消',
    closed: '已关闭',
  }[state];
}

function stateColor(state: ApplicationTodoItemV2['state']) {
  if (state === 'action_required') return 'processing';
  if (state === 'informational') return 'warning';
  if (state === 'completed') return 'success';
  return 'default';
}

function formatTime(value: string) {
  return <PresentationTime value={value} options={{
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }} />;
}

function formatFieldValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  try {
    const result = JSON.stringify(value);
    return result.length > 80 ? `${result.slice(0, 80)}…` : result;
  } catch {
    return '—';
  }
}

function TodoSummary({
  counts,
}: {
  counts: StandardApplicationTodoCenterProps['counts'];
}) {
  const values = [
    { key: 'pending', label: '待处理', value: counts.pending, icon: <ClockCircleOutlined /> },
    { key: 'informational', label: '消息', value: counts.informational, icon: <BellOutlined /> },
    { key: 'unread', label: '未读', value: counts.unread, icon: <Badge status="processing" /> },
    { key: 'completed', label: '已完成', value: counts.completed, icon: <CheckCircleOutlined /> },
  ];
  return (
    <section aria-label="待办概览" className="oxa-todo-summary">
      {values.map(item => (
        <div className="oxa-todo-summary-item" key={item.key}>
          <span className="oxa-todo-summary-icon">{item.icon}</span>
          <span>
            <Typography.Text type="secondary">{item.label}</Typography.Text>
            <strong>{item.value}</strong>
          </span>
        </div>
      ))}
    </section>
  );
}

function TodoFields({ item }: { item: ApplicationTodoItemV2 }) {
  return item.fields.length ? (
    <dl className="oxa-todo-fields">
      {item.fields.slice(0, 8).map(field => (
        <div key={field.code}>
          <dt>{field.label}</dt>
          <dd>{formatFieldValue(field.value)}</dd>
        </div>
      ))}
    </dl>
  ) : null;
}

function TodoTableFields({ item }: { item: ApplicationTodoItemV2 }) {
  if (!item.fields.length) return <Typography.Text type="secondary">—</Typography.Text>;
  return (
    <div className="oxa-todo-table-fields">
      {item.fields.slice(0, 3).map(field => {
        const value = formatFieldValue(field.value);
        return (
          <span key={field.code} title={`${field.label}：${value}`}>
            <Typography.Text type="secondary">{field.label}</Typography.Text>
            <Typography.Text>{value}</Typography.Text>
          </span>
        );
      })}
    </div>
  );
}

const EMPTY_COUNTS = Object.freeze({
  pending: 0,
  informational: 0,
  completed: 0,
  unread: 0,
});

function useApplicationTodoCenter(
  variant: PageVariant,
  messageCenter = false,
): StandardApplicationTodoCenterProps {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [view, setView] = useState<ApplicationTodoViewV2>(messageCenter ? 'all' : 'pending');
  const [keyword, setKeyword] = useState('');
  const [unread, setUnread] = useState(false);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<
    Awaited<ReturnType<typeof loadApplicationTodos>> | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const limit = variant === 'mobile' ? 10 : 12;
  const query = useMemo<Readonly<StandardApplicationTodoQuery>>(
    () => Object.freeze({ view, keyword, unread, offset, limit }),
    [keyword, limit, offset, unread, view],
  );

  const performLoad = useCallback(
    async (
      requestedQuery: Readonly<StandardApplicationTodoQuery>,
      mode: 'replace' | 'append',
    ) => {
      const requestId = ++requestSequence.current;
      if (mode === 'append') setLoadingMore(true);
      else { setLoading(true); setPage(null); }
      setLoadError(null);
      try {
        const result = freezeTodoPage(
          await loadApplicationTodos({
            view: requestedQuery.view,
            keyword: requestedQuery.keyword,
            unread: requestedQuery.unread,
            limit: requestedQuery.limit,
            offset: requestedQuery.offset,
          }),
        );
        if (requestId !== requestSequence.current) return;
        setPage(current => {
          if (mode !== 'append' || !current) return result;
          const items = [...current.items];
          const seen = new Set(items.map(item => item.messageId));
          for (const item of result.items) {
            if (!seen.has(item.messageId)) items.push(item);
          }
          return freezeTodoPage({
            ...result,
            items,
            offset: current.offset,
            limit: current.limit,
          });
        });
      } catch (error) {
        if (requestId !== requestSequence.current) return;
        const detail = errorMessage(error);
        setLoadError(detail);
        message.error(detail);
      } finally {
        if (requestId === requestSequence.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [message],
  );

  useEffect(() => {
    void performLoad(query, 'replace');
    return () => {
      requestSequence.current += 1;
    };
  }, [performLoad, query]);

  const updateQuery = useCallback(
    (update: StandardApplicationTodoQueryUpdate) => {
      if (
        update.view !== undefined &&
        !(['all', 'pending', 'informational', 'completed'] as const).includes(
          update.view,
        )
      ) {
        throw new Error('OPENXIANGDA_TODO_QUERY_INVALID:view');
      }
      if (
        update.offset !== undefined &&
        (!Number.isSafeInteger(update.offset) ||
          update.offset < 0 ||
          update.offset > 10_000)
      ) {
        throw new Error('OPENXIANGDA_TODO_QUERY_INVALID:offset');
      }
      const changesFilter =
        update.view !== undefined ||
        update.keyword !== undefined ||
        update.unread !== undefined;
      if (update.view !== undefined) setView(update.view);
      if (update.keyword !== undefined) {
        setKeyword(update.keyword.trim().slice(0, 100));
      }
      if (update.unread !== undefined) setUnread(Boolean(update.unread));
      if (update.offset !== undefined) setOffset(update.offset);
      else if (changesFilter) setOffset(0);
    },
    [],
  );

  const assertCurrentItem = useCallback(
    (item: Readonly<ApplicationTodoItemV2>) => {
      if (!page?.items.some(candidate => candidate === item)) {
        throw new Error('OPENXIANGDA_TODO_ITEM_NOT_CURRENT');
      }
    },
    [page],
  );

  const interact = useCallback(
    async (item: Readonly<ApplicationTodoItemV2>, kind: 'read' | 'click') => {
      assertCurrentItem(item);
      return await recordApplicationTodoInteraction(item.messageId, kind);
    },
    [assertCurrentItem],
  );

  const openItem = useCallback(
    async (item: Readonly<ApplicationTodoItemV2>) => {
      assertCurrentItem(item);
      const path =
        variant === 'mobile'
          ? item.navigation.mobilePath
          : item.navigation.desktopPath;
      if (!path || item.navigation.navigationUnavailable) {
        message.warning('该消息的目标页面当前不可用');
        return;
      }
      try {
        await interact(item, 'click');
      } catch {
        // The target performs its own authorization; a receipt outage cannot grant access.
      }
      if (item.navigation.external) window.location.assign(path);
      else navigate(path);
    },
    [assertCurrentItem, interact, message, navigate, variant],
  );

  const refresh = useCallback(
    async () => await performLoad(query, 'replace'),
    [performLoad, query],
  );
  const loadMore = useCallback(async () => {
    if (loading || loadingMore || page?.nextOffset == null) return;
    await performLoad(
      Object.freeze({ ...query, offset: page.nextOffset }),
      'append',
    );
  }, [loading, loadingMore, page?.nextOffset, performLoad, query]);

  return {
    device: variant,
    mobile: variant === 'mobile',
    items: page?.items || [],
    counts: page?.counts || EMPTY_COUNTS,
    total: page?.total || 0,
    loading,
    loadingMore,
    error: loadError,
    query,
    hasMore: page?.nextOffset != null,
    setQuery: updateQuery,
    refresh,
    loadMore,
    recordInteraction: interact,
    openItem,
  };
}

export function DefaultApplicationTodoCenter({
  device: variant,
  items,
  counts,
  total,
  loading,
  error: loadError,
  query,
  setQuery,
  refresh,
  openItem,
  messageCenter = false,
}: StandardApplicationTodoCenterProps & { messageCenter?: boolean }) {
  const [keywordDraft, setKeywordDraft] = useState(query.keyword);
  useEffect(() => setKeywordDraft(query.keyword), [query.keyword]);
  const { view, keyword, unread: unreadOnly, offset, limit } = query;

  const columns: TableColumnsType<ApplicationTodoItemV2> = [
    {
      title: messageCenter ? '消息标题' : '任务标题',
      key: 'title',
      width: 300,
      render: (_, item) => (
        <div className="oxa-todo-table-title">
          <div>
            <span className="oxa-todo-title-line">
              <Badge dot={item.interactionState === 'unread'}>
                <span className="oxa-todo-unread-anchor" />
              </Badge>
              <Typography.Text strong>{item.title}</Typography.Text>
              {item.interactionState === 'unread' ? <Tag color="blue">未读</Tag> : null}
            </span>
            {item.summary ? (
              <Typography.Paragraph ellipsis={{ rows: 1 }} type="secondary">
                {item.summary}
              </Typography.Paragraph>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      title: '来源',
      dataIndex: 'sourceLabel',
      key: 'source',
      width: 120,
    },
    {
      title: '关键信息',
      key: 'fields',
      render: (_, item) => <TodoTableFields item={item} />,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 130,
      render: value => formatTime(value),
    },
    {
      title: '状态',
      dataIndex: 'state',
      key: 'state',
      width: 90,
      render: state => <Tag color={stateColor(state)}>{stateLabel(state)}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, item) => (
        <Button
          aria-label={`查看详情：${item.title}`}
          disabled={item.navigation.navigationUnavailable}
          onClick={() => void openItem(item)}
          title={item.navigation.navigationUnavailable ? '目标页面当前不可用' : undefined}
          type="link"
        >
          查看详情
        </Button>
      ),
    },
  ];

  const list = (
    <div className="oxa-todo-list" role="list">
      {items.map(item => (
        <article className="oxa-todo-row" key={item.messageId} role="listitem">
          <Badge dot={item.interactionState === 'unread'}>
            <span className="oxa-todo-unread-anchor" />
          </Badge>
          <div className="oxa-todo-row-main">
            <div className="oxa-todo-row-title">
              <Typography.Text strong>{item.title}</Typography.Text>
              <Tag color={stateColor(item.state)}>{stateLabel(item.state)}</Tag>
            </div>
            {item.summary ? (
              <Typography.Paragraph ellipsis={{ rows: 2 }} type="secondary">
                {item.summary}
              </Typography.Paragraph>
            ) : null}
            <TodoFields item={item} />
            <div className="oxa-todo-row-meta">
              <span>{item.sourceLabel}</span>
              <span>{formatTime(item.occurredAt)}</span>
            </div>
          </div>
          <Button
            disabled={item.navigation.navigationUnavailable}
            onClick={event => {
              event.stopPropagation();
              void openItem(item);
            }}
            type={item.state === 'action_required' ? 'primary' : 'default'}
          >
            查看详情
          </Button>
        </article>
      ))}
      {!loading && !items.length ? <Empty description="暂无相关待办" /> : null}
    </div>
  );

  return (
    <main className={`oxa-todo-center oxa-todo-center-${variant}`}>
      <header aria-labelledby="todo-center-title" className="oxa-todo-header">
        <div>
          <Typography.Title id="todo-center-title" level={variant === 'mobile' ? 3 : 2}>{messageCenter ? '消息中心' : '待办中心'}</Typography.Title>
          {variant === 'desktop' ? (
            <Typography.Text type="secondary">
              {messageCenter ? '你在当前应用收到的消息' : '当前应用内需要处理的流程与业务消息'}
            </Typography.Text>
          ) : null}
        </div>
        <Button onClick={() => void refresh()}>刷新</Button>
      </header>
      {!messageCenter && <TodoSummary counts={counts} />}
      <nav aria-label="待办视图">
        <Segmented
          block
          onChange={value =>
            setQuery({ view: value as ApplicationTodoViewV2 })
          }
          options={(Object.keys(VIEW_LABELS) as ApplicationTodoViewV2[]).filter(key => messageCenter || key !== 'all').map(key => ({
            label: messageCenter ? ({ all: '全部消息', pending: '待处理', informational: '通知', completed: '已结束' })[key] : VIEW_LABELS[key],
            value: key,
          }))}
          value={view}
        />
      </nav>
      <form
        className="oxa-todo-toolbar"
        onSubmit={event => {
          event.preventDefault();
          setQuery({ keyword: keywordDraft });
        }}
        role="search"
      >
        <Input
          aria-label="搜索待办标题或摘要"
          allowClear
          maxLength={100}
          onChange={event => setKeywordDraft(event.target.value)}
          placeholder="搜索标题或摘要"
          prefix={<SearchOutlined />}
          value={keywordDraft}
        />
        <Button
          icon={<FilterOutlined />}
          htmlType="submit"
        >
          查询
        </Button>
        <label className="oxa-todo-unread-filter">
          <Switch
            aria-label="仅看未读"
            checked={unreadOnly}
            onChange={checked => setQuery({ unread: checked })}
            size="small"
          />
          <Typography.Text>仅看未读</Typography.Text>
        </label>
      </form>
      {variant === 'desktop' ? (
        <Card className="oxa-todo-list-card">
          <section aria-busy={loading} aria-label="待办列表">
            {loadError ? (
              <div className="oxa-todo-inline-error" role="alert">
                <Typography.Text type="danger">{loadError}</Typography.Text>
                <Button onClick={() => void refresh()} size="small">重新加载</Button>
              </div>
            ) : null}
            <Table<ApplicationTodoItemV2>
              className="oxa-todo-table"
              columns={columns}
              dataSource={items}
              loading={loading}
              locale={{
                emptyText: loadError ? (
                  <Empty description="暂时无法加载待办" />
                ) : (
                  <Empty description={keyword || unreadOnly ? '暂无匹配结果' : messageCenter ? '暂无消息' : '暂无待办'} />
                ),
              }}
              pagination={false}
              rowKey="messageId"
              scroll={{ x: 900 }}
              size="middle"
            />
          </section>
        </Card>
      ) : (
        <section aria-busy={loading} aria-label="待办列表">
          {loadError ? (
            <div className="oxa-todo-inline-error" role="alert">
              <Typography.Text type="danger">{loadError}</Typography.Text>
              <Button onClick={() => void refresh()} size="small">重新加载</Button>
            </div>
          ) : null}
          {loadError && !items.length ? <Empty description="暂时无法加载待办" /> : list}
        </section>
      )}
      {total > limit ? (
        <Pagination
          current={Math.floor(offset / limit) + 1}
          onChange={next => setQuery({ offset: (next - 1) * limit })}
          pageSize={limit}
          showSizeChanger={false}
          showTotal={total => `共 ${total} 条`}
          simple={variant === 'mobile'}
          total={total}
        />
      ) : null}
    </main>
  );
}

export function ApplicationTodoCenterPage({
  variant = 'desktop',
  messageCenter = false,
}: {
  variant?: PageVariant;
  messageCenter?: boolean;
}) {
  const contributions = useAdminContributions();
  const props = useApplicationTodoCenter(variant, messageCenter);
  const Renderer = contributions.standardUserSurfaces?.applicationTodoCenter[variant];
  const content = Renderer
    ? <Renderer {...props} />
    : <DefaultApplicationTodoCenter {...props} messageCenter={messageCenter} />;
  return content;
}
