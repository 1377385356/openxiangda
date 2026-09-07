import {
  ApartmentOutlined,
  DatabaseOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Select, Space, Spin, Tag, Typography } from 'antd';
import type {
  DataFieldSourceLaunchBinding,
  DepartmentReferenceValue,
  DirectoryEntry,
  ResourceReferenceValue,
  UserReferenceValue,
} from 'openxiangda-contracts/browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckList, SearchBar } from './mobile';
import { MobileSelectionField, MobileSelectionPanel, MobileSelectionPageStatus } from './components/platform-fields/MobileSelection';
import { useMobilePickerPage } from './components/platform-fields/useMobilePickerPage';
import {
  resolveDirectory,
  searchDirectory,
  searchResource,
  type DirectoryKind,
} from './platform-client';
import { mobileReferenceSelectorCopy } from './selector-copy';

type Source = DirectoryKind | 'resource';
type Option = {
  value: string;
  label: string;
  selectable: boolean;
  description?: string;
  path?: string[];
  source: Source;
  reference?: StoredValue;
};

type StoredValue =
  | UserReferenceValue
  | DepartmentReferenceValue
  | ResourceReferenceValue;

function mergeOptions(current: Option[], incoming: Option[]) {
  const merged = new Map(current.map(option => [option.value, option]));
  for (const option of incoming) merged.set(option.value, option);
  return [...merged.values()];
}

function directoryOption(source: DirectoryKind, item: DirectoryEntry): Option {
  return {
    source,
    value: item.id,
    label: item.label,
    selectable: item.selectable !== false,
    ...(item.description ? { description: item.description } : {}),
    ...(item.path?.length
      ? { path: item.path.map(entry => entry.label) }
      : {}),
    reference: item.snapshot,
  };
}

function resourceOption(item: ResourceReferenceValue): Option {
  return {
    source: 'resource',
    value: item.value,
    label: item.label,
    selectable: true,
    ...(item.description ? { description: item.description } : {}),
    reference: item,
  };
}

function storedValues(value: StoredValue | StoredValue[] | undefined) {
  return (Array.isArray(value) ? value : value ? [value] : []).map(item => item.value);
}

function storedReferenceOptions(
  source: Source,
  value: StoredValue | StoredValue[] | undefined
) {
  return (Array.isArray(value) ? value : value ? [value] : []).map(item =>
    source === 'resource'
      ? resourceOption(item as ResourceReferenceValue)
      : {
          source,
          value: item.value,
          label: item.label,
          selectable: true,
          ...(source === 'user' && (item as UserReferenceValue).employeeNo
            ? { description: (item as UserReferenceValue).employeeNo }
            : {}),
          ...(source === 'department' && (item as DepartmentReferenceValue).fullPath
            ? { description: (item as DepartmentReferenceValue).fullPath }
            : {}),
          reference: item,
        }
  );
}

function selectedValue(
  source: Source,
  ids: string | string[] | undefined,
  options: Option[],
  multiple: boolean
) {
  const values = (Array.isArray(ids) ? ids : ids ? [ids] : [])
    .map(id => options.find(option => option.value === id)?.reference)
    .filter((item): item is StoredValue => Boolean(item));
  return multiple ? values : values[0];
}

function useStableSourceLaunch(input?: DataFieldSourceLaunchBinding) {
  return useMemo(() => input ? { workflowCode: input.workflowCode, operationCode: input.operationCode } : undefined,
    [input?.workflowCode, input?.operationCode]);
}

async function searchSource(
  source: Source,
  operation: 'create' | 'update',
  keyword: string,
  cursor?: string,
  resourceCode?: string,
  fieldCode?: string,
  bindings?: Record<string, unknown>,
  launch?: DataFieldSourceLaunchBinding,
) {
  try {
  if (source === 'resource') {
    if (!resourceCode || !fieldCode) throw new Error('OPENXIANGDA_RESOURCE_REFERENCE_CONFIG_INVALID');
    const page = await searchResource(resourceCode, fieldCode, {
      operation,
      launch,
      keyword,
      cursor,
      bindings,
    });
    return {
      items: page.items.map(resourceOption),
      nextCursor: page.nextCursor,
    };
  }
  const page = await searchDirectory(source, { keyword, cursor });
  return {
    items: page.items.map(item => directoryOption(source, item)),
    nextCursor: page.nextCursor,
  };
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
    const message = status === 401 ? '登录已失效，请重新登录后选择' : status === 403
      ? '你暂无权限查看这些选项，请联系管理员' : status === 409
      ? '页面配置已更新，请刷新后重新选择' : '选项暂时无法加载，请稍后重试';
    throw new Error(message, { cause: error });
  }
}

function optionIcon(option: Pick<Option, 'source' | 'label'>) {
  if (option.source === 'user') {
    return (
      <Avatar className="oxa-selector-avatar" size={28}>
        {option.label.slice(0, 1) || <UserOutlined />}
      </Avatar>
    );
  }
  return option.source === 'resource' ? (
    <DatabaseOutlined className="oxa-selector-icon" />
  ) : (
    <ApartmentOutlined className="oxa-selector-icon" />
  );
}

