import type { DeploymentEnvironment, IsoDateTime } from "./types.js";

export const OPENXIANGDA_NOTIFICATION_MESSAGE_V2 =
  "openxiangda.notification.message/v2" as const;
export const OPENXIANGDA_NOTIFICATION_DINGTALK_ADVANCED_CARD_SEND_V2 =
  "openxiangda.notification.dingtalk-advanced-card-send/v2" as const;
export const OPENXIANGDA_NOTIFICATION_APPLICATION_SEND_V2 =
  "openxiangda.notification.application-send/v2" as const;
export const OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2 =
  "openxiangda.notification.business-send/v2" as const;
export const OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2 =
  "openxiangda.notification.event-send/v2" as const;
export const OPENXIANGDA_NOTIFICATION_DINGTALK_WORK_NOTICE_SEND_V2 =
  "openxiangda.notification.dingtalk-work-notice-send/v2" as const;
export const OPENXIANGDA_NOTIFICATION_APPLICATION_INFORMATIONAL_TEMPLATE =
  "application.informational.standard" as const;
export const OPENXIANGDA_APPLICATION_TODO_CENTER_V2 =
  "openxiangda.application-todo-center/v2" as const;

export type NotificationMessageStateV2 =
  | "action_required"
  | "informational"
  | "completed"
  | "rejected"
  | "cancelled"
  | "closed";

interface NotificationNavigationTargetBaseV2 {
  appCode?: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  label?: string;
  access: "AUTHENTICATED";
}

export type NotificationNavigationTargetV2 =
  | (NotificationNavigationTargetBaseV2 & {
      kind: "PLATFORM_ROUTE";
      routeCode: string;
      routeCodes?: never;
      fallbackUrl?: never;
    })
  | (NotificationNavigationTargetBaseV2 & {
      kind: "APP_ROUTE";
      routeCodes: { desktop: string; mobile: string };
      routeCode?: never;
      fallbackUrl?: never;
    })
  | (NotificationNavigationTargetBaseV2 & {
      kind: "EXTERNAL_URL";
      fallbackUrl: string;
      routeCode?: never;
      routeCodes?: never;
    });

export interface DingTalkAdvancedCardSendV2 {
  schemaVersion: typeof OPENXIANGDA_NOTIFICATION_DINGTALK_ADVANCED_CARD_SEND_V2;
  environmentKey: DeploymentEnvironment;
  bindingCode: string;
  idempotencyKey: string;
  title: string;
  summary?: string;
  recipients: Array<{ userId: string; roleSubjectKey?: string }>;
  cardTemplateId: string;
  cardParamMap: Record<string, string>;
  navigationTarget: NotificationNavigationTargetV2;
}

export type DingTalkWorkNoticeTargetV2 =
  | { kind: "users"; userIds: string[] }
  | { kind: "departments"; departmentIds: string[] }
  | { kind: "all" };

export type DingTalkWorkNoticeContentV2 =
  | { type: "text"; content: string }
  | { type: "markdown"; title: string; text: string };

export interface DingTalkWorkNoticeSendV2 {
  schemaVersion: typeof OPENXIANGDA_NOTIFICATION_DINGTALK_WORK_NOTICE_SEND_V2;
  environmentKey: DeploymentEnvironment;
  bindingCode?: string;
  idempotencyKey: string;
  correlationId?: string;
  target: DingTalkWorkNoticeTargetV2;
  content: DingTalkWorkNoticeContentV2;
}

export interface NotificationActionRefV2 {
  code: string;
  label: string;
  operation?: string;
  tone?: "primary" | "danger" | "neutral";
}

export interface ApplicationNotificationSendV2 {
  schemaVersion: typeof OPENXIANGDA_NOTIFICATION_APPLICATION_SEND_V2;
  environmentKey: DeploymentEnvironment;
  eventId?: string;
  correlationId: string;
  messageKey: string;
  orderingKey?: string;
  sourceSequence?: number;
  templateCode: string;
  templateVersion?: number;
  state?: NotificationMessageStateV2;
  recipients: Array<{ userId: string; roleSubjectKey?: string }>;
  variables: Record<string, unknown>;
  navigationTarget: NotificationNavigationTargetV2;
  requestedActions?: NotificationActionRefV2[];
  idempotencyKey: string;
}

