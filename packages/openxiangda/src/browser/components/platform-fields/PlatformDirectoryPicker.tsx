import {
  ApartmentOutlined,
  CloseOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Avatar,
  Button,
  Checkbox,
  Empty,
  Grid,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Tree,
  Typography,
  type TreeDataNode,
} from 'antd';
import type {
  DirectoryEntry,
} from 'openxiangda-contracts/browser';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Key,
} from 'react';
import {
  browseDepartmentTree,
  browseDepartmentUsers,
  searchDirectory,
  type DirectoryKind,
} from '../../platform-client';
import {
  directoryEntryFromStored,
  directoryStoredValueFromEntries,
  directoryStoredValues,
  type DirectoryStoredValue,
} from './directory-value';

import { MobileDirectoryPicker, type DirectoryPickerProps } from './MobileDirectoryPicker';

type DepartmentNode = DirectoryEntry & { children?: DepartmentNode[] };

function replaceChildren(
  nodes: DepartmentNode[],
  parentId: string,
  children: DepartmentNode[]
): DepartmentNode[] {
  return nodes.map(node =>
    node.id === parentId
      ? { ...node, children }
      : node.children
        ? { ...node, children: replaceChildren(node.children, parentId, children) }
        : node
  );
}

function departmentTreeData(nodes: DepartmentNode[]): TreeDataNode[] {
  return nodes.map(node => ({
    key: node.id,
    title: node.label,
    isLeaf: !node.hasChildren,
    children: node.children ? departmentTreeData(node.children) : undefined,
  }));
}

function displayDescription(entry: DirectoryEntry) {
  if (entry.description) return entry.description;
  if (entry.path?.length) return entry.path.map(item => item.label).join(' / ');
  return '';
}

export function PlatformDirectoryPicker(props: DirectoryPickerProps) {
  const screens = Grid.useBreakpoint();
  return (props.mobile ?? !screens.md)
    ? <MobileDirectoryPicker {...props} /> : <DesktopDirectoryPicker {...props} />;
}

