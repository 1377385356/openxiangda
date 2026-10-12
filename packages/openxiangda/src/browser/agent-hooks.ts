import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRuntime } from './runtime';
import { createApplicationAgentClient } from './agent-client';
import { INITIAL_AGENT_CONVERSATION_STATE, type AgentConversationController } from './agent-conversation';
import type { ApplicationAgent } from './agent-protocol';

function useScopeKey(agentCode?: string): string {
  const runtime = useRuntime();
  return JSON.stringify([runtime.identity.identityScope, runtime.identityEpoch, runtime.identity.environment.id,
    runtime.identity.environment.key, runtime.perspective?.code, agentCode]);
}

export function useAgents(): { agents: ApplicationAgent[]; loading: boolean; error?: Error; refresh(): void } {
  const key = useScopeKey();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; agents: ApplicationAgent[]; error?: Error }>();
  useEffect(() => {
    const client = createApplicationAgentClient();
    let current = true;
    void client.agents().then(agents => { if (current) setResult({ key, agents }); }, error => {
      if (current) setResult({ key, agents: [], error: error instanceof Error ? error : new Error('AGENT_REQUEST_FAILED') });
    });
    return () => { current = false; client.dispose(); };
  }, [key, attempt]);
  return { agents: result?.key === key ? result.agents : [], loading: result?.key !== key,
    error: result?.key === key ? result.error : undefined, refresh: () => { setResult(undefined); setAttempt(value => value + 1); } };
}

const emptySubscribe = () => () => {};
const emptySnapshot = () => INITIAL_AGENT_CONVERSATION_STATE;

export function useAgentConversation(agentCode: string) {
  const key = useScopeKey(agentCode);
  const [session, setSession] = useState<{ key: string; controller: AgentConversationController }>();
  const controller = session?.key === key ? session.controller : undefined;
  // Effects own subscriptions/resources: safe for abandoned renders and StrictMode's setup-cleanup-setup.
  useEffect(() => {
    const client = createApplicationAgentClient();
    const value = client.conversation(agentCode);
    setSession({ key, controller: value });
    void value.resume().catch(() => {}); // Error is part of the observable snapshot; no write is retried.
    return () => client.dispose();
  }, [key, agentCode]);
  const state = useSyncExternalStore(controller?.subscribe || emptySubscribe, controller?.snapshot || emptySnapshot, emptySnapshot);
  const current = useCallback(() => {
    if (!controller) throw new Error('AGENT_CONVERSATION_NOT_READY');
    return controller;
  }, [controller]);
  return useMemo(() => ({
    ...state,
    newConversation: () => current().newConversation(),
    open: (id: string) => current().open(id),
    send: (text: string) => current().send(text),
    cancel: (runId: string) => current().cancel(runId),
    submitInteraction: (id: string, revision: number, input: Record<string, unknown>) => current().submitInteraction(id, revision, input),
    confirm: (id: string, revision: number) => current().confirm(id, revision),
    cancelInteraction: (id: string) => current().cancelInteraction(id),
    reconcile: (id: string) => current().reconcile(id),
    resolveManually: (id: string, outcome: 'executed' | 'not_executed', note: string) => current().resolveManually(id, outcome, note),
    refresh: () => current().refresh(),
    recover: () => current().recover(),
  }), [state, current]);
}
