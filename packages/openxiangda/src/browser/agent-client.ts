import { createApplicationAgentTransport } from './platform-client';
import { AgentConversationController } from './agent-conversation';
import type { AgentConversationPage, ApplicationAgent } from './agent-protocol';

export interface ApplicationAgentClient {
  readonly scope: string;
  agents(signal?: AbortSignal): Promise<ApplicationAgent[]>;
  conversations(agentCode: string, query?: { cursor?: string; limit?: number; search?: string }, signal?: AbortSignal): Promise<AgentConversationPage>;
  conversation(agentCode: string): AgentConversationController;
  dispose(): void;
}

/** No endpoint, credential, user, app or environment parameter. RuntimeBoundary installs the identity. */
export function createApplicationAgentClient(): ApplicationAgentClient {
  const transport = createApplicationAgentTransport();
  const controllers = new Set<AgentConversationController>();
  let disposed = false;
  const assertLive = () => { if (disposed) throw new Error('AGENT_CLIENT_DISPOSED'); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    controllers.forEach(controller => controller.dispose()); controllers.clear(); transport.dispose();
  };
  transport.onDispose(dispose);
  return {
    scope: transport.scope,
    async agents(signal) {
      assertLive();
      return (await transport.json<{ items: ApplicationAgent[] }>('/agents', { signal })).items;
    },
    async conversations(agentCode, query = {}, signal) {
      assertLive();
      if (!/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/.test(agentCode) ||
        (query.cursor !== undefined && !/^\d+$/.test(query.cursor)) ||
        (query.limit !== undefined && (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100))) throw new Error('AGENT_QUERY_INVALID');
      const params = new URLSearchParams({ agentCode });
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.limit) params.set('limit', String(query.limit));
      if (query.search) params.set('search', query.search);
      return await transport.json<AgentConversationPage>(`/conversations?${params}`, { signal });
    },
    conversation(agentCode) {
      assertLive();
      let storage: Storage | undefined;
      try { storage = typeof window === 'undefined' ? undefined : window.sessionStorage; } catch { /* memory-only */ }
      const controller = new AgentConversationController(transport, agentCode, storage);
      controllers.add(controller); return controller;
    },
    dispose,
  };
}
