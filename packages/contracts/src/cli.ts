export const CLI_PROTOCOL_VERSION = "openxiangda.cli/v1" as const;
export const CLI_RESULT_SCHEMA_VERSION =
  "openxiangda.cli-result/v2" as const;

export const CLI_EVENT_SCHEMA_VERSION =
  "openxiangda.cli-event/v1" as const;

export const WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION =
  "openxiangda.workspace-template-binding/v1" as const;

export const CLI_EVENT_TYPES = [
  "command.started",
  "command.status",
  "command.completed",
  "command.failed",
] as const;

export type CliEventType = (typeof CLI_EVENT_TYPES)[number];

export interface CliEvent {
  schemaVersion: typeof CLI_EVENT_SCHEMA_VERSION;
  eventId: string;
  runId: string;
  seq: number;
  type: CliEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface WorkspaceTemplateBinding {
  schemaVersion: typeof WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION;
  ref: string;
  digest: `sha256:${string}`;
}

export interface CliProtocolCapabilities {
  schemaVersion: typeof CLI_PROTOCOL_VERSION;
  cliResultSchemaVersion: typeof CLI_RESULT_SCHEMA_VERSION;
  cliEvents: {
    schemaVersion: typeof CLI_EVENT_SCHEMA_VERSION;
    commands: Array<{
      id: string;
      operation: string;
      risk: "read" | "write-local" | "deploy";
    }>;
  };
  templates: {
    schemaVersion: typeof WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION;
    digestAlgorithm: "sha256";
    supportedReferences: ["builtin:application", "file"];
  };
}