function optionDescription(option: Option) {
  if (option.path?.length) return option.path.join(' / ');
  return option.description || '';
}

export type AuthoritativeSelectorProps = {
  value?: StoredValue | StoredValue[];
  onChange?: (value: StoredValue | StoredValue[] | undefined) => void;
  source: Source;
  operation: 'create' | 'update';
  multiple?: boolean;
  disabled?: boolean;
  id?: string;
  placeholder: string;
  /** Host resource and field; the platform resolves the target source declaration. */
  resourceCode?: string;
  fieldCode?: string;
  bindings?: Record<string, unknown>;
  launch?: DataFieldSourceLaunchBinding;
};

export function AuthoritativeSelector({
  value,
  onChange,
  source,
  operation,
  multiple = false,
  disabled = false,
  id,
  placeholder,
  resourceCode,
  fieldCode,
  bindings,
  launch: launchInput,
}: AuthoritativeSelectorProps) {
  const launch = useStableSourceLaunch(launchInput);
  const [options, setOptions] = useState<Option[]>(() =>
    storedReferenceOptions(source, value)
  );
  const [keyword, setKeyword] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const requestSequence = useRef(0);
  const values = useMemo(() => storedValues(value), [value]);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  useEffect(() => {
    setOptions(current => mergeOptions(current, storedReferenceOptions(source, value)));
  }, [source, value]);

  useEffect(() => {
    if (disabled) return;
    if (keyword.trim().length < 2) {
      setCursor(null);
      return;
    }
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void searchSource(source, operation, keyword, undefined, resourceCode, fieldCode, bindings, launch)
        .then(page => {
          if (sequence !== requestSequence.current) return;
          setOptions(current => {
            const selected = current.filter(option =>
              valuesRef.current.includes(option.value)
            );
            return mergeOptions(selected, page.items);
          });
          setCursor(page.nextCursor);
        })
        .catch(reason => {
          if (sequence === requestSequence.current)
            setError(
              reason instanceof Error ? reason.message : String(reason)
            );
        })
        .finally(() => {
          if (sequence === requestSequence.current) setLoading(false);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [launch, bindings, disabled, fieldCode, keyword, operation, resourceCode, source]);

  useEffect(() => {
    if (disabled || !open || keyword.trim().length >= 2) return;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError('');
    void searchSource(source, operation, '', undefined, resourceCode, fieldCode, bindings, launch)
      .then(page => {
        if (sequence !== requestSequence.current) return;
        setOptions(current => {
          const selected = current.filter(option =>
            valuesRef.current.includes(option.value)
          );
          return mergeOptions(selected, page.items);
        });
        setCursor(page.nextCursor);
      })
      .catch(reason => {
        if (sequence === requestSequence.current) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false);
      });
  }, [launch, bindings, disabled, fieldCode, keyword, open, operation, resourceCode, source]);

  const loadNext = () => {
    if (!cursor || loading) return;
    const nextCursor = cursor;
    setLoading(true);
    setError('');
    void searchSource(source, operation, keyword, nextCursor, resourceCode, fieldCode, bindings, launch)
      .then(page => {
        setOptions(current => mergeOptions(current, page.items));
        setCursor(page.nextCursor);
      })
      .catch(reason =>
        setError(reason instanceof Error ? reason.message : String(reason))
      )
      .finally(() => setLoading(false));
  };

  return (
    <Select
      allowClear
      className={`oxa-authoritative-selector oxa-selector-${source}`}
      disabled={disabled}
      id={id}
      labelRender={({ label, value: selectedValue }) => {
        const selected = options.find(
          option => option.value === String(selectedValue)
        );
        return selected?.label || label || '读取中…';
      }}
      loading={loading}
      maxTagCount="responsive"
      mode={multiple ? 'multiple' : undefined}
      notFoundContent={
        loading ? (
          <Spin size="small" />
        ) : error ? (
          <Typography.Text type="danger">{error}</Typography.Text>
        ) : keyword.trim().length < 2 ? (
          '暂无可选数据，可输入至少 2 个字符搜索'
        ) : (
          '无可选数据'
        )
      }
      onChange={next => {
        onChange?.(
          selectedValue(
            source,
            (next || undefined) as string | string[] | undefined,
            options,
            multiple
          )
        );
        if (!multiple) setOpen(false);
      }}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setKeyword('');
      }}
      onPopupScroll={event => {
        const element = event.currentTarget;
        if (
          element.scrollTop + element.clientHeight >=
          element.scrollHeight - 16
        )
          loadNext();
      }}
      open={open}
      optionRender={option => {
        const item = options.find(
          current => current.value === String(option.value)
        );
        if (!item) return option.label;
        const description = optionDescription(item);
        return (
          <Space className="oxa-selector-option" size={10}>
            {optionIcon(item)}
            <span className="oxa-selector-option-copy">
              <strong>{item.label}</strong>
              {description && <small>{description}</small>}
            </span>
          </Space>
        );
      }}
      options={options.map(option => ({
        label: option.label,
        value: option.value,
        disabled: !option.selectable,
      }))}
      placeholder={placeholder}
      prefix={
        source === 'user' ? (
          <UserOutlined />
        ) : source === 'resource' ? (
          <DatabaseOutlined />
        ) : (
          <ApartmentOutlined />
        )
      }
      showSearch={{
        filterOption: false,
        onSearch: next => {
          setKeyword(next);
          setOpen(true);
        },
      }}
      status={error ? 'error' : undefined}
      tagRender={({ label, value: selectedValue, closable, onClose }) => {
        const selected = options.find(
          option => option.value === String(selectedValue)
        );
        return (
          <Tag
            className="oxa-selector-tag"
            closable={closable}
            onClose={onClose}
            onMouseDown={event => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            {selected && optionIcon(selected)}
            <span>{selected?.label || label || '读取中…'}</span>
            {selected?.description && <small>{selected.description}</small>}
          </Tag>
        );
      }}
      value={multiple ? values : values[0]}
    />
  );
}

/** Mobile fields consume the same authoritative query and stored snapshots. */
export function MobileAuthoritativeSelector(props: AuthoritativeSelectorProps) {
  const copy = mobileReferenceSelectorCopy(props.placeholder);
  return <MobileSelectionField id={props.id} title={copy.title} placeholder={copy.empty}
    disabled={props.disabled} labels={storedReferenceOptions(props.source, props.value).map(item => item.label)}>
    {close => <MobileReferenceSelection {...props} onClose={close} />}
  </MobileSelectionField>;
}

function MobileReferenceSelection({ value, onChange, source, operation, multiple = false,
  placeholder, resourceCode, fieldCode, bindings, launch: launchInput, onClose }: AuthoritativeSelectorProps & { onClose: () => void }) {
  const launch = useStableSourceLaunch(launchInput);
  const copy = mobileReferenceSelectorCopy(placeholder);
  const [selected, setSelected] = useState(() => storedReferenceOptions(source, value));
  const [keyword, setKeyword] = useState('');
  const query = keyword.trim();
  const loadPage = useCallback((cursor?: string) => searchSource(source, operation, query, cursor, resourceCode, fieldCode, bindings, launch),
    [launch, bindings, fieldCode, operation, query, resourceCode, source]);
  const page = useMobilePickerPage({ loadPage, enabled: query.length !== 1, delay: query ? 300 : 0 });
  const choices = [...new Map(page.items.map(item => [item.value, item])).values()];
  const known = new Map([...selected, ...choices].map(item => [item.value, item]));
  return <MobileSelectionPanel title={copy.title} selected={selected}
    onClose={onClose} onClear={() => setSelected([])} onRemove={key => setSelected(current => current.filter(item => item.value !== key))}
    onConfirm={() => {
      onChange?.(selectedValue(source, selected.map(item => item.value), selected, multiple) as StoredValue | StoredValue[] | undefined);
      onClose();
    }}>
    <SearchBar aria-label={copy.search} placeholder={copy.search} value={keyword} onChange={setKeyword} />
    {query.length === 1 ? <p className="oxa-mobile-selection-hint">请输入至少 2 个字符搜索</p> : <>
      <CheckList multiple={multiple} value={selected.map(item => item.value)} onChange={keys => {
        setSelected(keys.flatMap(key => known.has(String(key)) ? [known.get(String(key))!] : []));
      }}>
        {choices.map(item => <CheckList.Item key={item.value} value={item.value} disabled={!item.selectable} aria-disabled={!item.selectable}
          description={optionDescription(item)}><span>{item.label}</span></CheckList.Item>)}
      </CheckList>
      <MobileSelectionPageStatus page={page} />
    </>}
  </MobileSelectionPanel>;
}

export function ResolvedValueText({
  source,
  value,
}: {
  source: Source;
  value?: StoredValue | StoredValue[];
}) {
  const values = useMemo(() => storedValues(value), [value]);
  const items = useMemo(
    () => storedReferenceOptions(source, value),
    [source, value]
  );
  if (values.length === 0) return <>-</>;
  const ordered = values.map(value => items.find(item => item.value === value));
  return (
    <span className={`oxa-resolved-values oxa-resolved-${source}`}>
      {ordered.map((item, index) =>
        item ? (
          <span className="oxa-resolved-item" key={item.value}>
            {optionIcon(item)}
            <span>
              <strong>{item.label}</strong>
              {optionDescription(item) && <small>{optionDescription(item)}</small>}
            </span>
          </span>
        ) : (
          <Typography.Text key={values[index]} type="secondary">
            目录项不可用
          </Typography.Text>
        )
      )}
    </span>
  );
}

/** Resolve operational identities such as audit actors; business fields never use this path. */
export function DirectoryIdentityText({
  source,
  id,
}: {
  source: DirectoryKind;
  id: string;
}) {
  const [value, setValue] = useState<UserReferenceValue | DepartmentReferenceValue>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    void resolveDirectory(source, [id])
      .then(page => {
        if (active) setValue(page.items[0]?.snapshot);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [id, source]);
  if (failed) return <Typography.Text type="secondary">{id}</Typography.Text>;
  if (!value) return <>读取中…</>;
  return <ResolvedValueText source={source} value={value} />;
}