export interface BusinessNotificationSendV2 {
  schemaVersion: typeof OPENXIANGDA_NOTIFICATION_BUSINESS_SEND_V2;
  environmentKey: DeploymentEnvironment;
  eventId?: string;
  correlationId: string;
  messageKey: string;
  orderingKey?: string;
  sourceSequence?: number;
  state?: Exclude<NotificationMessageStateV2, "action_required">;
  recipients: Array<{ userId: string; roleSubjectKey?: string }>;
  title: string;
  summary?: string;
  navigationTarget: NotificationNavigationTargetV2;
  idempotencyKey: string;
}

export interface EventBusinessNotificationSendV2 {
  schemaVersion: typeof OPENXIANGDA_NOTIFICATION_EVENT_SEND_V2;
  environmentKey: DeploymentEnvironment;
  correlationId: string;
  messageKey: string;
  orderingKey?: string;
  sourceSequence?: number;
  state?: Exclude<NotificationMessageStateV2, "action_required">;
  recipientPaths: string[];
  titlePath: string;
  summaryPath?: string;
  navigationTarget: NotificationNavigationTargetV2;
  idempotencyKey: string;
}

export interface NotificationMessageV2 {
  id: string;
  schemaVersion: typeof OPENXIANGDA_NOTIFICATION_MESSAGE_V2;
  appCode: string;
  environmentKey: DeploymentEnvironment;
  sourceKind: "PLATFORM_EVENT" | "APP_REQUEST";
  sourceEventId: string | null;
  sourceEventType: string | null;
  correlationId: string;
  messageKey: string;
  orderingKey: string | null;
  sourceSequence: number | null;
  templateCode: string;
  templateVersion: number;
  state: NotificationMessageStateV2;
  revision: number;
  title: string;
  summary: string | null;
  fields: Array<{ code: string; label: string; value: unknown }>;
  actions: Array<Record<string, unknown>>;
  navigationTarget: NotificationNavigationTargetV2;
  channelPolicy: Record<string, unknown>;
  occurredAt: IsoDateTime;
  terminalAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  idempotentReplay?: boolean;
}

export type ApplicationTodoViewV2 =
  | "all"
  | "pending"
  | "informational"
  | "completed";

export type NotificationRecipientInteractionStateV2 =
  | "unread"
  | "read"
  | "clicked"
  | "action_submitted";

export interface ApplicationTodoNavigationV2 {
  desktopPath: string | null;
  mobilePath: string | null;
  external: boolean;
  navigationUnavailable: boolean;
}

export interface ApplicationTodoItemV2 {
  messageId: string;
  recipientId: string;
  state: NotificationMessageStateV2;
  interactionState: NotificationRecipientInteractionStateV2;
  title: string;
  summary: string | null;
  fields: Array<{ code: string; label: string; value: unknown }>;
  actions: NotificationActionRefV2[];
  sourceKind: "PLATFORM_EVENT" | "APP_REQUEST";
  sourceLabel: string;
  occurredAt: IsoDateTime;
  updatedAt: IsoDateTime;
  navigation: ApplicationTodoNavigationV2;
}

export interface ApplicationTodoCenterPageV2 {
  schemaVersion: typeof OPENXIANGDA_APPLICATION_TODO_CENTER_V2;
  appCode: string;
  environmentKey: DeploymentEnvironment;
  view: ApplicationTodoViewV2;
  counts: {
    pending: number;
    informational: number;
    completed: number;
    unread: number;
  };
  items: ApplicationTodoItemV2[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
}

export interface ApplicationTodoInteractionResultV2 {
  accepted: true;
  duplicate: boolean;
  interactionState: NotificationRecipientInteractionStateV2;
}
