/** App-scoped browser projections, not the platform engine protocol. */
export interface ApplicationAgent {
  code: string;
  name: string;
  purpose: string;
  starters: string[];
  tasks: Array<{ code: string; kind: string; name: string }>;
  available: boolean;
  reason?: string;
}

export interface AgentConversation {
  id: string;
  agentCode: string;
  title: string;
  requestId?: string;
  activeRunId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRun {
  id: string;
  conversationId: string;
  state: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface AgentMessage {
  id: string;
  runId: string;
  role: 'user' | 'assistant';
  content: string;
  requestId?: string;
  createdAt: string;
}

export interface AgentReconciliation {
  state: string;
  receipt?: unknown;
  outcome?: string;
  note?: string;
  source?: string;
  authority?: string;
  createdAt?: string;
}

export interface AgentTool {
  id: string;
  runId: string;
  state: string;
  summary: string;
  presentation: Record<string, unknown> | null;
  reconciliation: AgentReconciliation | null;
  createdAt: string;
}

export interface AgentInteraction {
  id: string;
  kind: 'input' | 'confirmation';
  summary: Record<string, unknown> | null;
  conversationId: string;
  originRunId: string;
  resumeRunId?: string | null;
  appName?: string;
  /** Renderer uses the public Field Kit; the headless client never interprets values. */
  inputCard: Record<string, unknown>;
  partialInput: Record<string, unknown>;
  state: string;
  revision: number;
  /** Current persisted submission, not an execution-success receipt. */
  requestId?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface AgentInteractionAcceptance {
  interactionId?: string;
  runId?: string;
  state: string;
  revision?: number;
  accepted?: boolean;
  noChange?: boolean;
  errors?: Record<string, string>;
}

export interface AgentConversationSnapshot {
  conversation: AgentConversation;
  messages: AgentMessage[];
  runs: AgentRun[];
  tools: AgentTool[];
  interactions: AgentInteraction[];
  cursor: number;
}

export interface AgentConversationPage {
  items: AgentConversation[];
  nextCursor: string | null;
}

export type AgentUpdatedEvent =
  | { seq: number; type: 'conversation.updated'; data: Partial<AgentConversation> & { id: string } }
  | { seq: number; type: 'run.updated'; data: AgentRun }
  | { seq: number; type: 'message.updated'; data: AgentMessage }
  | { seq: number; type: 'tool.updated'; data: AgentTool }
  | { seq: number; type: 'interaction.updated'; data: AgentInteraction };

/** Internal same-session transport, not an application-selected endpoint. */
export interface ApplicationAgentTransport {
  readonly scope: string;
  json<T>(path: string, init?: RequestInit): Promise<T>;
  stream(path: string, signal: AbortSignal): Promise<Response>;
  onDispose(listener: () => void): () => void;
  dispose(): void;
}
