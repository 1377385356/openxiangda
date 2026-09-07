export const STUDIO_WORKSPACE_PROTOCOL_VERSION =
  "openxiangda.studio-workspace/v2" as const;
export const STUDIO_CLI_RESULT_SCHEMA_VERSION =
  "openxiangda.cli-result/v2" as const;
export const STUDIO_CLI_EVENT_SCHEMA_VERSION =
  "openxiangda.cli-event/v1" as const;
export const WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION =
  "openxiangda.workspace-template-binding/v1" as const;
export const STUDIO_WORKSPACE_BINDING_SCHEMA_VERSION =
  "openxiangda.studio-workspace-binding/v1" as const;
export const STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION =
  "openxiangda.studio-workspace-initialization/v1" as const;

export const STUDIO_CAPABILITIES_SCHEMA_VERSION =
  "openxiangda.studio-capabilities/v1" as const;
export const STUDIO_PLATFORM_CONTRACT_VERSION = "1.0.0" as const;
export const STUDIO_SITE_PROFILE_SCHEMA_VERSION =
  "openxiangda.studio-site-profile/v1" as const;
export const STUDIO_SITE_PROFILE_ENDPOINT =
  "/openxiangda-api/v2/studio/profile" as const;
export const STUDIO_SITE_PROFILE_UNAVAILABLE_CODES = [
  "STUDIO_SITE_PROFILE_NOT_CONFIGURED",
  "STUDIO_SITE_PROFILE_INVALID",
  "STUDIO_SITE_PROFILE_EXPIRED",
] as const;

export type StudioSiteProfileUnavailableCode =
  (typeof STUDIO_SITE_PROFILE_UNAVAILABLE_CODES)[number];

export type StudioSiteProfileDiscovery =
  | {
      schemaVersion: typeof STUDIO_SITE_PROFILE_SCHEMA_VERSION;
      endpoint: typeof STUDIO_SITE_PROFILE_ENDPOINT;
      status: "available";
      signatureAlgorithm: "Ed25519";
      verificationOwner: "studio-client-trust-store";
    }
  | {
      schemaVersion: typeof STUDIO_SITE_PROFILE_SCHEMA_VERSION;
      endpoint: typeof STUDIO_SITE_PROFILE_ENDPOINT;
      status: "unavailable";
      unavailableCode: StudioSiteProfileUnavailableCode;
      signatureAlgorithm: "Ed25519";
      verificationOwner: "studio-client-trust-store";
    };

export type StudioPlatformDiscoveryCapabilities =
  | {
      contractVersion: typeof STUDIO_PLATFORM_CONTRACT_VERSION;
      profile: Extract<StudioSiteProfileDiscovery, { status: "available" }>;
      compatibility: {
        studioContractRange: string;
        cliContractRange: string;
      };
    }
  | {
      contractVersion: typeof STUDIO_PLATFORM_CONTRACT_VERSION;
      profile: Extract<StudioSiteProfileDiscovery, { status: "unavailable" }>;
      compatibility: {
        studioContractRange: null;
        cliContractRange: null;
      };
    };

export interface StudioCapabilities {
  schemaVersion: typeof STUDIO_CAPABILITIES_SCHEMA_VERSION;
  studioContractVersion: typeof STUDIO_PLATFORM_CONTRACT_VERSION;
  studio: StudioPlatformDiscoveryCapabilities;
}

export const STUDIO_APPLICATION_AUTHORITY =
  "site-project-provisioning-run" as const;

export const STUDIO_CLI_EVENT_TYPES = [
  "command.started",
  "command.status",
  "command.completed",
  "command.failed",
] as const;

export type StudioCliEventType = (typeof STUDIO_CLI_EVENT_TYPES)[number];

export interface StudioCliEvent {
  schemaVersion: typeof STUDIO_CLI_EVENT_SCHEMA_VERSION;
  eventId: string;
  runId: string;
  seq: number;
  type: StudioCliEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface WorkspaceTemplateBinding {
  schemaVersion: typeof WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION;
  ref: string;
  digest: `sha256:${string}`;
}

export interface StudioWorkspaceCompilerSummary {
  toolchainVersion: string;
  contractVersion: string;
  compilerContractVersion: string;
  configurationDigest: string;
  contractDigest: string;
  aiCatalogDigest: string;
}

export interface StudioWorkspaceBinding {
  schemaVersion: typeof STUDIO_WORKSPACE_BINDING_SCHEMA_VERSION;
  applicationAuthority: typeof STUDIO_APPLICATION_AUTHORITY;
  siteBaseUrl: string;
  projectId: string;
  provisioningRunId: string;
  appType: string;
  appName: string;
  template: WorkspaceTemplateBinding;
  state: "prepared" | "compiled";
  compiler: StudioWorkspaceCompilerSummary | null;
}

export interface StudioWorkspaceInitialization {
  schemaVersion: typeof STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION;
  applicationAuthority: typeof STUDIO_APPLICATION_AUTHORITY;
  siteBaseUrl: string;
  projectId: string;
  provisioningRunId: string;
  appType: string;
  appName: string;
  workspace: {
    reused: boolean;
  };
  cliVersion: string;
  protocolVersion: typeof STUDIO_WORKSPACE_PROTOCOL_VERSION;
  template: WorkspaceTemplateBinding;
  compiler: StudioWorkspaceCompilerSummary;
  bindingDigest: `sha256:${string}`;
  workspaceDigest: `sha256:${string}`;
}

export interface StudioWorkspaceProtocolCapabilities {
  schemaVersion: typeof STUDIO_WORKSPACE_PROTOCOL_VERSION;
  cliResultSchemaVersion: typeof STUDIO_CLI_RESULT_SCHEMA_VERSION;
  cliEvents: {
    schemaVersion: typeof STUDIO_CLI_EVENT_SCHEMA_VERSION;
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
  initialization: {
    schemaVersion: typeof STUDIO_WORKSPACE_INITIALIZATION_SCHEMA_VERSION;
    bindingSchemaVersion: typeof STUDIO_WORKSPACE_BINDING_SCHEMA_VERSION;
    applicationAuthority: typeof STUDIO_APPLICATION_AUTHORITY;
    applicationKey: "appType";
    requiredCreateFlags: [
      "app-code",
      "name",
      "template-ref",
      "template-digest",
      "studio-project-id",
      "provisioning-run-id",
      "json-events",
      "run-id",
    ];
    repositoryAuthority: "site-git-broker";
  };
}
