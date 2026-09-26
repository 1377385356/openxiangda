import React, { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { ManagedCommandController, type ManagedCommandSnapshot, type ManagedConcurrencyClient } from './managed-command';

// Resolve storage when used, not while rendering on the server. Storage denial
// remains explicit so recovery is never silently downgraded to memory only.
const browserStorage = {
  getItem: (key: string) => typeof window === 'undefined' ? null : window.sessionStorage.getItem(key),
  setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
  removeItem: (key: string) => window.sessionStorage.removeItem(key),
};

export interface UseManagedCommandOptions {
  client: ManagedConcurrencyClient;
  command: string;
  input: Record<string, unknown>;
  storageKey: string;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  autoAccept?: boolean;
}

/** Mount restores an existing intent; a new submission only starts on start(). */
export function useManagedCommand(options: UseManagedCommandOptions) {
  const input = JSON.stringify(Object.fromEntries(Object.entries(options.input).sort(([a], [b]) => a.localeCompare(b))));
  const controller = useMemo(() => new ManagedCommandController({
    ...options, input: JSON.parse(input), storage: options.storage || browserStorage,
  }), [options.client, options.command, options.storageKey, options.storage, options.autoAccept, input]);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  useEffect(() => {
    void controller.resume().catch(() => { /* Explicit start/resume returns storage recovery errors to the caller. */ });
    return () => controller.stop();
  }, [controller]);
  return { ...snapshot, start: (key?: string) => controller.start(key), resume: () => controller.resume(),
    submit: () => controller.submit(), cancel: () => controller.cancel(), clear: () => controller.clear() };
}

const messages: Record<ManagedCommandSnapshot['state'], string> = {
  idle: '准备就绪', waiting: '正在排队，请保留此页面', admitted: '已轮到您，可以继续提交',
  accepted: '已受理，正在等待处理', executing: '正在处理', retry_wait: '已受理，稍后继续处理',
  succeeded: '提交成功', rejected: '本次申请未通过', expired: '本次等待或申请已到期',
  cancelled: '已取消', recovering: '正在核对原操作结果，请勿重复提交', error: '暂时无法查询，请恢复原操作',
};

/** Accessible on desktop and mobile; visual styling belongs to the host theme. */
export function ManagedCommandStatus({ snapshot, children, errorMessages = {} }: {
  snapshot: ManagedCommandSnapshot; children?: ReactNode; errorMessages?: Record<string,string>;
}) {
  const reason = snapshot.receipt?.errorCode;
  const defaults: Record<string,string> = {QUOTA_EXHAUSTED:'当前名额已满',OPENXIANGDA_COMMAND_ELIGIBILITY_REJECTED:'当前不满足参与条件',CONCURRENCY_ACTOR_UNAVAILABLE:'当前账号无法参与'};
  return <section aria-live="polite" aria-atomic="true" data-command-state={snapshot.state}>
    <p role="status">{messages[snapshot.state]}</p>
    {snapshot.state === 'waiting' && snapshot.waiting?.position ? <p>当前排队位置：{snapshot.waiting.position}</p> : null}
    {reason ? <p>{errorMessages[reason] || defaults[reason] || '请查看操作结果，或联系管理员协助处理'}</p> : null}
    {children}
  </section>;
}

/** The heavy subtree is constructed only after admission. Use autoAccept:false. */
export function ManagedCommandGate({ snapshot, children, fallback }: {
  snapshot: ManagedCommandSnapshot;
  children: () => ReactNode;
  fallback?: ReactNode;
}) {
  return snapshot.state === 'admitted' ? <>{children()}</> : <>{fallback ?? <ManagedCommandStatus snapshot={snapshot} />}</>;
}
