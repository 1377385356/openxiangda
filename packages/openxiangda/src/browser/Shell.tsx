import {
  AppstoreOutlined,
  BellOutlined,
  CheckSquareOutlined,
  CameraOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  DownOutlined,
  LeftOutlined,
  LogoutOutlined,
  MenuUnfoldOutlined,
  FileTextOutlined,
  FolderOutlined,
  PartitionOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  App,
  Avatar,
  Breadcrumb,
  Button,
  Dropdown,
  Empty,
  Layout,
  Menu,
  Select,
  Tag,
  Typography,
  Upload,
  type MenuProps,
} from 'antd';
import type { ReactNode } from 'react';
import type { AppAdminNavigationIcon } from 'openxiangda-contracts/browser';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { matchRoutes, useLocation, useNavigate } from 'react-router-dom';
import {
  firstAllowedAdminPath,
  isAdminPageAllowed,
  useAdminInformationArchitecture,
} from './admin-information-architecture';
import {
  isAdminRouteAllowed,
  useAdminContributions,
} from './admin-contributions';
import { logoutCurrentUser, uploadCurrentUserAvatar } from './platform-client';
import { useRuntime } from './runtime';
import { applicationName } from './runtime-meta';

const { Content, Header, Sider } = Layout;
const MENU_SCROLL_STORAGE_KEY = 'openxiangda.admin.menu-scroll-top';

function maskedAccount(value: string) {
  const account = value.trim();
  if (account.length <= 8) return account;
  return `${account.slice(0, 4)}••••${account.slice(-5)}`;
}

function navigationIcon(icon: AppAdminNavigationIcon | undefined) {
  if (icon === 'database') return <DatabaseOutlined />;
  if (icon === 'workflow') return <PartitionOutlined />;
  if (icon === 'members') return <TeamOutlined />;
  if (icon === 'calendar') return <CalendarOutlined />;
  if (icon === 'document') return <FileTextOutlined />;
  if (icon === 'folder') return <FolderOutlined />;
  if (icon === 'settings') return <SettingOutlined />;
  return <AppstoreOutlined />;
}

