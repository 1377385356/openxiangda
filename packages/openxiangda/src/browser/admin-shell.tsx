import { Component, createContext, useContext, type ComponentType, type ReactNode } from 'react';
import type { AppAdminNavigationIcon } from 'openxiangda-contracts/browser';
import type { RuntimeIdentity } from './platform-client';
import type { RuntimePerspective } from './runtime';

export interface AdminShellNavigationItem {
  code: string;
  label: string;
  path: string;
  icon?: AppAdminNavigationIcon;
}
export interface AdminShellNavigationGroup {
  code: string;
  label: string;
  icon?: AppAdminNavigationIcon;
  items: readonly AdminShellNavigationItem[];
}
export interface AdminShellModel {
  applicationName: string;
  homePath: string;
  title: string;
  pathname: string;
  search: string;
  selectedPath?: string;
  navigation: readonly AdminShellNavigationGroup[];
  centers: readonly AdminShellNavigationItem[];
  identity: RuntimeIdentity;
  roleNames: readonly string[];
  perspectives: readonly RuntimePerspective[];
  perspective: RuntimePerspective | null;
  setPerspective(code: string | null): void;
  navigate(path: string): void;
  logout(): Promise<void>;
  loggingOut: boolean;
}
export interface AdminShellProps extends AdminShellModel {
  children: ReactNode;
  /** Platform defaults are optional building blocks, not a second mounted shell. */
  slots: { header: ReactNode; sidebar: ReactNode; footer: ReactNode };
}
export interface AdminShellOptions {
  shell?: ComponentType<AdminShellProps>;
  header?: ComponentType<AdminShellModel>;
  sidebar?: ComponentType<AdminShellModel>;
  footer?: ComponentType<AdminShellModel>;
  /** Presentation only. Routes and authorization remain active. */
  centerNavigation?: { workflow?: boolean; messages?: boolean };
}
export const AdminShellOptionsContext = createContext<AdminShellOptions | undefined>(undefined);
export function useAdminShellOptions() { return useContext(AdminShellOptionsContext); }

export class AdminShellErrorBoundary extends Component<{ children: ReactNode; homePath: string; onHome(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" className="oxa-page-loading"><h2>页面暂时无法显示</h2><p>请重试，或返回应用首页继续操作。</p><button type="button" onClick={() => this.setState({ failed: false })}>重新加载页面</button><button type="button" onClick={this.props.onHome}>返回应用首页</button></section>;
  }
}
