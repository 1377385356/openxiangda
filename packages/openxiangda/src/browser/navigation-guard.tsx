import { Modal } from 'antd';
import {
  createContext, useCallback, useContext, useLayoutEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { createBrowserRouter, RouterProvider, useBlocker } from 'react-router-dom';

export interface UnsavedChangesGuardOptions {
  when: boolean;
  message?: string;
}

type RegisterGuard = (key: symbol, options: UnsavedChangesGuardOptions) => () => void;
const GuardContext = createContext<RegisterGuard | null>(null);
const RouterContents = createContext<ReactNode>(null);
type BlockedNavigation = Extract<ReturnType<typeof useBlocker>, { state: 'blocked' }>;

/** Register local dirty state with the application's single navigation owner. */
export function useUnsavedChangesGuard({ when, message }: UnsavedChangesGuardOptions) {
  const register = useContext(GuardContext);
  const key = useRef(Symbol('unsaved-changes'));
  if (!register) throw new Error('OPENXIANGDA_NAVIGATION_GUARD_PROVIDER_REQUIRED');
  useLayoutEffect(() => register(key.current, { when, message }), [register, when, message]);
}

function NavigationGuardOwner({ children }: { children: ReactNode }) {
  const guards = useRef(new Map<symbol, UnsavedChangesGuardOptions>());
  const [revision, refresh] = useState(0);
  const register = useCallback<RegisterGuard>((key, options) => {
    if (options.when) guards.current.set(key, options);
    else guards.current.delete(key);
    refresh(value => value + 1);
    return () => {
      if (guards.current.delete(key)) refresh(value => value + 1);
    };
  }, []);
  const shouldBlock = useCallback(() => guards.current.size > 0, []);
  const blocker = useBlocker(shouldBlock);
  // React Router may publish reset/proceed after our local state update. Do not
  // recapture the old blocked snapshot and reopen a just-dismissed dialog.
  const settling = useRef(false);
  const [pending, setPending] = useState<{ navigation: BlockedNavigation; message: string }>();
  useLayoutEffect(() => {
    if (blocker.state !== 'blocked') settling.current = false;
    if (guards.current.size === 0) {
      if (blocker.state === 'blocked' && !settling.current) {
        settling.current = true;
        blocker.reset();
      }
      if (pending) setPending(undefined);
    } else if (!pending && !settling.current && blocker.state === 'blocked') {
      setPending({ navigation: blocker, message: [...guards.current.values()]
        .find(item => item.message?.trim())?.message || '当前内容尚未保存，离开后将丢失。' });
    }
  }, [blocker, pending, revision]);
  useLayoutEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!guards.current.size) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  const stay = () => {
    if (!pending || settling.current) return;
    settling.current = true;
    const navigation = pending?.navigation;
    setPending(undefined);
    navigation?.reset();
  };
  const leave = () => {
    if (!pending || settling.current) return;
    settling.current = true;
    const navigation = pending?.navigation;
    setPending(undefined);
    navigation?.proceed();
  };
  return <GuardContext.Provider value={register}>
    {children}
    <Modal open={Boolean(pending)} title="离开当前页面？" centered
      okText="离开" cancelText="继续编辑" onOk={leave} onCancel={stay}
      mask={{ closable: false }} focusable={{ trap: true, focusTriggerAfterClose: true }}
      destroyOnHidden>
      <p>{pending?.message}</p>
    </Modal>
  </GuardContext.Provider>;
}

function ApplicationRouterContents() {
  const children = useContext(RouterContents);
  return <NavigationGuardOwner>{children}</NavigationGuardOwner>;
}

/** Exactly one browser router, disposed across real unmount and StrictMode replay. */
export function ApplicationRouter({ basename, children }: { basename?: string; children: ReactNode }) {
  const [router, setRouter] = useState<ReturnType<typeof createBrowserRouter>>();
  useLayoutEffect(() => {
    const instance = createBrowserRouter([{ path: '*', element: <ApplicationRouterContents /> }], { basename });
    setRouter(instance);
    return () => instance.dispose();
  }, [basename]);
  return <RouterContents.Provider value={children}>
    {router && <RouterProvider router={router} />}
  </RouterContents.Provider>;
}