function DesktopDirectoryPicker({
  kind,
  value,
  onChange,
  multiple = false,
  disabled = false,
  placeholder,
  id,
}: DirectoryPickerProps) {
  const values = useMemo(() => directoryStoredValues(value), [value]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<DirectoryEntry[]>(() =>
    values.map(item => directoryEntryFromStored(kind, item))
  );

  useEffect(() => {
    setSelected(values.map(item => directoryEntryFromStored(kind, item)));
  }, [kind, values]);

  const remove = (entryId: string) => {
    const next = selected.filter(entry => entry.id !== entryId);
    setSelected(next);
    onChange?.(directoryStoredValueFromEntries(next, multiple));
  };
  const confirm = (items: DirectoryEntry[]) => {
    setSelected(items);
    onChange?.(directoryStoredValueFromEntries(items, multiple));
    setOpen(false);
  };
  const panel = (
    <DirectoryPickerPanel
      kind={kind}
      multiple={multiple}
      onCancel={() => setOpen(false)}
      onConfirm={confirm}
      value={selected}
    />
  );

  return (
    <>
      <div
        aria-label={placeholder}
        aria-disabled={disabled}
        className={`oxa-directory-trigger${disabled ? ' is-disabled' : ''}`}
        id={id}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        onKeyDown={event => {
          if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
      >
        <span className="oxa-directory-trigger-icon">
          {kind === 'user' ? <UserOutlined /> : <ApartmentOutlined />}
        </span>
        <span className="oxa-directory-trigger-values">
          {selected.length ? (
            selected.map(entry => (
              <Tag
                closable={!disabled}
                key={entry.id}
                onClose={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  remove(entry.id);
                }}
              >
                {entry.label}
              </Tag>
            ))
          ) : (
            <span className="oxa-directory-placeholder">{placeholder}</span>
          )}
        </span>
        <Button
          disabled={disabled}
          onClick={event => {
            event.stopPropagation();
            setOpen(true);
          }}
          size="small"
          type="link"
        >
          选择
        </Button>
      </div>
      <Modal
        destroyOnHidden
        footer={null}
        onCancel={() => setOpen(false)}
        open={open}
        title={kind === 'user' ? '选择成员' : '选择部门'}
        width={kind === 'user' ? 980 : 760}
      >
        {panel}
      </Modal>
    </>
  );
}

function DirectoryPickerPanel({
  kind,
  value,
  multiple,
  onConfirm,
  onCancel,
}: {
  kind: DirectoryKind;
  value: DirectoryEntry[];
  multiple: boolean;
  onConfirm: (items: DirectoryEntry[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(value);
  useEffect(() => setSelected(value), [value]);
  return kind === 'user' ? (
    <MemberPanel
      multiple={multiple}
      onCancel={onCancel}
      onConfirm={onConfirm}
      selected={selected}
      setSelected={setSelected}
    />
  ) : (
    <DepartmentPanel
      multiple={multiple}
      onCancel={onCancel}
      onConfirm={onConfirm}
      selected={selected}
      setSelected={setSelected}
    />
  );
}

function useDepartmentTree() {
  const [nodes, setNodes] = useState<DepartmentNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const entries = useRef(new Map<string, DirectoryEntry>());
  const remember = useCallback((items: DirectoryEntry[]) => {
    for (const item of items) entries.current.set(item.id, item);
  }, []);
  const loadRoots = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await browseDepartmentTree({});
      remember(page.items);
      setNodes(page.items as DepartmentNode[]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [remember]);
  const loadChildren = useCallback(
    async (parentId: string) => {
      const page = await browseDepartmentTree({ parentId });
      remember(page.items);
      setNodes(current =>
        replaceChildren(current, parentId, page.items as DepartmentNode[])
      );
    },
    [remember]
  );
  return { nodes, loading, error, entries, remember, loadRoots, loadChildren };
}

function MemberPanel({
  selected,
  setSelected,
  multiple,
  onConfirm,
  onCancel,
}: {
  selected: DirectoryEntry[];
  setSelected: (items: DirectoryEntry[]) => void;
  multiple: boolean;
  onConfirm: (items: DirectoryEntry[]) => void;
  onCancel: () => void;
}) {
  const tree = useDepartmentTree();
  const [departmentId, setDepartmentId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [members, setMembers] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [searchCursors, setSearchCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const selectedIds = new Set(selected.map(item => item.id));

  useEffect(() => {
    void tree.loadRoots();
  }, [tree.loadRoots]);
  useEffect(() => {
    if (!departmentId && tree.nodes[0]) setDepartmentId(tree.nodes[0].id);
  }, [departmentId, tree.nodes]);
  useEffect(() => {
    setPage(1);
    setSearchCursors([undefined]);
  }, [departmentId, keyword]);
  useEffect(() => {
    const query = keyword.trim();
    if (query && query.length < 2) {
      setMembers([]);
      setNextCursor(null);
      return;
    }
    if (!query && !departmentId) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const request = query
        ? searchDirectory('user', {
            keyword: query,
            cursor: searchCursors[page - 1],
          })
        : browseDepartmentUsers(departmentId, page);
      void request
        .then(result => {
          if (!active) return;
          setMembers(result.items);
          setNextCursor(result.nextCursor);
        })
        .catch(reason => {
          if (active)
            setError(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, query ? 300 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [departmentId, keyword, page, searchCursors]);

  const toggle = (entry: DirectoryEntry, checked: boolean) => {
    if (multiple) {
      setSelected(
        checked
          ? selectedIds.has(entry.id)
            ? selected
            : [...selected, entry]
          : selected.filter(item => item.id !== entry.id)
      );
    } else {
      setSelected(checked ? [entry] : []);
    }
  };
  const next = () => {
    if (!nextCursor) return;
    if (keyword.trim()) {
      setSearchCursors(current => {
        const copy = [...current];
        copy[page] = nextCursor;
        return copy;
      });
    }
    setPage(value => value + 1);
  };

  return (
    <div className="oxa-directory-panel oxa-member-panel">
      <div className="oxa-directory-main">
        <section className="oxa-directory-tree-pane">
          <div className="oxa-directory-pane-title">组织架构</div>
          <Spin spinning={tree.loading}>
            {tree.error ? (
              <Typography.Text type="danger">{tree.error}</Typography.Text>
            ) : (
              <Tree
                height={430}
                loadData={node => tree.loadChildren(String(node.key))}
                onSelect={keys => setDepartmentId(String(keys[0] || ''))}
                selectedKeys={departmentId ? [departmentId] : []}
                treeData={departmentTreeData(tree.nodes)}
              />
            )}
          </Spin>
        </section>
        <section className="oxa-directory-member-pane">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索成员姓名或工号"
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
          />
          <Spin spinning={loading}>
            <div className="oxa-directory-members">
              {members.length ? (
                members.map(entry => (
                  <label className="oxa-directory-member-row" key={entry.id}>
                    <Checkbox
                      checked={selectedIds.has(entry.id)}
                      disabled={!entry.selectable}
                      onChange={event => toggle(entry, event.target.checked)}
                    />
                    <Avatar size={36}>{entry.label.slice(0, 1)}</Avatar>
                    <span>
                      <strong>{entry.label}</strong>
                      {displayDescription(entry) && (
                        <small>{displayDescription(entry)}</small>
                      )}
                    </span>
                  </label>
                ))
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    error ||
                    (keyword.trim().length === 1
                      ? '请输入至少 2 个字符'
                      : '暂无成员')
                  }
                />
              )}
            </div>
          </Spin>
          <div className="oxa-directory-pagination">
            <span>第 {page} 页</span>
            <Space>
              <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
                上一页
              </Button>
              <Button disabled={!nextCursor} onClick={next}>
                下一页
              </Button>
            </Space>
          </div>
        </section>
        <SelectedPane items={selected} onChange={setSelected} unit="人" />
      </div>
      <PickerFooter onCancel={onCancel} onConfirm={() => onConfirm(selected)} />
    </div>
  );
}

function DepartmentPanel({
  selected,
  setSelected,
  multiple,
  onConfirm,
  onCancel,
}: {
  selected: DirectoryEntry[];
  setSelected: (items: DirectoryEntry[]) => void;
  multiple: boolean;
  onConfirm: (items: DirectoryEntry[]) => void;
  onCancel: () => void;
}) {
  const tree = useDepartmentTree();
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DirectoryEntry[]>([]);
  const [searchError, setSearchError] = useState('');
  const selectedIds = selected.map(item => item.id);
  useEffect(() => {
    void tree.loadRoots();
  }, [tree.loadRoots]);
  useEffect(() => {
    const query = keyword.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError('');
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchDirectory('department', { keyword: query })
        .then(page => {
          if (active) {
            tree.remember(page.items);
            setSearchResults(page.items);
          }
        })
        .catch(reason => {
          if (active)
            setSearchError(
              reason instanceof Error ? reason.message : String(reason)
            );
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [keyword, tree.remember]);

  const select = (entry: DirectoryEntry, checked = true) => {
    if (multiple) {
      setSelected(
        checked
          ? selectedIds.includes(entry.id)
            ? selected
            : [...selected, entry]
          : selected.filter(item => item.id !== entry.id)
      );
    } else setSelected(checked ? [entry] : []);
  };
  const selectKeys = (ids: Key[]) => {
    const items = ids
      .map(key => tree.entries.current.get(String(key)))
      .filter((item): item is DirectoryEntry => Boolean(item));
    setSelected(items);
  };

  return (
    <div className="oxa-directory-panel">
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="搜索部门"
        value={keyword}
        onChange={event => setKeyword(event.target.value)}
      />
      <div className="oxa-directory-main oxa-department-main">
        <section className="oxa-directory-tree-pane">
          <Spin spinning={tree.loading || searching}>
            {keyword.trim().length >= 2 ? (
              <div className="oxa-directory-results">
                {searchResults.length ? (
                  searchResults.map(entry => (
                    <div
                      className="oxa-directory-department-row"
                      key={entry.id}
                      onClick={() => select(entry)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          select(entry);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <ApartmentOutlined />
                      <span>
                        <strong>{entry.label}</strong>
                        {displayDescription(entry) && (
                          <small>{displayDescription(entry)}</small>
                        )}
                      </span>
                      <Checkbox
                        checked={selectedIds.includes(entry.id)}
                        onClick={event => event.stopPropagation()}
                        onChange={event => select(entry, event.target.checked)}
                      />
                    </div>
                  ))
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={searchError || '暂无部门'}
                  />
                )}
              </div>
            ) : tree.error ? (
              <Typography.Text type="danger">{tree.error}</Typography.Text>
            ) : (
              <Tree
                checkable={multiple}
                checkedKeys={multiple ? selectedIds : undefined}
                height={460}
                loadData={node => tree.loadChildren(String(node.key))}
                onCheck={keys =>
                  selectKeys(Array.isArray(keys) ? keys : keys.checked)
                }
                onSelect={keys => {
                  if (!multiple) selectKeys(keys);
                }}
                selectedKeys={multiple ? undefined : selectedIds}
                treeData={departmentTreeData(tree.nodes)}
              />
            )}
          </Spin>
        </section>
        <SelectedPane items={selected} onChange={setSelected} unit="个" />
      </div>
      <PickerFooter onCancel={onCancel} onConfirm={() => onConfirm(selected)} />
    </div>
  );
}

function SelectedPane({
  items,
  onChange,
  unit,
}: {
  items: DirectoryEntry[];
  onChange: (items: DirectoryEntry[]) => void;
  unit: string;
}) {
  return (
    <aside className="oxa-directory-selected-pane">
      <div className="oxa-directory-pane-title">
        <span>
          已选 {items.length} {unit}
        </span>
        <Button disabled={!items.length} onClick={() => onChange([])} type="link">
          清空
        </Button>
      </div>
      {items.length ? (
        <div className="oxa-directory-selected-list">
          {items.map(item => (
            <div className="oxa-directory-selected-item" key={item.id}>
              {item.kind === 'user' ? (
                <Avatar size={30}>{item.label.slice(0, 1)}</Avatar>
              ) : (
                <ApartmentOutlined />
              )}
              <span>
                <strong>{item.label}</strong>
                {displayDescription(item) && (
                  <small>{displayDescription(item)}</small>
                )}
              </span>
              <Button
                aria-label={`移除${item.label}`}
                icon={<CloseOutlined />}
                onClick={() =>
                  onChange(items.filter(entry => entry.id !== item.id))
                }
                size="small"
                type="text"
              />
            </div>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无选择" />
      )}
    </aside>
  );
}

function PickerFooter({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="oxa-directory-footer">
      <Space>
        <Button onClick={onCancel}>取消</Button>
        <Button onClick={onConfirm} type="primary">
          确定
        </Button>
      </Space>
    </div>
  );
}