function readMenuScrollTop() {
  try {
    const value = Number(window.sessionStorage.getItem(MENU_SCROLL_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function storeMenuScrollTop(value: number) {
  const normalized = Math.max(0, Math.floor(value));
  try {
    window.sessionStorage.setItem(
      MENU_SCROLL_STORAGE_KEY,
      String(normalized),
    );
  } catch {
    // Menu continuity is a same-tab convenience only.
  }
  return normalized;
}

export function Shell({ children }: { children: ReactNode }) {
  const architecture = useAdminInformationArchitecture();
  const contributions = useAdminContributions();
  const {
    identity,
    hasCapability,
    hasReadCapability,
    perspective,
    perspectives,
    setPerspective,
  } = useRuntime();
  const { message } = App.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profile, setProfile] = useState(identity.subjectProfile);
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const menuScrollTop = useRef(readMenuScrollTop());
  const menuScrollRestoring = useRef(true);
  const currentPage = matchRoutes(
    architecture.pages.map(page => ({ path: page.path, handle: page })),
    location.pathname,
  )?.at(-1)?.route.handle;
  const currentNavigationItem = architecture.navigation
    .flatMap(group => group.items)
    .find(item => item.pageCode === currentPage?.code);
  const centers = (architecture.centers || []).filter(entry => {
    const route = entry.desktop;
    return (!route.capability || hasCapability(route.capability)) && (route.access?.allOf || []).every(hasCapability) && (!(route.access?.anyOf || []).length || route.access!.anyOf!.some(hasCapability));
  }).sort((left, right) => Number(left.kind !== 'workflow-work-center') - Number(right.kind !== 'workflow-work-center'));
  const centerLabel = (kind: string) => kind === 'workflow-work-center' ? '待办中心' : '消息中心';
  const currentCenter = centers.find(entry => entry.desktop.path === location.pathname);
  const currentLabel = currentCenter ? centerLabel(currentCenter.kind) : currentNavigationItem?.label || currentPage?.label || '应用首页';
  const homePath =
    firstAllowedAdminPath(
      architecture,
      hasCapability,
      hasReadCapability,
      routeCode => {
        const route = contributions.routes.find(
          contribution => contribution.route.code === routeCode,
        );
        return Boolean(
          route &&
            isAdminRouteAllowed(route, contributions.routes, hasCapability),
        );
      },
    ) || '/';
  const accessibleGroups = useMemo(
    () =>
      architecture.navigation
        .map(group => ({
          ...group,
          items: group.items.filter(item => {
            const page = architecture.pagesByCode.get(item.pageCode);
            return (
              page && !centers.some(entry => entry.desktop.path === page.path) &&
              isAdminPageAllowed(
                page,
                hasCapability,
                hasReadCapability,
                routeCode => {
                  const route = contributions.routes.find(
                    contribution => contribution.route.code === routeCode,
                  );
                  return Boolean(
                    route &&
                      isAdminRouteAllowed(
                        route,
                        contributions.routes,
                        hasCapability,
                      ),
                  );
                },
              )
            );
          }),
        }))
        .filter(group => group.items.length > 0),
    [architecture, contributions.routes, hasCapability, hasReadCapability],
  );

  useEffect(() => setProfile(identity.subjectProfile), [identity.subjectProfile]);

  useLayoutEffect(() => {
    const node = menuScrollRef.current;
    if (!node) return;
    const restore = menuScrollTop.current;
    menuScrollRestoring.current = true;
    node.scrollTop = restore;
    const frame = window.requestAnimationFrame(() => {
      node.scrollTop = restore;
      window.requestAnimationFrame(() => {
        menuScrollRestoring.current = false;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, collapsed]);

  const menuItems = useMemo<MenuProps['items']>(
    () =>
      [...centers.map(entry => ({ key: entry.desktop.path, label: centerLabel(entry.kind), icon: entry.kind === 'workflow-work-center' ? <CheckSquareOutlined /> : <BellOutlined /> })), ...accessibleGroups.map(group => ({
        key: group.code,
        icon: navigationIcon(group.icon),
        label: group.label,
        children: group.items.map(item => {
          const page = architecture.pagesByCode.get(item.pageCode)!;
          return {
            key: page.path,
            icon: item.icon ? navigationIcon(item.icon) : undefined,
            label: item.label || page.label,
          };
        }),
      }))],
    [accessibleGroups, architecture.pagesByCode, centers],
  );
  const selectedPageCode = currentNavigationItem
    ? currentPage?.code
    : currentPage?.resourceCode
      ? `resource:${currentPage.resourceCode}:list`
      : undefined;
  const selectedMenuPath = currentCenter?.desktop.path || (selectedPageCode
    ? architecture.pagesByCode.get(selectedPageCode)?.path
    : undefined);

  const [openGroups, setOpenGroups] = useState<string[]>(() =>
    accessibleGroups.map(group => group.code),
  );
  const selectedGroup = accessibleGroups.find(group =>
    group.items.some(item => item.pageCode === selectedPageCode),
  )?.code;
  useEffect(() => {
    if (selectedGroup)
      setOpenGroups(current => current.includes(selectedGroup) ? current : [...current, selectedGroup]);
  }, [selectedGroup, location.pathname]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const receipt = await logoutCurrentUser();
      navigate(receipt.redirectTo, { replace: true });
    } catch (error) {
      message.error(error instanceof Error ? error.message : '退出登录失败');
      setLoggingOut(false);
    }
  };

  const handleAvatar = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const next = await uploadCurrentUserAvatar(file);
      setProfile(next);
      message.success('头像已更新');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '头像更新失败');
    } finally {
      setUploadingAvatar(false);
    }
    return false;
  };

  const roleNames = identity.roles.map(role => role.name).filter(Boolean);
  const navigateFromMenu = (path: string) => {
    menuScrollTop.current = storeMenuScrollTop(
      menuScrollRef.current?.scrollTop || 0,
    );
    navigate(path);
  };

  const userMenu: MenuProps = {
    items: [
      {
        danger: true,
        icon: <LogoutOutlined />,
        key: 'logout',
        label: loggingOut ? '正在退出…' : '退出登录',
      },
    ],
    onClick: ({ key }) => {
      if (key === 'logout' && !loggingOut) void handleLogout();
    },
  };

  return (
    <Layout className="oxa-app-layout">
      <Sider
        className="oxa-sider"
        collapsed={collapsed}
        collapsedWidth={64}
        collapsible
        onBreakpoint={setCollapsed}
        theme="light"
        trigger={null}
        width={228}
      >
        <div className="oxa-brand">
          <div aria-hidden className="oxa-brand-mark">
            <span />
          </div>
          {!collapsed && (
            <div className="oxa-brand-copy">
              <strong>{applicationName()}</strong>
            </div>
          )}
        </div>
        <div
          className="oxa-menu-scroll"
          onScroll={(event) => {
            if (
              menuScrollRestoring.current &&
              event.currentTarget.scrollTop !== menuScrollTop.current
            ) {
              return;
            }
            menuScrollTop.current = storeMenuScrollTop(
              event.currentTarget.scrollTop,
            );
          }}
          ref={menuScrollRef}
        >
          <Menu
            className="oxa-menu"
            openKeys={openGroups}
            onOpenChange={setOpenGroups}
            inlineIndent={20}
            inlineCollapsed={collapsed}
            items={menuItems}
            mode="inline"
            onClick={({ key }) => {
              if (typeof key === 'string' && key.startsWith('/'))
                navigateFromMenu(key);
            }}
            selectedKeys={selectedMenuPath ? [selectedMenuPath] : []}
          />
        </div>
        <div className="oxa-sider-footer">
          <Button
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            block
            icon={collapsed ? <MenuUnfoldOutlined /> : <LeftOutlined />}
            onClick={() => setCollapsed((value) => !value)}
            type="text"
          >
            {!collapsed && '收起侧边栏'}
          </Button>
        </div>
      </Sider>
      <Layout className="oxa-workspace">
        <Header className="oxa-topbar">
          <Breadcrumb
            items={[
              { title: '首页', onClick: () => navigate(homePath) },
              ...(currentPage
                ? [{ title: currentLabel }]
                : []),
            ]}
          />
          <Dropdown
            menu={userMenu}
            popupRender={(menus) => (
              <div className="oxa-user-dropdown">
                <div className="oxa-user-dropdown-profile">
                  <div className="oxa-user-avatar-editor">
                    <Avatar
                      className="oxa-current-user-avatar"
                      size={64}
                      src={profile.avatarUrl || undefined}
                    >
                      {profile.displayName.slice(0, 1)}
                    </Avatar>
                    <Upload
                      accept="image/jpeg,image/png,image/webp"
                      beforeUpload={handleAvatar}
                      disabled={uploadingAvatar}
                      maxCount={1}
                      showUploadList={false}
                    >
                      <Button
                        aria-label="编辑头像"
                        className="oxa-avatar-camera"
                        icon={<CameraOutlined />}
                        loading={uploadingAvatar}
                        shape="circle"
                        size="small"
                      />
                    </Upload>
                  </div>
                  <div className="oxa-user-profile-copy">
                    <strong>{profile.displayName}</strong>
                    <span>
                      {profile.affiliatedDepartment?.name || '未设置所属部门'}
                    </span>
                    <small>账号 {maskedAccount(identity.userId)}</small>
                  </div>
                  <Upload
                    accept="image/jpeg,image/png,image/webp"
                    beforeUpload={handleAvatar}
                    disabled={uploadingAvatar}
                    maxCount={1}
                    showUploadList={false}
                  >
                    <Button
                      icon={<CameraOutlined />}
                      loading={uploadingAvatar}
                      size="small"
                    >
                      编辑头像
                    </Button>
                  </Upload>
                </div>
                <div className="oxa-user-dropdown-roles">
                  <span>我的应用角色</span>
                  <div className="oxa-user-role-tags">
                    {roleNames.length ? (
                      roleNames.map(name => <Tag color="blue" key={name}>{name}</Tag>)
                    ) : (
                      <Typography.Text type="secondary">未分配应用角色</Typography.Text>
                    )}
                  </div>
                </div>
                {perspectives.length > 0 && (
                  <div className="oxa-user-dropdown-perspective">
                    <span>工作视角</span>
                    <Select
                      aria-label="切换工作视角"
                      onChange={(value) => setPerspective(value || null)}
                      options={[
                        { label: '全部视角', value: '' },
                        ...perspectives.map(item => ({
                          label: item.name,
                          value: item.code,
                        })),
                      ]}
                      size="small"
                      value={perspective?.code || ''}
                    />
                    <Typography.Text type="secondary">
                      只改变页面和读取数据的聚焦范围，不改变实际权限
                    </Typography.Text>
                  </div>
                )}
                {menus}
              </div>
            )}
            trigger={['click']}
          >
            <button className="oxa-current-user" type="button">
              <Avatar
                className="oxa-current-user-avatar"
                size={30}
                src={profile.avatarUrl || undefined}
              >
                {profile.displayName.slice(0, 1)}
              </Avatar>
              <strong>{profile.displayName}</strong>
              <DownOutlined className="oxa-current-user-chevron" />
            </button>
          </Dropdown>
        </Header>
        <Content className="oxa-content">
          <main className="oxa-main">{children}</main>
        </Content>
      </Layout>
    </Layout>
  );
}

export function EmptyApplicationPage() {
  return (
    <Shell>
      <Empty description="还没有声明数据资源；请在 openxiangda.config.ts 中添加资源和字段" />
    </Shell>
  );
}
