/** Browser-only bridge for an application card inside the platform's isolated iframe. */
export const AGENT_CARD_PROTOCOL = 'openxiangda.agent-card/v1';

export interface AgentCardField {
  path: string;
  label: string;
  control: 'text' | 'textarea' | 'select';
  help?: string;
}

export interface AgentCardState {
  mode: 'input' | 'result';
  title: string;
  appName: string;
  fields?: AgentCardField[];
  partialInput?: Record<string, string>;
  resultFields?: { label: string; value: string }[];
  status?: string;
}

type CardMessage = {
  protocol: typeof AGENT_CARD_PROTOCOL;
  type: 'ready' | 'state' | 'request' | 'response' | 'resize';
  instanceId?: string;
  requestId?: string;
  method?: 'options' | 'submit';
  payload?: unknown;
  error?: string;
};

function isMessage(value: unknown): value is CardMessage {
  return Boolean(value && typeof value === 'object' &&
    (value as CardMessage).protocol === AGENT_CARD_PROTOCOL);
}

export function connectAgentCard(onState: (state: AgentCardState) => void) {
  if (window.parent === window) throw new Error('AGENT_CARD_HOST_REQUIRED');
  let instanceId = '';
  let mode: AgentCardState['mode'] | '' = '';
  let sequence = 0;
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number }>();
  const send = (message: CardMessage) => window.parent.postMessage(message, '*');
  const resize = () => {
    if (!instanceId) return;
    send({ protocol: AGENT_CARD_PROTOCOL, type: 'resize', instanceId,
      payload: { height: Math.ceil(document.documentElement.scrollHeight) } });
  };
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || !isMessage(event.data)) return;
    const message = event.data;
    if (message.type === 'state') {
      if (!message.instanceId || (instanceId && message.instanceId !== instanceId)) return;
      const state = message.payload as AgentCardState;
      if (!state || !['input', 'result'].includes(state.mode)) return;
      instanceId = message.instanceId;
      mode = state.mode;
      onState(state);
      requestAnimationFrame(resize);
      return;
    }
    if (message.type !== 'response' || message.instanceId !== instanceId || !message.requestId) return;
    const task = pending.get(message.requestId);
    if (!task) return;
    pending.delete(message.requestId);
    window.clearTimeout(task.timer);
    if (message.error) task.reject(new Error(message.error));
    else task.resolve(message.payload);
  };
  window.addEventListener('message', onMessage);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(document.documentElement);
  send({ protocol: AGENT_CARD_PROTOCOL, type: 'ready' });
  const request = (method: 'options' | 'submit', payload: unknown) => {
    if (!instanceId) return Promise.reject(new Error('AGENT_CARD_NOT_READY'));
    if (method === 'submit' && mode !== 'input') return Promise.reject(new Error('AGENT_CARD_READ_ONLY'));
    if (pending.size >= 4) return Promise.reject(new Error('AGENT_CARD_BUSY'));
    const requestId = `${Date.now().toString(36)}-${++sequence}`;
    return new Promise<unknown>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('AGENT_CARD_TIMEOUT'));
      }, 15000);
      pending.set(requestId, { resolve, reject, timer });
      send({ protocol: AGENT_CARD_PROTOCOL, type: 'request', instanceId, requestId, method, payload });
    });
  };
  return {
    options: (field: string, keyword = '') => request('options', { field, keyword }) as Promise<{ items: { value: string; label: string }[] }>,
    submit: (input: Record<string, string>) => request('submit', { input }) as Promise<{ accepted: boolean }>,
    resize,
    disconnect: () => {
      window.removeEventListener('message', onMessage);
      observer?.disconnect();
      for (const task of pending.values()) {
        window.clearTimeout(task.timer);
        task.reject(new Error('AGENT_CARD_DISCONNECTED'));
      }
      pending.clear();
    },
  };
}
