import type {
  ApplicationTodoCenterPageV2,
  ApplicationTodoInteractionResultV2,
  ApplicationTodoItemV2,
  ApplicationTodoViewV2,
  AppRouteManifestKind,
} from 'openxiangda-contracts/browser';
import { Button, Result } from 'antd';
import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export type StandardUserSurfaceDevice = 'desktop' | 'mobile';
export type StandardUserPageKind = AppRouteManifestKind;

export interface StandardUserPageRouteMetadata {
  entryCode: string;
  routeCode: string;
  pattern: string;
  pathname: string;
  search: string;
  hash: string;
  params: Readonly<Record<string, string>>;
}

export interface StandardUserPageFrameProps {
  pageKind: StandardUserPageKind;
  device: StandardUserSurfaceDevice;
  mobile: boolean;
  children: ReactNode;
  route: Readonly<StandardUserPageRouteMetadata>;
  canGoBack: boolean;
  back(): void;
}

export interface StandardApplicationTodoQuery {
  view: ApplicationTodoViewV2;
  keyword: string;
  unread: boolean;
  offset: number;
  limit: number;
}

export type StandardApplicationTodoQueryUpdate = Partial<
  Pick<StandardApplicationTodoQuery, 'view' | 'keyword' | 'unread' | 'offset'>
>;

export interface StandardApplicationTodoCenterProps {
  device: StandardUserSurfaceDevice;
  mobile: boolean;
  items: readonly Readonly<ApplicationTodoItemV2>[];
  counts: Readonly<ApplicationTodoCenterPageV2['counts']>;
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  query: Readonly<StandardApplicationTodoQuery>;
  hasMore: boolean;
  setQuery(update: StandardApplicationTodoQueryUpdate): void;
  refresh(): Promise<void>;
  loadMore(): Promise<void>;
  recordInteraction(
    item: Readonly<ApplicationTodoItemV2>,
    kind: 'read' | 'click',
  ): Promise<ApplicationTodoInteractionResultV2>;
  openItem(item: Readonly<ApplicationTodoItemV2>): Promise<void>;
}

export interface StandardUserSurfaceComponentPair<Props> {
  desktop: ComponentType<Props>;
  mobile: ComponentType<Props>;
}

export interface StandardUserSurfaceContributions {
  frame: StandardUserSurfaceComponentPair<StandardUserPageFrameProps>;
  applicationTodoCenter: StandardUserSurfaceComponentPair<
    StandardApplicationTodoCenterProps
  >;
}

interface StandardUserSurfaceErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface StandardUserSurfaceErrorBoundaryState {
  failed: boolean;
}

/**
 * Contains an application renderer failure without replacing the platform
 * Router, RuntimeBoundary, identity state or standard-page controller.
 */
export class StandardUserSurfaceErrorBoundary extends Component<
  StandardUserSurfaceErrorBoundaryProps,
  StandardUserSurfaceErrorBoundaryState
> {
  state: StandardUserSurfaceErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): StandardUserSurfaceErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // React reports the renderer failure to the configured application logger.
    // This boundary deliberately avoids rendering error details to end users.
  }

  componentDidUpdate(
    previous: Readonly<StandardUserSurfaceErrorBoundaryProps>,
  ): void {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Result
        extra={
          <Button
            onClick={() => this.setState({ failed: false })}
            type="primary"
          >
            重新加载页面
          </Button>
        }
        status="error"
        subTitle="应用页面渲染器暂时不可用，平台登录态和业务数据未受影响。"
        title="页面显示失败"
      />
    );
  }
}
