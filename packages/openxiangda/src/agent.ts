/** Application-scoped assistant client/hooks. No engine or provider administration API. */
export { createApplicationAgentClient, type ApplicationAgentClient } from './browser/agent-client';
export { useAgents, useAgentConversation } from './browser/agent-hooks';
export type { AgentConversationController, AgentConversationState, AgentPendingMutation, AgentMutationKind } from './browser/agent-conversation';
export type {
  ApplicationAgent, AgentConversation, AgentConversationPage, AgentConversationSnapshot, AgentRun,
  AgentMessage, AgentTool, AgentInteraction, AgentInteractionAcceptance, AgentReconciliation, AgentUpdatedEvent,
} from './browser/agent-protocol';
