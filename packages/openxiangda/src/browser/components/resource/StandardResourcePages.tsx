import {
  ArrowLeftOutlined,
  EditOutlined,
  ExportOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Result,
  Space,
  Spin,
  Typography,
} from 'antd';
import type { DataResourceSurface } from 'openxiangda-contracts/browser';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecordDetailFrame } from './RecordDetailFrame';
import { useRuntime } from '../../runtime';

export interface StandardResourcePageProps {
  resource: string;
  surface?: DataResourceSurface;
  title: string;
  description?: string;
}

interface ResourceListPageProps extends StandardResourcePageProps {
  readCapability: string;
  createCapability?: string;
  createPath?: string;
  onExport?: () => void;
  importDisabledReason?: string;
  children: ReactNode;
}

/**
 * The standard admin list shell. Data fetching stays in the app's Refine
 * provider; this component owns the stable page chrome and CRUD actions.
 */
export function ResourceListPage({
  resource,
  surface,
  title,
  readCapability,
  children,
}: ResourceListPageProps) {
  const { hasReadCapability } = useRuntime();
  if (!hasReadCapability(readCapability)) {
    return <Result status="403" title={`当前平台用户无${title}页面权限`} />;
  }
  return (
    <Card
      className="oxa-list-card"
      data-resource={resource}
      data-surface-layout={surface?.list ? 'standard' : undefined}
    >
      <div className="oxa-list-surface">{children}</div>
    </Card>
  );
}

/** Mobile list shell: the same capability gate with a compact, app-owned list. */
export function MobileResourceListPage({
  resource,
  surface,
  title,
  description,
  readCapability,
  createCapability,
  createPath,
  onExport,
  children,
}: ResourceListPageProps) {
  const navigate = useNavigate();
  const { hasCapability, hasReadCapability } = useRuntime();
  if (!hasReadCapability(readCapability)) {
    return <div className="oxa-mobile-page"><Result status="403" title={`当前平台用户无${title}页面权限`} /></div>;
  }
  return (
    <div className="oxa-mobile-page" data-resource={resource} data-surface-layout={surface?.list ? 'standard' : undefined}>
      <header className="oxa-mobile-header">
        <div>
          <Typography.Title level={3}>{title}</Typography.Title>
          {description && <Typography.Text type="secondary">{description}</Typography.Text>}
        </div>
        <Space>
          {onExport && <Button icon={<ExportOutlined />} onClick={onExport}>导出</Button>}
          {createCapability && createPath && hasCapability(createCapability) && (
            <Button icon={<PlusOutlined />} onClick={() => navigate(createPath)} type="primary">新增</Button>
          )}
        </Space>
      </header>
      {children}
    </div>
  );
}

interface ResourceFormPageProps extends StandardResourcePageProps {
  mode: 'create' | 'edit';
  capability: string;
  loading?: boolean;
  notFound?: boolean;
  backPath: string;
  backLabel: string;
  onBack?: () => void;
  detailPath?: string;
  recordSummary?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
}

/** Standard full-page entry shares its lifecycle with drawer entry. */
export function ResourceFormPage({
  resource,
  surface,
  capability,
  loading = false,
  notFound = false,
  backPath,
  backLabel,
  onBack,
  recordSummary,
  title,
  children,
}: ResourceFormPageProps) {
  const navigate = useNavigate();
  const { hasCapability } = useRuntime();
  if (!hasCapability(capability)) {
    return <Result status="403" title="当前平台用户无此操作权限" />;
  }
  if (loading) {
    return (
      <div className="oxa-page-loading">
        <Spin />
      </div>
    );
  }
  if (notFound) {
    return <Result status="404" title="记录不存在或不在数据范围内" />;
  }
  return (
    <div className="oxa-form-page" data-resource={resource}
      data-surface-layout={surface?.form?.layout || 'flat'}>
      <header className="oxa-independent-form-header">
        <Typography.Title level={3}>{title}</Typography.Title>
        {recordSummary && <Typography.Text type="secondary">{recordSummary}</Typography.Text>}
      </header>
      {children}
    </div>
  );
}

export function MobileResourceFormPage({
  resource,
  surface,
  title,
  capability,
  loading = false,
  notFound = false,
  headerActions,
  recordSummary,
  children,
}: ResourceFormPageProps) {
  const { hasCapability } = useRuntime();
  if (!hasCapability(capability)) {
    return <div className="oxa-mobile-page"><Result status="403" title="当前平台用户无此操作权限" /></div>;
  }
  if (loading) {
    return <div className="oxa-mobile-page"><Spin /></div>;
  }
  if (notFound) {
    return <div className="oxa-mobile-page"><Result status="404" title="记录不存在或不在数据范围内" /></div>;
  }
  return (
    <div
      className="oxa-mobile-page oxa-mobile-entry"
      data-resource={resource}
      data-surface-layout={surface?.form?.layout || 'flat'}
    >
      <header className="oxa-mobile-header">
        <Typography.Title level={3}>{title}</Typography.Title>
        {headerActions}
        {recordSummary && <Typography.Text type="secondary">{recordSummary}</Typography.Text>}
      </header>
      {children}
    </div>
  );
}

interface ResourceDetailPageProps extends StandardResourcePageProps {
  actions?: ReactNode;
  readCapability: string;
  loading?: boolean;
  error?: string;
  backPath: string;
  backLabel: string;
  editCapability?: string;
  editPath?: string;
  hero: ReactNode;
  children: ReactNode;
}

/** Custom and generated consumers share the same detail frame. */
function StandardRecordDetailPage({ title, readCapability, loading, error, backPath, editCapability, editPath, hero, actions, children, variant }: ResourceDetailPageProps & { variant: 'desktop' | 'mobile' }) {
  const navigate = useNavigate();
  const { hasCapability, hasReadCapability } = useRuntime();
  const readable = hasReadCapability(readCapability);
  return <RecordDetailFrame title={`${title}详情`} variant={variant} onClose={() => navigate(backPath)}
    onEdit={readable && editCapability && editPath && hasCapability(editCapability) ? () => navigate(editPath) : undefined} footer={readable ? actions : undefined}>
    {!readable ? <Result status="403" title={`当前平台用户无${title}页面权限`} /> : loading ? <Spin /> : error ? <Result status="error" title="无法访问" subTitle={error} /> : <>{hero}{children}</>}
  </RecordDetailFrame>;
}
export function ResourceDetailPage(props: ResourceDetailPageProps) { return <StandardRecordDetailPage {...props} variant="desktop" />; }
export function MobileResourceDetailPage(props: ResourceDetailPageProps) { return <StandardRecordDetailPage {...props} variant="mobile" />; }
