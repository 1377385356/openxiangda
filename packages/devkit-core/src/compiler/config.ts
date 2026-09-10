import type { NativeEventActionDeclaration } from 'openxiangda-contracts';
import { materializeApplicationModules, type AppModuleDeclaration } from './application-model.js';
import { nativeFieldRequiresCreateInputV2 } from 'openxiangda-contracts/native-compiler';
import {
  SCHEMA_VERSIONS,
  DATA_AUDIT_METADATA_FIELDS,
  isDataAuditMetadataField,
  DATA_FIELD_TYPES,
  PLATFORM_EVENT_TYPES_V2,
  nativePlatformCapabilityCatalog,
  validateDataResource,
  validateWorkflowInstanceCommandPolicies,
  WORKFLOW_SUMMARY_MAX_FIELDS,
  WORKFLOW_SUMMARY_TEXT_LONG_MAX_BYTES,
  isWorkflowSummaryFieldType,
  type AppApiOperationDeclaration,
  type AppEventSubscriptionPlatformAccessDeclaration,
  type AppAuthorizationTransitionDeclaration,
  type AppBackendSecretDeclaration,
  type AppCapabilityDeclaration,
  type AppDataPolicyDeclaration,
  type AppDataPolicyExpressionDeclaration,
  type AppDataPolicyRuleDeclaration,
  type AppFrontendRouteDeclaration,
  type AppFrontendRouteAccess,
  type AppRouteManifestDevicePolicyV3,
  type AnonymousPublicAccessContractV2,
  type ApplicationAuthenticationDeclarationV2,
  type AppAdminNavigationDeclaration,
  type AppAdminNavigationGroupDeclaration,
  type AppAdminNavigationIcon,
  type AppAdminNavigationItemDeclaration,
  type AppAdminPageReference,
  type AppWorkflowLaunchDeclaration,
  type AppWorkflowDetailRouteCodeDeclaration,
  type AppResourceDetailRouteCodeDeclaration,
  type AppPerspectiveDeclaration,
  type AppRoleDeclaration,
  type AppRoleMembershipSourceDeclaration,
  type AppRelationshipGrantSourceDeclaration,
  type AppScopeDimensionDeclaration,
  type AppScopeSourceDeclaration,
  type NativeWorkflowEditableParameterDeclaration,
  type DataFieldDefinition,
  type DataFieldPolicy,
  type DataFieldSurfaceWidget,
  type DataResourceSurface,
  type DataResource,
  type Diagnostic,
  type ApplicationEventSchemaDeclaration,
  type DateTrigger,
  type EventSubscription,
  type TimerSubscription,
  type WorkflowBinding,
  type WorkflowDefinition,
} from 'openxiangda-contracts';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { CronExpressionParser } from 'cron-parser';
import {
  fieldNullable,
  supportsGeneratedMutation,
} from './field-codec.js';
import {
  supportsFilter,
  supportsSearch,
  supportsSort,
} from './field-query-plan.js';
import { physicalPlanForField } from './field-physical-plan.js';
import {
  SEMANTIC_FIELD_PATH_PATTERN,
  semanticFieldPathRoot,
  validateAuthzSemanticBindings,
} from './field-policy-path.js';
import {
  compatibleWidgets,
  isCompatibleFieldWidget,
  resolveDataFieldSurfaceWidget,
} from './field-surface.js';
import {
  DATA_POLICY_EXPRESSION_MAX_DEPTH,
  DATA_POLICY_EXPRESSION_MAX_GROUP_ITEMS,
  DATA_POLICY_EXPRESSION_MAX_LEAVES,
  dataPolicyExpressionToCnf,
} from './data-policy-expression.js';
import {
  AUTHORIZATION_TRANSITION_CAPABILITY_CODE_PATTERN,
  AUTHORIZATION_TRANSITION_KEYS,
  AUTHORIZATION_TRANSITION_ROLE_CODE_PATTERN,
  exactKeys,
  isExactStringArray,
  isPlainRecord,
} from './authorization-transition.js';

// The compiler owns the application source contract. Devkit and every adapter
// re-export this module instead of maintaining separate configuration models.
import {
  validateWorkflowBinding,
  validateWorkflowDefinition,
} from '../internal/workflow.js';

const DATE_TRIGGER_RESERVED_DATA_FIELDS = new Set([
  'triggerCode',
  'resourceCode',
  'recordId',
  'recordRevision',
  'field',
  'dueAt',
]);

export type EventSubscriptionDeclaration = Pick<
  EventSubscription,
  'code' | 'eventTypes'
> & {
  execution?: NativeEventActionDeclaration;
  description?: string;
  filter?: EventSubscription['filter'];
  payload?: Partial<EventSubscription['payload']>;
  platformAccess?: AppEventSubscriptionPlatformAccessDeclaration;
  delivery?: Partial<EventSubscription['delivery']>;
};

export type TimerSubscriptionDeclaration = Pick<
  TimerSubscription,
  | 'code'
  | 'eventType'
  | 'cronExpression'
  | 'timezone'
  | 'payload'
> & { misfirePolicy?: TimerSubscription['misfirePolicy'] };

export type DateTriggerDeclaration = Pick<
  DateTrigger,
  'code' | 'resourceCode' | 'field' | 'offset' | 'eventType' | 'payload'
>;

export interface WorkflowDefinitionDeclaration {
  version: number;
  definition: WorkflowDefinition;
  launch?: AppWorkflowLaunchDeclaration;
  detailRouteCode?: AppWorkflowDetailRouteCodeDeclaration;
}

export interface WorkflowBindingDeclaration {
  version: number;
  binding: WorkflowBinding;
}

export interface WorkflowActivationDeclaration {
  workflowCode: string;
  definitionVersion: number;
  bindingVersion: number;
  acceptedCommandDeactivationPolicy:
    WorkflowDefinition['acceptedCommandDeactivationPolicy'];
}

export interface WorkflowAssigneeProviderDeclaration {
  code: string;
  endpointPath: string;
  timeoutMs?: number;
  status?: 'active' | 'paused';
}

export type BackendSecretDeclaration = AppBackendSecretDeclaration;
export type AuthzRoleDeclaration = AppRoleDeclaration;
export type AuthzScopeDimensionDeclaration = AppScopeDimensionDeclaration;
export type AuthzScopeSourceDeclaration = AppScopeSourceDeclaration;
export type AuthzRoleMembershipSourceDeclaration =
  AppRoleMembershipSourceDeclaration;
export type AuthzRelationshipGrantSourceDeclaration =
  AppRelationshipGrantSourceDeclaration;
export type AuthzDataPolicyRuleDeclaration = AppDataPolicyRuleDeclaration;
export type AuthzDataPolicyDeclaration = AppDataPolicyDeclaration;

export type AppDataFieldAccessDeclaration = {
  read?: string[] | false;
  create?: string[] | false;
  update?: string[] | false;
  mask?: DataFieldPolicy['mask'];
};


const APP_DATA_FIELD_TYPES = new Set<string>(DATA_FIELD_TYPES);

/**
 * One source field owns storage, validation, presentation and field access.
 * The compiler projects it into the strict platform schema and UI Surface.
 */
export interface AppDataFieldDeclaration {
  code: string;
  type: DataFieldDefinition['type'];
  label: string;
  required?: boolean;
  indexed?: boolean;
  options?: DataFieldDefinition['options'];
  source?: DataFieldDefinition['source'];
  maxLength?: DataFieldDefinition['maxLength'];
  precision?: DataFieldDefinition['precision'];
  scale?: DataFieldDefinition['scale'];
  min?: DataFieldDefinition['min'];
  max?: DataFieldDefinition['max'];
  rangeBoundary?: NonNullable<DataFieldDefinition['rangeBoundary']>;
  timePrecision?: DataFieldDefinition['timePrecision'];
  file?: DataFieldDefinition['file'];
  serial?: DataFieldDefinition['serial'];
  subtable?: DataFieldDefinition['subtable'];
  widget?: DataFieldSurfaceWidget;
  section?: string;
  system?: boolean;
  /** Presentation only. Hidden fields keep their declared Data API permissions. */
  hidden?: boolean;
  list?: boolean;
  filter?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  access?: AppDataFieldAccessDeclaration;
}

export interface AppDataResourceDeclaration {
  views?: DataResourceSurface['views'];
  code: string;
  name: string;
  mutationOwner?: 'native' | 'action' | 'readonly' | 'workflow';
  generated?: {
    list?: boolean;
    detail?: boolean;
    create?: boolean;
    update?: boolean;
    delete?: boolean;
  };
  fields: AppDataFieldDeclaration[];
  /** Read access to provenance metadata and record history; omission preserves defaults. */
  audit?: { read: string[] | false };
  invariants?: DataResource['invariants'];
  list?: {
    fields?: string[];
    actions?: NonNullable<DataResourceSurface['list']>['actions'];
    defaultPageSize?: number;
    defaultSort?: { field: string; order?: 'asc' | 'desc' };
  };
  form?: { layout?: 'flat' | 'sections'; fields?: string[] };
  detail?: { layout?: 'flat' | 'sections'; fields?: string[] };
  mobile?: DataResourceSurface['mobile'];
  dataPolicyCode?: string | null;
  /** Explicit user-surface routes used when Workflow links to this record. */
  detailRouteCode?: AppResourceDetailRouteCodeDeclaration;
}

export interface AppConfiguredDataResource extends DataResource {
  detailRouteCode?: AppResourceDetailRouteCodeDeclaration;
}

export interface OpenXiangdaAppDeclaration {
  schemaVersion?: 3;
  app: OpenXiangdaAppConfig['app'];
  frontend: Omit<OpenXiangdaAppConfig['frontend'], 'root'> & { root?: string };
  backend?: Partial<OpenXiangdaAppConfig['backend']>;
  platform?: Partial<OpenXiangdaAppConfig['platform']>;
  modules?: readonly AppModuleDeclaration[];
  perspectives?: AppPerspectiveDeclaration[];
  data?: { resources: AppDataResourceDeclaration[] };
  authz?: NonNullable<OpenXiangdaAppConfig['authz']>;
  events?: NonNullable<OpenXiangdaAppConfig['events']>;
  workflows?: NonNullable<OpenXiangdaAppConfig['workflows']>;
}

export interface OpenXiangdaAppConfig {
  schemaVersion: 3;
  app: {
    code: string;
    name: string;
  };
  frontend: {
    root: string;
    routes?: AppFrontendRouteDeclaration[];
    devicePolicy?: AppRouteManifestDevicePolicyV3;
    user?: { applicationTodoCenter?: boolean };
    admin?: {
      access?: AppFrontendRouteAccess;
      navigation: AppAdminNavigationDeclaration;
    };
    authentication?: ApplicationAuthenticationDeclarationV2;
    publicAccess?: AnonymousPublicAccessContractV2;
  };
  backend: {
    root: string;
    runtime: 'node';
    framework: 'nestjs';
    /** Omit for pure CRUD applications; set true for an intentional backend. */
    enabled?: boolean;
    isolation?: 'shared' | 'dedicated';
    resourceProfile?: 'light' | 'standard';
    secrets?: BackendSecretDeclaration[];
    operations?: AppApiOperationDeclaration[];
  };
  platform: {
    root: string;
  };
  perspectives?: AppPerspectiveDeclaration[];
  data?: {
    resources: AppConfiguredDataResource[];
  };
  authz?: {
    /** Package role granted by the platform to every authenticated user on first access. */
    authenticatedUserRoleCode?: string;
    capabilities: AppCapabilityDeclaration[];
    roles: AuthzRoleDeclaration[];
    scopeDimensions?: AuthzScopeDimensionDeclaration[];
    scopeSources?: AuthzScopeSourceDeclaration[];
    roleMembershipSources?: AuthzRoleMembershipSourceDeclaration[];
    relationshipGrantSources?: AuthzRelationshipGrantSourceDeclaration[];
    dataPolicies?: AuthzDataPolicyDeclaration[];
    authorizationTransitions?: AppAuthorizationTransitionDeclaration[];
  };
  events?: {
    capturePolicies?: Array<{ resourceCode: string; mode: 'all' | 'subscribed' }>;
    schemas?: ApplicationEventSchemaDeclaration[];
    subscriptions: EventSubscriptionDeclaration[];
    timers?: TimerSubscriptionDeclaration[];
    dateTriggers?: DateTriggerDeclaration[];
  };
  workflows?: {
    definitions: WorkflowDefinitionDeclaration[];
    bindings: WorkflowBindingDeclaration[];
    /** Complete desired activation set; removing an item deactivates it on deploy. */
    activations: WorkflowActivationDeclaration[];
    providers?: WorkflowAssigneeProviderDeclaration[];
    editableParameters?: NativeWorkflowEditableParameterDeclaration[];
  };
}

type AdminNavigationItemOptions = Omit<
  AppAdminNavigationItemDeclaration,
  'page'
>;

type AdminNavigationGroupOptions = Pick<
  AppAdminNavigationGroupDeclaration,
  'icon' | 'order'
>;

function adminNavigationItem(
  page: AppAdminPageReference,
  options: AdminNavigationItemOptions = {}
): AppAdminNavigationItemDeclaration {
  return Object.freeze({ page: Object.freeze(page), ...options });
}

/** Explicitly owns the complete admin menu; the compiler never appends pages. */
export function defineAdminNavigation<
  const Groups extends AppAdminNavigationDeclaration,
>(groups: Groups): Groups {
  return Object.freeze(
    groups.map(group =>
      Object.freeze({
        ...group,
        items: Object.freeze(group.items.map(item => Object.freeze({ ...item }))),
      })
    )
  ) as Groups;
}

export function adminNavigationGroup(
  code: string,
  label: string,
  items: readonly AppAdminNavigationItemDeclaration[],
  options: AdminNavigationGroupOptions = {}
): AppAdminNavigationGroupDeclaration {
  return Object.freeze({ code, label, items: Object.freeze([...items]), ...options });
}

export function adminResourcePage(
  resourceCode: string,
  options: AdminNavigationItemOptions & { viewCode?: string } = {}
) {
  const { viewCode, ...display } = options;
  return adminNavigationItem({ kind: 'resource', resourceCode, ...(viewCode ? { viewCode } : {}) }, display);
}

export function adminOperationPage(
  routeCode: string,
  options?: AdminNavigationItemOptions
) {
  return adminNavigationItem({ kind: 'operation', routeCode }, options);
}

/**
 * @deprecated The Todo Center is a user Surface. Existing declarations are
 * normalized to `frontend.user.applicationTodoCenter = true` and are not
 * retained in the admin navigation contract.
 */
export function adminApplicationTodoCenterPage(
  options?: AdminNavigationItemOptions
): AppAdminNavigationItemDeclaration {
  return Object.freeze({
    page: Object.freeze({ kind: 'application-todo-center' }),
    ...options,
  }) as unknown as AppAdminNavigationItemDeclaration;
}

function isLegacyApplicationTodoCenterItem(
  item: AppAdminNavigationItemDeclaration
) {
  return (
    (item.page as unknown as { kind?: unknown }).kind ===
    'application-todo-center'
  );
}

type NormalizedAppDeclaration = Omit<OpenXiangdaAppDeclaration, 'schemaVersion' | 'frontend' | 'backend' | 'platform'> & {
  schemaVersion: 3;
  frontend: OpenXiangdaAppConfig['frontend'];
  backend: OpenXiangdaAppConfig['backend'];
  platform: OpenXiangdaAppConfig['platform'];
};

function normalizeLegacyUserSurfaceAuthoring(
  declaration: NormalizedAppDeclaration
): NormalizedAppDeclaration {
  const admin = declaration.frontend.admin;
  const navigation = admin?.navigation;
  if (
    !navigation?.some(group =>
      group.items.some(isLegacyApplicationTodoCenterItem)
    )
  ) {
    return declaration;
  }
  const normalizedNavigation = navigation
    .map(group => ({
      ...group,
      items: group.items.filter(
        item => !isLegacyApplicationTodoCenterItem(item)
      ),
    }))
    .filter(group => group.items.length > 0);
  return {
    ...declaration,
    frontend: {
      ...declaration.frontend,
      user: {
        ...declaration.frontend.user,
        applicationTodoCenter: true,
      },
      ...(admin
        ? {
            admin: {
              ...admin,
              navigation: defineAdminNavigation(normalizedNavigation),
            },
          }
        : {}),
    },
  };
}

/**
 * Produces a deterministic one-time authoring suggestion for tooling. The
 * compiler never calls this function and never mutates a saved declaration.
 */
export function suggestAdminNavigation(
  config: OpenXiangdaAppConfig
): AppAdminNavigationDeclaration {
  const groups: AppAdminNavigationGroupDeclaration[] = [];
  const resources = [...(config.data?.resources || [])]
    .sort((left, right) =>
      left.code < right.code ? -1 : left.code > right.code ? 1 : 0
    );
  const resourceItems = resources.flatMap(resource => [
    ...(resource.surface?.generated?.list !== false
      ? [adminResourcePage(resource.code, { label: resource.name })]
      : []),
    ...[...(resource.surface?.views || [])]
      .filter(view => view.generated.list !== false)
      .sort((left, right) => left.code.localeCompare(right.code, 'en'))
      .map(view => adminResourcePage(resource.code, { viewCode: view.code, label: view.name })),
  ]);
  if (resourceItems.length > 0) {
    groups.push(
      adminNavigationGroup(
        'data-management',
        '数据管理',
        resourceItems,
        { icon: 'database', order: 100 }
      )
    );
  }
  const routes = [...(config.frontend.routes || [])]
    .filter(
      route => route.surface === 'admin' && !/[:*]/.test(route.path)
    )
    .sort((left, right) =>
      left.code < right.code ? -1 : left.code > right.code ? 1 : 0
    );
  if (routes.length > 0) {
    groups.push(
      adminNavigationGroup(
        'business-operations',
        '业务操作',
        routes.map(route =>
          adminOperationPage(route.code, { label: route.label })
        ),
        { icon: 'operations', order: 200 }
      )
    );
  }
  return defineAdminNavigation(groups);
}

export interface AdminNavigationSuggestionSource {
  module: 'openxiangda/config';
  imports: readonly string[];
  proposal: AppAdminNavigationDeclaration;
  expression: string;
  groupCount: number;
  itemCount: number;
}

function renderAdminNavigationOptions(
  options: {
    label?: string | undefined;
    icon?: string | undefined;
    order?: number | undefined;
    viewCode?: string | undefined;
  }
) {
  const entries = [
    ...(options.viewCode !== undefined
      ? [`viewCode: ${JSON.stringify(options.viewCode)}`]
      : []),
    ...(options.label !== undefined
      ? [`label: ${JSON.stringify(options.label)}`]
      : []),
    ...(options.icon !== undefined
      ? [`icon: ${JSON.stringify(options.icon)}`]
      : []),
    ...(options.order !== undefined ? [`order: ${options.order}`] : []),
  ];
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : undefined;
}

/**
 * Renders the deterministic proposal as a typed expression that an AI author
 * can copy once into frontend.admin.navigation and then edit normally.
 */
export function renderAdminNavigationSuggestion(
  config: OpenXiangdaAppConfig
): AdminNavigationSuggestionSource {
  const navigation = suggestAdminNavigation(config);
  const imports = new Set<string>(['defineAdminNavigation']);
  const groups = navigation.map(group => {
    imports.add('adminNavigationGroup');
    const items = group.items.map(item => {
      const options = renderAdminNavigationOptions({ ...item,
        ...(item.page.kind === 'resource' && item.page.viewCode ? { viewCode: item.page.viewCode } : {}),
      });
      let expression: string;
      switch (item.page.kind) {
        case 'resource':
          imports.add('adminResourcePage');
          expression = `adminResourcePage(${JSON.stringify(item.page.resourceCode)}${options ? `, ${options}` : ''})`;
          break;
        case 'operation':
          imports.add('adminOperationPage');
          expression = `adminOperationPage(${JSON.stringify(item.page.routeCode)}${options ? `, ${options}` : ''})`;
          break;
      }
      return `      ${expression},`;
    });
    const options = renderAdminNavigationOptions({
      icon: group.icon,
      order: group.order,
    });
    return [
      '  adminNavigationGroup(',
      `    ${JSON.stringify(group.code)},`,
      `    ${JSON.stringify(group.label)},`,
      '    [',
      ...items,
      '    ],',
      ...(options ? [`    ${options}`] : []),
      '  ),',
    ].join('\n');
  });
  return {
    module: 'openxiangda/config',
    imports: [...imports].sort(),
    proposal: navigation,
    expression: ['defineAdminNavigation([', ...groups, '])'].join('\n'),
    groupCount: navigation.length,
    itemCount: navigation.reduce(
      (count, group) => count + group.items.length,
      0
    ),
  };
}

const authorizationProjectionFieldPathSchema = {
  type: 'string',
  pattern:
    '^[A-Za-z_][A-Za-z0-9_]{0,127}(?:\\.(?:value|snapshot\\.[A-Za-z_][A-Za-z0-9_]{0,127}))?$',
} as const;

const authorizationProjectionControlProperties = {
  enabledField: {
    type: 'string',
    pattern: '^[A-Za-z_][A-Za-z0-9_]{0,127}$',
  },
  effectiveFromField: {
    type: 'string',
    pattern: '^[A-Za-z_][A-Za-z0-9_]{0,127}$',
  },
  effectiveToField: {
    type: 'string',
    pattern: '^[A-Za-z_][A-Za-z0-9_]{0,127}$',
  },
  failureMode: { const: 'strict' },
} as const;

const roleMembershipSourceInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'code',
    'name',
    'resourceCode',
    'userIdField',
    'roleCode',
    'failureMode',
  ],
  properties: {
    code: {
      type: 'string',
      pattern: '^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$',
      maxLength: 100,
    },
    name: { type: 'string', minLength: 1, maxLength: 255 },
    resourceCode: { type: 'string' },
    userIdField: authorizationProjectionFieldPathSchema,
    roleCode: { type: 'string' },
    ...authorizationProjectionControlProperties,
  },
} as const;

const relationshipGrantSourceInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'code',
    'name',
    'resourceCode',
    'subject',
    'relationCode',
    'targetResourceCode',
    'resourceIdField',
    'operations',
    'failureMode',
  ],
  properties: {
    code: {
      type: 'string',
      pattern: '^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$',
      maxLength: 100,
    },
    name: { type: 'string', minLength: 1, maxLength: 255 },
    resourceCode: { type: 'string' },
    subject: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'userIdField'],
          properties: {
            type: { const: 'user' },
            userIdField: authorizationProjectionFieldPathSchema,
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'userIdField', 'roleCode'],
          properties: {
            type: { const: 'role_membership' },
            userIdField: authorizationProjectionFieldPathSchema,
            roleCode: { type: 'string' },
          },
        },
      ],
    },
    relationCode: { type: 'string', minLength: 1, maxLength: 128 },
    targetResourceCode: { type: 'string' },
    resourceIdField: authorizationProjectionFieldPathSchema,
    operations: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 64,
        pattern: '^[A-Za-z0-9][A-Za-z0-9:._*-]{0,63}$',
      },
    },
    ...authorizationProjectionControlProperties,
  },
} as const;

const authorizationTransitionInputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['fromAuthzDigest', 'reason'],
  properties: {
    fromAuthzDigest: {
      type: 'string',
      pattern: '^[0-9a-f]{64}$',
    },
    removeRoleCodes: {
      type: 'array',
      maxItems: 2000,
      uniqueItems: true,
      items: {
        type: 'string',
        pattern: '^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$',
        maxLength: 128,
      },
    },
    removeCapabilityCodes: {
      type: 'array',
      maxItems: 2000,
      uniqueItems: true,
      items: {
        type: 'string',
        pattern: '^[A-Za-z*][A-Za-z0-9:._*-]{0,254}$',
        maxLength: 255,
      },
    },
    reason: {
      type: 'string',
      minLength: 1,
      maxLength: 2000,
      pattern: '\\S',
    },
  },
} as const;

export const openXiangdaAppConfigSchema = {
  $id: 'openxiangda.app-config/v3',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'app', 'frontend', 'backend', 'platform'],
  properties: {
    schemaVersion: { const: 3 },
    app: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'name'],
      properties: {
        code: {
          type: 'string',
          pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
          minLength: 2,
          maxLength: 128,
        },
        name: { type: 'string', minLength: 1, maxLength: 255 },
      },
    },
    frontend: {
      type: 'object',
      additionalProperties: false,
      required: ['root'],
      properties: {
        root: { type: 'string', minLength: 1 },
        routes: { type: 'array', maxItems: 500, items: { type: 'object' } },
        admin: { type: 'object' },
        authentication: { type: 'object' },
        publicAccess: { type: 'object' },
        devicePolicy: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'mobileMaxWidthPx', 'desktopMinWidthPx'],
          properties: {
            kind: { const: 'viewport-family' },
            mobileMaxWidthPx: { type: 'integer', minimum: 320, maximum: 1600 },
            desktopMinWidthPx: { type: 'integer', minimum: 320, maximum: 1600 },
          },
        },
      },
    },
    backend: {
      type: 'object',
      additionalProperties: false,
      required: ['root', 'runtime', 'framework'],
      properties: {
        root: { type: 'string', minLength: 1 },
        runtime: { const: 'node' },
        framework: { const: 'nestjs' },
        enabled: { type: 'boolean' },
        isolation: { enum: ['shared', 'dedicated'] },
        resourceProfile: { enum: ['light', 'standard'] },
        secrets: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'env'],
            properties: {
              name: {
                type: 'string',
                pattern: '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$',
                maxLength: 128,
              },
              env: {
                type: 'string',
                pattern: '^[A-Z][A-Z0-9_]*$',
                maxLength: 128,
              },
              description: { type: 'string', maxLength: 2000 },
              required: { type: 'boolean' },
            },
          },
        },
        operations: {
          type: 'array',
          maxItems: 500,
          items: { type: 'object' },
        },
      },
    },
    platform: {
      type: 'object',
      additionalProperties: false,
      required: ['root'],
      properties: {
        root: { type: 'string', minLength: 1 },
      },
    },
    perspectives: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'name', 'roleCodes'],
        properties: {
          code: {
            type: 'string',
            pattern: '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$',
            maxLength: 128,
          },
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string', maxLength: 2000 },
          roleCodes: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            uniqueItems: true,
            items: { type: 'string' },
          },
          default: { type: 'boolean' },
        },
      },
    },
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['resources'],
      properties: {
        resources: { type: 'array', maxItems: 100, items: { type: 'object' } },
      },
    },
    authz: {
      type: 'object',
      additionalProperties: false,
      required: ['capabilities', 'roles'],
      properties: {
        authenticatedUserRoleCode: {
          type: 'string',
          pattern: '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$',
          maxLength: 128,
        },
        capabilities: {
          type: 'array',
          maxItems: 2000,
          items: { type: 'object' },
        },
        roles: { type: 'array', maxItems: 100, items: { type: 'object' } },
        scopeDimensions: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'name'],
            properties: {
              code: { type: 'string' },
              name: { type: 'string' },
              resourceCode: { type: 'string' },
              valueType: { enum: ['string', 'uuid'] },
              hierarchyMode: { enum: ['flat', 'self_parent'] },
              valueSource: {
                type: 'object',
                additionalProperties: false,
                required: ['kind', 'resourceCode', 'labelField'],
                properties: {
                  kind: { const: 'native_resource' },
                  resourceCode: { type: 'string' },
                  labelField: { type: 'string' },
                  enabledField: { type: 'string' },
                },
              },
            },
          },
        },
        scopeSources: {
          type: 'array',
          maxItems: 100,
          items: { type: 'object' },
        },
        roleMembershipSources: {
          type: 'array',
          maxItems: 100,
          items: roleMembershipSourceInputSchema,
        },
        relationshipGrantSources: {
          type: 'array',
          maxItems: 100,
          items: relationshipGrantSourceInputSchema,
        },
        dataPolicies: {
          type: 'array',
          maxItems: 100,
          items: { type: 'object' },
        },
        authorizationTransitions: {
          type: 'array',
          maxItems: 100,
          items: authorizationTransitionInputSchema,
        },
      },
    },
    events: {
      type: 'object',
      additionalProperties: false,
      required: ['subscriptions'],
      properties: {
        capturePolicies: {
          type: 'array', maxItems: 100,
          items: {
            type: 'object', additionalProperties: false,
            required: ['resourceCode', 'mode'],
            properties: { resourceCode: { type: 'string' }, mode: { enum: ['all', 'subscribed'] } },
          },
        },
        schemas: {
          type: 'array',
          maxItems: 100,
          items: { type: 'object' },
        },
        subscriptions: {
          type: 'array',
          maxItems: 100,
          items: { type: 'object' },
        },
        timers: {
          type: 'array',
          maxItems: 100,
          items: { type: 'object' },
        },
        dateTriggers: {
          type: 'array',
          maxItems: 100,
          items: { type: 'object' },
        },
      },
    },
    workflows: {
      type: 'object',
      additionalProperties: false,
      required: ['definitions', 'bindings', 'activations'],
      properties: {
        definitions: {
          type: 'array',
          maxItems: 100,
          items: { type: 'object' },
        },
        bindings: {
          type: 'array',
          maxItems: 100,
          items: { type: 'object' },
        },
        activations: {
          type: 'array',
          maxItems: 100,
          items: { type: 'object' },
        },
        providers: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['code', 'endpointPath'],
            properties: {
              code: {
                type: 'string',
                pattern: '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$',
              },
              endpointPath: {
                type: 'string',
                pattern: '^/[A-Za-z0-9/_-]+$',
              },
              timeoutMs: { type: 'integer', minimum: 100, maximum: 10000 },
            },
          },
        },
        editableParameters: {
          type: 'array',
          maxItems: 100,
          items: { type: 'object' },
        },
      },
    },
  },
} as const;

function diagnostic(
  code: string,
  message: string,
  path: string,
  remediation?: string
): Diagnostic {
  return {
    schemaVersion: SCHEMA_VERSIONS.diagnostic,
    code,
    severity: 'error',
    message,
    path,
    source: 'openxiangda-app.config.ts',
    retryable: false,
    ...(remediation ? { remediation } : {}),
  };
}

/**
 * A backend is opt-in for a resource-only application. Explicit backend
 * declarations (operations, secrets, events or workflows) still imply it.
 */
export function backendRuntimeRequired(config: OpenXiangdaAppConfig) {
  const backend = config.backend;
  return (
    backend.enabled === true ||
    (backend.enabled !== false &&
      Boolean(
        backend.operations?.length ||
          backend.secrets?.length ||
          config.events?.subscriptions?.some(item => !item.execution) ||
          config.events?.timers?.length ||
          config.events?.dateTriggers?.length ||
          config.workflows?.providers?.length
      ))
  );
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function policyRuleNodes(
  policy: Record<string, unknown>,
  policyPath: string,
  diagnostics: Diagnostic[]
) {
  const baseRules = (Array.isArray(policy.rules) ? policy.rules : []).map(
    (rule, index) => ({
      rule: object(rule),
      path: `${policyPath}.rules[${index}]`,
    })
  );
  if (policy.readExpression === undefined) return baseRules;
  const leaves: Array<{ rule: Record<string, unknown>; path: string }> = [];
  let structuralError = false;
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > DATA_POLICY_EXPRESSION_MAX_DEPTH) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHZ_POLICY_EXPRESSION_DEPTH_EXCEEDED',
          `策略表达式深度不能超过 ${DATA_POLICY_EXPRESSION_MAX_DEPTH}`,
          path
        )
      );
      structuralError = true;
      return;
    }
    const node = object(value);
    const groupKeys = ['allOf', 'anyOf'].filter(key => key in node);
    if (groupKeys.length === 0) {
      leaves.push({ rule: node, path });
      return;
    }
    const key = groupKeys[0]!;
    const children = Array.isArray(node[key]) ? node[key] : [];
    if (
      groupKeys.length !== 1 ||
      Object.keys(node).length !== 1 ||
      !Array.isArray(node[key]) ||
      children.length < 1 ||
      children.length > DATA_POLICY_EXPRESSION_MAX_GROUP_ITEMS
    ) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHZ_POLICY_EXPRESSION_GROUP_INVALID',
          `表达式节点只能声明一个 allOf/anyOf，且包含 1 到 ${DATA_POLICY_EXPRESSION_MAX_GROUP_ITEMS} 个子项`,
          path
        )
      );
      structuralError = true;
      return;
    }
    children.forEach((child, index) =>
      visit(child, `${path}.${key}[${index}]`, depth + 1)
    );
  };
  visit(policy.readExpression, `${policyPath}.readExpression`, 1);
  if (leaves.length > DATA_POLICY_EXPRESSION_MAX_LEAVES) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_AUTHZ_POLICY_EXPRESSION_LEAVES_EXCEEDED',
        `策略表达式最多包含 ${DATA_POLICY_EXPRESSION_MAX_LEAVES} 个规则叶子`,
        `${policyPath}.readExpression`
      )
    );
    structuralError = true;
  }
  if (!structuralError && leaves.length > 0) {
    try {
      dataPolicyExpressionToCnf(
        policy.readExpression as AppDataPolicyExpressionDeclaration
      );
    } catch {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHZ_POLICY_EXPRESSION_EXPANSION_EXCEEDED',
          '策略表达式规范化后超过 50 个 CNF 子句或 100 个规则实例',
          `${policyPath}.readExpression`
        )
      );
    }
  }
  return [...baseRules, ...leaves];
}

function eventSchemaDeclaresPath(
  schema: Record<string, unknown>,
  path: string
) {
  let current = schema;
  for (const segment of path.split('.')) {
    if (current.type === 'array') current = object(current.items);
    const properties = object(current.properties);
    if (!Object.prototype.hasOwnProperty.call(properties, segment)) {
      return false;
    }
    current = object(properties[segment]);
  }
  return true;
}

function eventDataMatchesSchema(
  schema: Record<string, unknown> | undefined,
  data: unknown
) {
  if (!schema) return false;
  try {
    const validator = new Ajv2020({
      allErrors: true,
      strict: false,
      validateFormats: false,
    }).compile(schema);
    return Boolean(validator(data));
  } catch {
    return false;
  }
}

function validDateTriggerOffset(value: unknown) {
  const match = /^([+-])?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
    string(value)
  );
  if (!match || !match.slice(2).some(part => part !== undefined)) return false;
  const milliseconds =
    Number(match[2] || 0) * 24 * 60 * 60 * 1000 +
    Number(match[3] || 0) * 60 * 60 * 1000 +
    Number(match[4] || 0) * 60 * 1000 +
    Number(match[5] || 0) * 1000;
  return (
    Number.isFinite(milliseconds) &&
    milliseconds <= 10 * 365 * 24 * 60 * 60 * 1000
  );
}

const EVENT_TYPE_PATTERN =
  /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9_-]*)+\.v[1-9][0-9]*$/;
const EVENT_DATA_SCHEMA_VERSION_PATTERN =
  /^[1-9][0-9]*\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/;
const EVENT_FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

function eventPredicateValid(value: unknown) {
  const predicate = object(value);
  const keys = Object.keys(predicate);
  if (
    keys.length !== 1 ||
    !['eq', 'ne', 'in', 'notIn', 'exists'].includes(keys[0] || '')
  ) {
    return false;
  }
  const operand = predicate[keys[0]!];
  if (keys[0] === 'exists' && typeof operand !== 'boolean') return false;
  if (
    (keys[0] === 'in' || keys[0] === 'notIn') &&
    (!Array.isArray(operand) || operand.length < 1 || operand.length > 20)
  ) return false;
  try {
    const serialized = JSON.stringify(predicate);
    return (
      typeof serialized === 'string' &&
      Buffer.byteLength(serialized, 'utf8') <= 4096
    );
  } catch {
    return false;
  }
}

function validateEventChangeFilter(
  value: unknown,
  path: string,
  allowedFields: Set<string>,
  diagnostics: Diagnostic[]
) {
  const change = object(value);
  const field = string(change.field);
  const keys = Object.keys(change);
  if (
    !EVENT_FIELD_PATTERN.test(field) ||
    !allowedFields.has(field) ||
    keys.some(key => !['field', 'before', 'after'].includes(key)) ||
    (!('before' in change) && !('after' in change)) ||
    ('before' in change && !eventPredicateValid(change.before)) ||
    ('after' in change && !eventPredicateValid(change.after))
  ) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_EVENT_CHANGE_FILTER_INVALID',
        '字段变化条件必须引用已声明字段，并且 before/after 各只使用一个受支持操作符',
        path
      )
    );
  }
}

function validateEventFilterCondition(
  value: unknown,
  path: string,
  allowedFields: Set<string>,
  diagnostics: Diagnostic[],
  state: { atoms: number },
  depth = 1
) {
  const condition = object(value);
  const keys = Object.keys(condition);
  if (depth > 3 || keys.length !== 1) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_EVENT_FILTER_COMPLEXITY_EXCEEDED',
        '事件过滤条件最多嵌套 3 层，且每层只能声明 change/all/any/not 之一',
        path
      )
    );
    return;
  }
  const key = keys[0]!;
  if (key === 'change') {
    state.atoms += 1;
    validateEventChangeFilter(condition.change, `${path}.change`, allowedFields, diagnostics);
  } else if (key === 'all' || key === 'any') {
    const items = Array.isArray(condition[key]) ? condition[key] : [];
    if (items.length < 1 || items.length > 16) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_EVENT_FILTER_GROUP_INVALID',
          '事件过滤 all/any 必须包含 1 到 16 个条件',
          `${path}.${key}`
        )
      );
    }
    items.forEach((item, index) =>
      validateEventFilterCondition(
        item,
        `${path}.${key}[${index}]`,
        allowedFields,
        diagnostics,
        state,
        depth + 1
      )
    );
  } else if (key === 'not') {
    validateEventFilterCondition(
      condition.not,
      `${path}.not`,
      allowedFields,
      diagnostics,
      state,
      depth + 1
    );
  } else {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_EVENT_FILTER_OPERATOR_INVALID',
        '事件过滤条件只支持 change/all/any/not',
        path
      )
    );
  }
}

export function validateAppConfig(value: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const config = object(value);
  rejectNativeEnvironmentFields(config, diagnostics);
  if (config.schemaVersion !== 3) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_SCHEMA_UNSUPPORTED',
        'schemaVersion 必须是 3',
        'schemaVersion',
        '使用 Native 2.0 模板重新生成 openxiangda-app.config.ts；不支持 v2 自动转换'
      )
    );
  }
  const app = object(config.app);
  const appCode = string(app.code);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(appCode)) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_CODE_INVALID',
        'app.code 必须是 kebab-case 稳定应用代码',
        'app.code'
      )
    );
  }
  if (!string(app.name)) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_NAME_REQUIRED',
        'app.name 必须是非空字符串',
        'app.name'
      )
    );
  }
  const platform = object(config.platform);
  for (const key of Object.keys(platform)) {
    if (key !== 'root') {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_PLATFORM_PROPERTY_UNSUPPORTED',
          `platform.${key} 不属于应用声明合同；平台能力要求只能由 compiler 派生`,
          `platform.${key}`
        )
      );
    }
  }
  const frontend = object(config.frontend);
  const backend = object(config.backend);
  const backendKeys = new Set([
    'root',
    'runtime',
    'framework',
    'enabled',
    'isolation',
    'resourceProfile',
    'secrets',
    'operations',
  ]);
  for (const key of Object.keys(backend)) {
    if (!backendKeys.has(key)) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_BACKEND_FIELD_UNSUPPORTED',
          `backend.${key} 不属于 2.0 后端合同`,
          `backend.${key}`
        )
      );
    }
  }
  for (const [path, root] of [
    ['frontend.root', frontend.root],
    ['backend.root', backend.root],
    ['platform.root', platform.root],
  ] as const) {
    if (!string(root)) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_ROOT_REQUIRED',
          `${path} 必须是非空相对路径`,
          path
        )
      );
    } else if (string(root).startsWith('/') || string(root).includes('..')) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_ROOT_UNSAFE',
          `${path} 必须位于工作区内`,
          path
        )
      );
    }
  }
  if (backend.runtime !== 'node') {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_BACKEND_RUNTIME_UNSUPPORTED',
        'backend.runtime 首期只支持 node',
        'backend.runtime'
      )
    );
  }
  if (backend.framework !== 'nestjs') {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_BACKEND_FRAMEWORK_UNSUPPORTED',
        'backend.framework 首期只支持 nestjs',
        'backend.framework'
      )
    );
  }
  if (
    backend.isolation !== undefined &&
    !['shared', 'dedicated'].includes(String(backend.isolation))
  ) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_BACKEND_ISOLATION_UNSUPPORTED',
        'backend.isolation 必须是 shared 或 dedicated',
        'backend.isolation'
      )
    );
  }
  if (
    backend.resourceProfile !== undefined &&
    !['light', 'standard'].includes(String(backend.resourceProfile))
  ) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_BACKEND_RESOURCE_PROFILE_UNSUPPORTED',
        'backend.resourceProfile 必须是 light 或 standard',
        'backend.resourceProfile'
      )
    );
  }
  validateApplicationAuthentication(
    config as unknown as Record<string, unknown>,
    diagnostics
  );
  validateFrontendDevicePolicy(
    config as unknown as Record<string, unknown>,
    diagnostics
  );
  validateFrontendRoutes(
    config as unknown as Record<string, unknown>,
    diagnostics
  );
  validateResourceDetailRoutes(
    config as unknown as Record<string, unknown>,
    diagnostics
  );
  validateFrontendUser(
    config as unknown as Record<string, unknown>,
    diagnostics
  );
  validateAnonymousPublicAccess(
    config as unknown as Record<string, unknown>,
    diagnostics
  );
  validateAdminAccess(config as unknown as OpenXiangdaAppConfig, diagnostics);
  validateAdminNavigation(config as unknown as OpenXiangdaAppConfig, diagnostics);
  validatePerspectives(config.perspectives, object(config.authz).roles, diagnostics);
  const declaredResources = new Map(
    (Array.isArray(object(config.data).resources)
      ? (object(config.data).resources as unknown[])
      : []
    ).map(resource => {
      const item = object(resource);
      const schema = object(item.schema);
      const fields = Array.isArray(schema.fields) ? schema.fields : [];
      return [
        string(item.code),
        new Map(
          fields.map(field => {
            const declaration = object(field);
            return [string(declaration.code), string(declaration.type)];
          })
        ),
      ] as const;
    })
  );
  const declaredResourceCodes = new Set(declaredResources.keys());
  const declaredWorkflowCodes = new Set(
    (Array.isArray(object(config.workflows).activations)
      ? (object(config.workflows).activations as unknown[])
      : []
    ).map(item => string(object(item).workflowCode))
  );
  validateBackendOperations(
    backend.operations,
    declaredResources,
    declaredWorkflowCodes,
    new Set((Array.isArray(object(config.authz).roles) ? object(config.authz).roles as unknown[] : []).map(role => string(object(role).code))),
    diagnostics
  );
  const eventConfig = object(config.events);
  const workflowConfig = object(config.workflows);
  if (
    backend.enabled === false &&
    (Array.isArray(backend.operations) && backend.operations.length > 0 ||
      Array.isArray(backend.secrets) && backend.secrets.length > 0 ||
      Array.isArray(eventConfig.subscriptions) &&
        eventConfig.subscriptions.some(item => !object(item).execution) ||
      Array.isArray(eventConfig.timers) && eventConfig.timers.length > 0 ||
      Array.isArray(eventConfig.dateTriggers) &&
        eventConfig.dateTriggers.length > 0 ||
      Array.isArray(workflowConfig.providers) && workflowConfig.providers.length > 0)
  ) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_BACKEND_DISABLED_WITH_DECLARATIONS',
        'backend.enabled=false 时不能声明后端操作、Secret、事件消费者或工作流人员提供器',
        'backend.enabled'
      )
    );
  }
  const secretNames = new Set<string>();
  const secretEnvs = new Set<string>();
  (Array.isArray(backend.secrets) ? backend.secrets : []).forEach(
    (raw, index) => {
      const secret = object(raw);
      const name = string(secret.name);
      const env = string(secret.env);
      const path = `backend.secrets[${index}]`;
      if (!/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(name)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_BACKEND_SECRET_NAME_INVALID',
            '后端 Secret name 必须是稳定的 kebab/snake-case 逻辑名称',
            `${path}.name`
          )
        );
      }
      if (
        !/^[A-Z][A-Z0-9_]*$/.test(env) ||
        env.startsWith('OPENXIANGDA_') ||
        ['NODE_ENV', 'PORT'].includes(env)
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_BACKEND_SECRET_ENV_INVALID',
            '后端 Secret env 必须是合法大写环境变量，且不能占用平台保留变量',
            `${path}.env`
          )
        );
      }
      if (secretNames.has(name) || secretEnvs.has(env)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_BACKEND_SECRET_DUPLICATE',
            '后端 Secret 的 name 和 env 必须各自唯一',
            path
          )
        );
      }
      if (
        secret.required !== undefined &&
        typeof secret.required !== 'boolean'
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_BACKEND_SECRET_REQUIRED_INVALID',
            '后端 Secret required 必须是 boolean',
            `${path}.required`
          )
        );
      }
      secretNames.add(name);
      secretEnvs.add(env);
    }
  );
  const data = object(config.data);
  if (config.data !== undefined && !Array.isArray(data.resources)) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_DATA_RESOURCES_REQUIRED',
        'data.resources 必须是数组',
        'data.resources'
      )
    );
  } else {
    const resources = Array.isArray(data.resources) ? data.resources : [];
    const resourceCodes = new Set<string>();
    resources.forEach((resource, index) => {
        const resourceDiagnostics = validateDataResource(resource);
        diagnostics.push(
          ...resourceDiagnostics.map(item => ({
            ...item,
            path: `data.resources[${index}]${
              item.path === '$' ? '' : `.${item.path}`
            }`,
            source: 'openxiangda-app.config.ts',
          }))
        );
        if (
          object(resource).appCode &&
          string(object(resource).appCode) !== appCode
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_RESOURCE_APP_MISMATCH',
              'DataResource.appCode 必须与 app.code 一致',
              `data.resources[${index}].appCode`
            )
          );
        }
        const resourceRecord = object(resource);
        const resourceCode = string(resourceRecord.code);
        if (resourceCode && resourceCodes.has(resourceCode)) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_RESOURCE_DUPLICATE',
              `数据资源 code ${resourceCode} 不能重复`,
              `data.resources[${index}].code`
            )
          );
        }
        if (resourceCode) resourceCodes.add(resourceCode);
      });
    resources.forEach((resource, index) => {
      const resourceRecord = object(resource);
      const fields = object(resourceRecord.schema).fields;
      (Array.isArray(fields) ? fields : []).forEach((rawField, fieldIndex) => {
        const field = object(rawField);
        const source = object(field.source);
        if (string(source.kind) !== 'resource') return;
        const targetCode = string(source.resourceCode);
        const target = resources.find(
          candidate => string(object(candidate).code) === targetCode
        );
        const sourcePath = `data.resources[${index}].schema.fields[${fieldIndex}].source`;
        if (!target) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_RESOURCE_SOURCE_TARGET_NOT_FOUND',
              `动态选项来源 ${targetCode} 必须在同一应用中声明`,
              `${sourcePath}.resourceCode`
            )
          );
          return;
        }
        const targetFields = object(object(target).schema).fields;
        const targetFieldList = Array.isArray(targetFields) ? targetFields : [];
        const labelField = string(source.labelField);
        const label = (Array.isArray(targetFields) ? targetFields : []).find(
          candidate => string(object(candidate).code) === labelField
        );
        if (
          !label ||
          !['text.short', 'text.long'].includes(string(object(label).type))
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_RESOURCE_SOURCE_LABEL_INVALID',
              `动态选项标签字段 ${labelField} 必须是 text.short 或 text.long`,
              `${sourcePath}.labelField`
            )
          );
        }
        for (const key of [
          'searchFields',
          'descriptionFields',
          'snapshotFields',
        ]) {
          const values = Array.isArray(source[key]) ? source[key] : [];
          values.forEach((value, valueIndex) => {
            const targetField = targetFieldList.find(
              candidate => string(object(candidate).code) === string(value)
            );
            if (!targetField) {
              diagnostics.push(
                diagnostic(
                  'APP_CONFIG_DATA_RESOURCE_SOURCE_FIELD_NOT_FOUND',
                  `动态来源字段 ${String(value)} 未在 ${targetCode} 声明`,
                  `${sourcePath}.${key}[${valueIndex}]`
                )
              );
            } else if (
              key === 'searchFields' &&
              !supportsSearch(
                string(object(targetField).type) as DataFieldDefinition['type']
              )
            ) {
              diagnostics.push(
                diagnostic(
                  'APP_CONFIG_DATA_RESOURCE_SOURCE_SEARCH_UNSUPPORTED',
                  `动态来源字段 ${String(value)} 不支持搜索`,
                  `${sourcePath}.${key}[${valueIndex}]`
                )
              );
            }
          });
        }
        const sourceFilters = Array.isArray(source.filters) ? source.filters : [];
        sourceFilters.forEach((rawFilter, filterIndex) => {
          const filter = object(rawFilter);
          const targetFieldCode = string(filter.field);
          if (
            !targetFieldList.some(
              candidate => string(object(candidate).code) === targetFieldCode
            )
          ) {
            diagnostics.push(
              diagnostic(
                'APP_CONFIG_DATA_RESOURCE_SOURCE_FILTER_FIELD_NOT_FOUND',
                `动态来源筛选字段 ${targetFieldCode} 未在 ${targetCode} 声明`,
                `${sourcePath}.filters[${filterIndex}].field`
              )
            );
          }
          const bindingField = string(object(filter.binding).field);
          if (
            bindingField &&
            !(Array.isArray(fields) ? fields : []).some(
              candidate => string(object(candidate).code) === bindingField
            )
          ) {
            diagnostics.push(
              diagnostic(
                'APP_CONFIG_DATA_RESOURCE_SOURCE_BINDING_FIELD_NOT_FOUND',
                `动态来源绑定字段 ${bindingField} 未在当前资源声明`,
                `${sourcePath}.filters[${filterIndex}].binding.field`
              )
            );
          }
        });
      });
    });
  }
  const authz = object(config.authz);
  const declaredCapabilities = Array.isArray(authz.capabilities)
    ? authz.capabilities
    : [];
  if (config.authz !== undefined) {
    if (!Array.isArray(authz.capabilities)) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHZ_CAPABILITIES_REQUIRED',
          'authz.capabilities 必须是显式 backend/ui capability 数组',
          'authz.capabilities'
        )
      );
    }
    validateCapabilityDeclarations(appCode, declaredCapabilities, diagnostics);
    const roles = Array.isArray(authz.roles) ? authz.roles : [];
    if (!Array.isArray(authz.roles)) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHZ_ROLES_REQUIRED',
          'authz.roles 必须是数组',
          'authz.roles'
        )
      );
    }
    const forbiddenNativeMutationCapabilities = new Map<
      string,
      { resourceCode: string; operation: 'create' | 'update' | 'delete' }
    >();
    for (const rawResource of Array.isArray(data.resources)
      ? data.resources
      : []) {
      const resource = object(rawResource);
      const mutationOwner =
        string(object(resource.surface).mutationOwner) || 'native';
      if (mutationOwner === 'native') continue;
      for (const operation of ['create', 'update', 'delete'] as const) {
        const capability = string(object(resource.capabilities)[operation]);
        if (capability) {
          forbiddenNativeMutationCapabilities.set(capability, {
            resourceCode: string(resource.code),
            operation,
          });
        }
      }
    }
    const roleCodes = new Set<string>();
    roles.forEach((raw, index) => {
      const role = object(raw);
      const code = string(role.code);
      if (!/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(code)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_ROLE_CODE_INVALID',
            '角色 code 必须是稳定的小写标识',
            `authz.roles[${index}].code`
          )
        );
      } else if (roleCodes.has(code)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_ROLE_DUPLICATE',
            '角色 code 不能重复',
            `authz.roles[${index}].code`
          )
        );
      }
      roleCodes.add(code);
      if (
        !string(role.name) ||
        !Array.isArray(role.capabilities) ||
        'isAppSuperAdmin' in role
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_ROLE_INVALID',
            '角色必须声明 name 和 capabilities',
            `authz.roles[${index}]`
          )
        );
      }
      const capabilities = Array.isArray(role.capabilities)
        ? role.capabilities
        : [];
      const seenCapabilities = new Set<string>();
      capabilities.forEach((rawCapability, capabilityIndex) => {
        const capability = string(rawCapability);
        if (
          !/^[A-Za-z0-9][A-Za-z0-9:._*-]{0,254}$/.test(capability) ||
          seenCapabilities.has(capability)
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_AUTHZ_CAPABILITY_INVALID',
              'capability 必须是非空稳定标识，且同一角色内不能重复',
              `authz.roles[${index}].capabilities[${capabilityIndex}]`
            )
          );
        }
        const forbiddenMutation =
          forbiddenNativeMutationCapabilities.get(capability);
        if (forbiddenMutation) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_RESOURCE_NATIVE_MUTATION_GRANT_FORBIDDEN',
              `${forbiddenMutation.resourceCode} 的 ${forbiddenMutation.operation} 由非 Native owner 管理，应用角色不能获得对应 Native Data capability`,
              `authz.roles[${index}].capabilities[${capabilityIndex}]`
            )
          );
        }
        seenCapabilities.add(capability);
      });
      const deniedCapabilities = Array.isArray(role.deniedCapabilities)
        ? role.deniedCapabilities
        : [];
      if (
        role.deniedCapabilities !== undefined &&
        !Array.isArray(role.deniedCapabilities)
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_ROLE_DENIED_CAPABILITIES_INVALID',
            'deniedCapabilities 必须是 capability 数组',
            `authz.roles[${index}].deniedCapabilities`
          )
        );
      }
      const seenDeniedCapabilities = new Set<string>();
      deniedCapabilities.forEach((rawCapability, capabilityIndex) => {
        const capability = string(rawCapability);
        if (
          !/^[A-Za-z0-9][A-Za-z0-9:._*-]{0,254}$/.test(capability) ||
          seenDeniedCapabilities.has(capability)
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_AUTHZ_ROLE_DENIED_CAPABILITY_INVALID',
              'denied capability 必须是非空稳定标识，且同一角色内不能重复',
              `authz.roles[${index}].deniedCapabilities[${capabilityIndex}]`
            )
          );
        }
        seenDeniedCapabilities.add(capability);
      });
    });
    const authenticatedUserRoleCode =
      authz.authenticatedUserRoleCode === undefined
        ? ''
        : string(authz.authenticatedUserRoleCode);
    if (
      authz.authenticatedUserRoleCode !== undefined &&
      (!/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(
        authenticatedUserRoleCode
      ) ||
        !roleCodes.has(authenticatedUserRoleCode))
    ) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHENTICATED_USER_ROLE_INVALID',
          'authenticatedUserRoleCode 必须引用一个已声明的 package role',
          'authz.authenticatedUserRoleCode'
        )
      );
    }
    const dimensions = Array.isArray(authz.scopeDimensions)
      ? authz.scopeDimensions
      : [];
    const policies = Array.isArray(authz.dataPolicies)
      ? authz.dataPolicies
      : [];
    for (const [name, values] of [
      ['scopeDimensions', authz.scopeDimensions],
      ['scopeSources', authz.scopeSources],
      ['roleMembershipSources', authz.roleMembershipSources],
      ['relationshipGrantSources', authz.relationshipGrantSources],
      ['dataPolicies', authz.dataPolicies],
    ] as const) {
      if (values !== undefined && !Array.isArray(values)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_COLLECTION_INVALID',
            `authz.${name} 必须是数组`,
            `authz.${name}`
          )
        );
      }
    }
    const dataResources = Array.isArray(data.resources) ? data.resources : [];
    const resourceFieldTypes = new Map<string, Map<string, string>>(
      dataResources.map(rawResource => {
        const resource = object(rawResource);
        const schema = object(resource.schema);
        const fields = Array.isArray(schema.fields) ? schema.fields : [];
        return [
          string(resource.code),
          new Map(
            fields.map(rawField => {
              const field = object(rawField);
              return [string(field.code), string(field.type)];
            })
          ),
        ];
      })
    );
    const resourceFields = new Map<string, Set<string>>(
      [...resourceFieldTypes].map(([resourceCode, fields]) => [
        resourceCode,
        new Set(fields.keys()),
      ])
    );
    const resourceFieldDeclarations = new Map<
      string,
      Map<string, Record<string, unknown>>
    >(
      dataResources.map(rawResource => {
        const resource = object(rawResource);
        const fields = Array.isArray(object(resource.schema).fields)
          ? (object(resource.schema).fields as unknown[])
          : [];
        return [
          string(resource.code),
          new Map(
            fields.map(rawField => {
              const field = object(rawField);
              return [string(field.code), field];
            })
          ),
        ];
      })
    );
    const dimensionCodes = new Set<string>();
    dimensions.forEach((raw, index) => {
      const dimension = object(raw);
      const code = string(dimension.code);
      const dimensionPath = `authz.scopeDimensions[${index}]`;
      if (
        !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(code) ||
        dimensionCodes.has(code) ||
        !string(dimension.name) ||
        (dimension.valueType !== undefined &&
          !['string', 'uuid'].includes(string(dimension.valueType))) ||
        (dimension.hierarchyMode !== undefined &&
          !['flat', 'self_parent'].includes(string(dimension.hierarchyMode)))
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_DIMENSION_INVALID',
            'scope dimension 必须声明唯一 code、name 和受支持的类型',
            dimensionPath
          )
        );
      }
      if (dimension.valueSource !== undefined) {
        const valueSource = object(dimension.valueSource);
        const valueSourcePath = `${dimensionPath}.valueSource`;
        const valueSourceKeys = Object.keys(valueSource);
        const allowedKeys = new Set([
          'kind',
          'resourceCode',
          'labelField',
          'enabledField',
        ]);
        const resourceCode = string(valueSource.resourceCode);
        const labelField = string(valueSource.labelField);
        const enabledField =
          valueSource.enabledField === undefined
            ? undefined
            : string(valueSource.enabledField);
        const declaredFieldTypes = resourceFieldTypes.get(resourceCode);
        if (
          string(valueSource.kind) !== 'native_resource' ||
          string(dimension.valueType) !== 'uuid' ||
          !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(resourceCode) ||
          !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(labelField) ||
          (enabledField !== undefined &&
            !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(enabledField)) ||
          valueSourceKeys.some(key => !allowedKeys.has(key))
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_AUTHZ_DIMENSION_VALUE_SOURCE_INVALID',
              'native_resource valueSource 必须声明 UUID 维度、资源、标签字段和可选启用字段',
              valueSourcePath
            )
          );
        }
        if (!declaredFieldTypes) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_AUTHZ_DIMENSION_VALUE_SOURCE_RESOURCE_INVALID',
              'native_resource valueSource 必须引用同一应用内已声明的 Data Resource',
              `${valueSourcePath}.resourceCode`
            )
          );
        } else if (
          !['text.short', 'text.long', 'serial-number'].includes(
            declaredFieldTypes.get(labelField) || ''
          ) ||
          (enabledField !== undefined &&
            declaredFieldTypes.get(enabledField) !== 'boolean')
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_AUTHZ_DIMENSION_VALUE_SOURCE_FIELD_INVALID',
              'valueSource 标签字段必须为文本/流水号，启用字段必须为 boolean',
              valueSourcePath
            )
          );
        }
      }
      dimensionCodes.add(code);
    });
    const scopeSources = Array.isArray(authz.scopeSources)
      ? authz.scopeSources
      : [];
    const sourceCodes = new Set<string>();
    scopeSources.forEach((raw, index) => {
      const source = object(raw);
      const sourcePath = `authz.scopeSources[${index}]`;
      const code = string(source.code);
      const subject = object(source.subject);
      const grants = Array.isArray(source.grants) ? source.grants : [];
      const subjectType = string(subject.type);
      const roleCode = string(subject.roleCode);
      const resourceCode = string(source.resourceCode);
      const declaredFields = resourceFields.get(resourceCode);
      if (
        !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(code) ||
        sourceCodes.has(code) ||
        !string(source.name) ||
        !/^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/.test(
          resourceCode
        ) ||
        !['user', 'role_membership'].includes(subjectType) ||
        !SEMANTIC_FIELD_PATH_PATTERN.test(
          string(subject.userIdField)
        ) ||
        (subjectType === 'role_membership' && !roleCodes.has(roleCode)) ||
        (subjectType === 'user' && Boolean(roleCode)) ||
        grants.length === 0 ||
        !['strict', 'last_known_good'].includes(string(source.failureMode))
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_SCOPE_SOURCE_INVALID',
            'scope source 必须声明唯一 code、Data Resource、主体映射、grant 映射与失败策略',
            sourcePath
          )
        );
      }
      const grantDimensions = new Set<string>();
      grants.forEach((rawGrant, grantIndex) => {
        const grant = object(rawGrant);
        const dimensionCode = string(grant.dimensionCode);
        if (
          !dimensionCodes.has(dimensionCode) ||
          grantDimensions.has(dimensionCode) ||
          !SEMANTIC_FIELD_PATH_PATTERN.test(
            string(grant.valueField)
          ) ||
          (grant.parentValueField !== undefined &&
            !SEMANTIC_FIELD_PATH_PATTERN.test(
              string(grant.parentValueField)
            ))
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_AUTHZ_SCOPE_SOURCE_GRANT_INVALID',
              'scope source grant 必须引用唯一已声明维度及有效字段',
              `${sourcePath}.grants[${grantIndex}]`
            )
          );
        }
        grantDimensions.add(dimensionCode);
      });
      for (const field of [
        'operationField',
        'enabledField',
        'effectiveFromField',
        'effectiveToField',
      ]) {
        if (
          source[field] !== undefined &&
          !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(string(source[field]))
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_AUTHZ_SCOPE_SOURCE_FIELD_INVALID',
              'scope source 可选字段必须是有效 Data Resource 字段名',
              `${sourcePath}.${field}`
            )
          );
        }
      }
      const referencedFields = [
        string(subject.userIdField),
        ...grants.flatMap(rawGrant => {
          const grant = object(rawGrant);
          return [
            string(grant.valueField),
            ...(grant.parentValueField === undefined
              ? []
              : [string(grant.parentValueField)]),
          ];
        }),
        ...[
          source.operationField,
          source.enabledField,
          source.effectiveFromField,
          source.effectiveToField,
        ]
          .filter(value => value !== undefined)
          .map(string),
      ];
      if (
        !declaredFields ||
        referencedFields.some(
          field => !declaredFields.has(semanticFieldPathRoot(field))
        )
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_SCOPE_SOURCE_RESOURCE_INVALID',
            'scope source 必须引用已声明 Data Resource 及其真实字段',
            sourcePath
          )
        );
      }
      sourceCodes.add(code);
    });
    const projectionSourceCodes = new Set<string>();
    const roleMembershipSources = Array.isArray(authz.roleMembershipSources)
      ? authz.roleMembershipSources
      : [];
    const relationshipGrantSources = Array.isArray(
      authz.relationshipGrantSources
    )
      ? authz.relationshipGrantSources
      : [];
    const projectionUserPathValid = (
      path: string,
      fields: Map<string, Record<string, unknown>> | undefined
    ) => {
      const root = semanticFieldPathRoot(path);
      return (
        SEMANTIC_FIELD_PATH_PATTERN.test(path) &&
        path === `${root}.value` &&
        string(fields?.get(root)?.type) === 'user.single'
      );
    };
    const projectionControlFieldsValid = (
      source: Record<string, unknown>,
      fields: Map<string, Record<string, unknown>> | undefined
    ) =>
      source.failureMode === 'strict' &&
      (source.enabledField === undefined ||
        string(fields?.get(string(source.enabledField))?.type) === 'boolean') &&
      (source.effectiveFromField === undefined ||
        ['date', 'datetime'].includes(
          string(fields?.get(string(source.effectiveFromField))?.type)
        )) &&
      (source.effectiveToField === undefined ||
        ['date', 'datetime'].includes(
          string(fields?.get(string(source.effectiveToField))?.type)
        ));
    roleMembershipSources.forEach((raw, index) => {
      const source = object(raw);
      const sourcePath = `authz.roleMembershipSources[${index}]`;
      const unknownKeys = Object.keys(source).filter(
        key =>
          ![
            'code',
            'name',
            'resourceCode',
            'userIdField',
            'roleCode',
            'enabledField',
            'effectiveFromField',
            'effectiveToField',
            'failureMode',
          ].includes(key)
      );
      if (unknownKeys.length > 0) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_SCHEMA_INVALID',
            `role membership source 包含未知属性 ${unknownKeys.join(', ')}`,
            sourcePath
          )
        );
      }
      const code = string(source.code);
      const resourceCode = string(source.resourceCode);
      const fields = resourceFieldDeclarations.get(resourceCode);
      if (
        !/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(code) ||
        code.length > 100 ||
        projectionSourceCodes.has(code) ||
        !string(source.name) ||
        !fields ||
        !projectionUserPathValid(string(source.userIdField), fields) ||
        !roleCodes.has(string(source.roleCode)) ||
        !projectionControlFieldsValid(source, fields)
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_ROLE_MEMBERSHIP_SOURCE_INVALID',
            'role membership source 必须声明唯一来源、user.single.value、已声明 package role 与严格控制字段',
            sourcePath
          )
        );
      }
      if (
        authenticatedUserRoleCode &&
        string(source.roleCode) === authenticatedUserRoleCode
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHENTICATED_USER_ROLE_SOURCE_CONFLICT',
            '登录用户默认角色不能同时由 roleMembershipSource 管理',
            `${sourcePath}.roleCode`
          )
        );
      }
      projectionSourceCodes.add(code);
    });
    relationshipGrantSources.forEach((raw, index) => {
      const source = object(raw);
      const sourcePath = `authz.relationshipGrantSources[${index}]`;
      const unknownKeys = Object.keys(source).filter(
        key =>
          ![
            'code',
            'name',
            'resourceCode',
            'subject',
            'relationCode',
            'targetResourceCode',
            'resourceIdField',
            'operations',
            'enabledField',
            'effectiveFromField',
            'effectiveToField',
            'failureMode',
          ].includes(key)
      );
      if (unknownKeys.length > 0) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_SCHEMA_INVALID',
            `relationship grant source 包含未知属性 ${unknownKeys.join(', ')}`,
            sourcePath
          )
        );
      }
      const code = string(source.code);
      const resourceCode = string(source.resourceCode);
      const targetResourceCode = string(source.targetResourceCode);
      const fields = resourceFieldDeclarations.get(resourceCode);
      const subject = object(source.subject);
      const subjectType = string(subject.type);
      const subjectUnknownKeys = Object.keys(subject).filter(
        key => !['type', 'userIdField', 'roleCode'].includes(key)
      );
      if (subjectUnknownKeys.length > 0) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_SCHEMA_INVALID',
            `relationship grant subject 包含未知属性 ${subjectUnknownKeys.join(', ')}`,
            `${sourcePath}.subject`
          )
        );
      }
      const resourceIdPath = string(source.resourceIdField);
      const resourceIdRoot = semanticFieldPathRoot(resourceIdPath);
      const resourceIdField = fields?.get(resourceIdRoot);
      const resourceReference = object(resourceIdField?.source);
      const resourceIdValid =
        (resourceIdPath === 'id' && targetResourceCode === resourceCode) ||
        (resourceIdPath === `${resourceIdRoot}.value` &&
          string(resourceIdField?.type) === 'resource-ref.single' &&
          string(resourceReference.resourceCode) === targetResourceCode);
      const operations = Array.isArray(source.operations)
        ? source.operations.map(string)
        : [];
      if (
        !/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(code) ||
        code.length > 100 ||
        projectionSourceCodes.has(code) ||
        !string(source.name) ||
        !fields ||
        !resourceFieldDeclarations.has(targetResourceCode) ||
        !['user', 'role_membership'].includes(subjectType) ||
        !projectionUserPathValid(string(subject.userIdField), fields) ||
        (subjectType === 'role_membership' &&
          !roleCodes.has(string(subject.roleCode))) ||
        !/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(
          string(source.relationCode)
        ) ||
        !resourceIdValid ||
        operations.length === 0 ||
        operations.length > 20 ||
        new Set(operations).size !== operations.length ||
        operations.some(
          operation =>
            !/^[A-Za-z0-9][A-Za-z0-9:._*-]{0,63}$/.test(operation)
        ) ||
        !projectionControlFieldsValid(source, fields)
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_RELATIONSHIP_GRANT_SOURCE_INVALID',
            'relationship grant source 必须声明唯一来源、有效主体/目标关系、常量操作与严格控制字段',
            sourcePath
          )
        );
      }
      projectionSourceCodes.add(code);
    });
    const policyCodes = new Set<string>();
    policies.forEach((raw, index) => {
      const policy = object(raw);
      const policyPath = `authz.dataPolicies[${index}]`;
      const unknownPolicyKeys = Object.keys(policy).filter(
        key =>
          ![
            'code',
            'name',
            'resourceCode',
            'unrestrictedRoleCodes',
            'operations',
            'matchMode',
            'rules',
            'readExpression',
            'writeBoundary',
          ].includes(key)
      );
      if (unknownPolicyKeys.length > 0) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_POLICY_KEYS_INVALID',
            'data policy 包含未声明字段',
            policyPath
          )
        );
      }
      const code = string(policy.code);
      const rules = Array.isArray(policy.rules) ? policy.rules : [];
      const hasReadExpression = policy.readExpression !== undefined;
      const operations = Array.isArray(policy.operations)
        ? policy.operations.map(string)
        : [];
      const operationsValid =
        policy.operations === undefined ||
        (Array.isArray(policy.operations) &&
          operations.length > 0 &&
          operations.length <= 4 &&
          new Set(operations).size === operations.length &&
          operations.every(operation =>
            ['read', 'create', 'update', 'delete'].includes(operation)
          ));
      const capabilityOnlyBoundary =
        policy.writeBoundary === 'capability_only' &&
        policy.matchMode === 'AND' &&
        rules.length === 0 &&
        hasReadExpression;
      const scopedBoundary =
        rules.length > 0 && policy.writeBoundary === undefined;
      const validPolicyForm =
        ['AND', 'OR'].includes(string(policy.matchMode)) &&
        (scopedBoundary || capabilityOnlyBoundary) &&
        (!hasReadExpression || policy.operations === undefined);
      if (
        !/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(code) ||
        policyCodes.has(code) ||
        !string(policy.name) ||
        !validPolicyForm
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_POLICY_INVALID',
            'data policy 必须声明基础 matchMode/rules；readExpression 只叠加到读取，空基础规则必须显式声明 writeBoundary=capability_only',
            policyPath
          )
        );
      }
      if (!operationsValid) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_POLICY_OPERATIONS_INVALID',
            'operations 必须是不重复的 read/create/update/delete 非空数组',
            `${policyPath}.operations`
          )
        );
      }
      policyCodes.add(code);
      if (
        !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(
          string(policy.resourceCode)
        )
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_POLICY_RESOURCE_REQUIRED',
            'data policy 必须声明唯一目标 resourceCode',
            `authz.dataPolicies[${index}].resourceCode`
          )
        );
      }
      if (policy.unrestrictedRoleCodes !== undefined) {
        const unrestrictedRoleCodes = Array.isArray(
          policy.unrestrictedRoleCodes
        )
          ? policy.unrestrictedRoleCodes
          : [];
        const seenUnrestrictedRoleCodes = new Set<string>();
        if (unrestrictedRoleCodes.length === 0) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_AUTHZ_POLICY_UNRESTRICTED_ROLES_INVALID',
              'unrestrictedRoleCodes 必须是非空的已声明角色数组',
              `authz.dataPolicies[${index}].unrestrictedRoleCodes`
            )
          );
        }
        unrestrictedRoleCodes.forEach((rawRoleCode, roleIndex) => {
          const roleCode = string(rawRoleCode);
          if (
            !roleCodes.has(roleCode) ||
            seenUnrestrictedRoleCodes.has(roleCode)
          ) {
            diagnostics.push(
              diagnostic(
                'APP_CONFIG_AUTHZ_POLICY_UNRESTRICTED_ROLE_INVALID',
                'unrestrictedRoleCodes 只能引用已声明的不重复角色',
                `authz.dataPolicies[${index}].unrestrictedRoleCodes[${roleIndex}]`
              )
            );
          }
          seenUnrestrictedRoleCodes.add(roleCode);
        });
      }
      const policyFields = resourceFieldTypes.get(string(policy.resourceCode));
      policyRuleNodes(policy, policyPath, diagnostics).forEach(
        ({ rule, path: rulePath }) => {
        const unknownRuleKeys = Object.keys(rule).filter(
          key =>
            ![
              'subject',
              'dimensionCode',
              'relationCode',
              'resourceCode',
              'field',
              'roleCodes',
              'operation',
              'valuePath',
              'emptyMatchesAll',
              'operator',
              'value',
              'operand',
            ].includes(key)
        );
        if (unknownRuleKeys.length > 0) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_AUTHZ_POLICY_RULE_KEYS_INVALID',
              'data policy 规则包含未声明字段',
              rulePath
            )
          );
        }
        const subject = string(rule.subject);
        const dimensionCode = string(rule.dimensionCode);
        const relationCode = string(rule.relationCode);
        const operator = string(rule.operator);
        const dbNow = rule.operand === 'db_now';
        const nullPredicate = ['is_null', 'is_not_null'].includes(operator);
        const constantPredicate = ['eq', 'not_eq', 'in', 'not_in'].includes(
          operator
        );
        const modes = [
          subject,
          dimensionCode,
          relationCode,
          dbNow ? 'db_now' : '',
          constantPredicate || nullPredicate ? 'constant' : '',
        ].filter(Boolean);
        const validCurrentUser = subject === 'current_user';
        const validDimension =
          Boolean(dimensionCode) && dimensionCodes.has(dimensionCode);
        const validRelationship =
          Boolean(relationCode) && Boolean(string(rule.resourceCode));
        const validConstant =
          constantPredicate &&
          (['in', 'not_in'].includes(operator)
            ? Array.isArray(rule.value) &&
              rule.value.length > 0 &&
              rule.value.length <= 100 &&
              rule.value.every(
                value => typeof value === 'string' && value.length <= 2048
              ) &&
              new Set(rule.value).size === rule.value.length
            : typeof rule.value === 'string' &&
              rule.value.length > 0 &&
              rule.value.length <= 2048);
        const validNull =
          nullPredicate &&
          rule.value === undefined &&
          rule.operand === undefined;
        const validDbNow =
          dbNow &&
          ['lt', 'lte', 'gt', 'gte'].includes(operator) &&
          rule.value === undefined &&
          policyFields?.get(string(rule.field)) === 'datetime';
        if (
          !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(string(rule.field)) ||
          modes.length !== 1 ||
          (!validCurrentUser &&
            !validDimension &&
            !validRelationship &&
            !validConstant &&
            !validNull &&
            !validDbNow)
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_AUTHZ_POLICY_RULE_INVALID',
              '策略规则必须且只能声明 current_user、dimension、relationship、constant/null 或 datetime db_now 中的一种',
              rulePath
            )
          );
        }
        if (dbNow && !validDbNow) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_AUTHZ_POLICY_DB_NOW_FIELD_INVALID',
              'db_now 只支持 datetime 字段及 lt/lte/gt/gte 操作符',
              `${rulePath}.field`
            )
          );
        }
        if (rule.roleCodes !== undefined) {
          const scopedRoleCodes = Array.isArray(rule.roleCodes)
            ? rule.roleCodes
            : [];
          const seenRuleRoleCodes = new Set<string>();
          if (scopedRoleCodes.length === 0) {
            diagnostics.push(
              diagnostic(
                'APP_CONFIG_AUTHZ_POLICY_ROLE_CODES_INVALID',
                'roleCodes 必须是非空的已声明角色数组',
                `${rulePath}.roleCodes`
              )
            );
          }
          scopedRoleCodes.forEach((rawRoleCode, roleIndex) => {
            const roleCode = string(rawRoleCode);
            if (
              !roleCode ||
              !roleCodes.has(roleCode) ||
              seenRuleRoleCodes.has(roleCode)
            ) {
              diagnostics.push(
                diagnostic(
                  'APP_CONFIG_AUTHZ_POLICY_ROLE_CODE_INVALID',
                  '数据策略的 roleCodes 只能引用已声明的不重复角色',
                  `${rulePath}.roleCodes[${roleIndex}]`
                )
              );
            }
            seenRuleRoleCodes.add(roleCode);
          });
        }
        }
      );
    });
    scopeSources.forEach((rawSource, sourceIndex) => {
      const source = object(rawSource);
      if (string(source.failureMode) !== 'last_known_good') return;
      const sourceDimensions = new Set(
        (Array.isArray(source.grants) ? source.grants : []).map(rawGrant =>
          string(object(rawGrant).dimensionCode)
        )
      );
      const matchingRules = policies.flatMap(rawPolicy => {
        return policyRuleNodes(object(rawPolicy), 'authz.dataPolicies', []).map(
          entry => entry.rule
        ).filter(rawRule =>
          sourceDimensions.has(string(rawRule.dimensionCode))
        );
      });
      if (
        matchingRules.length === 0 ||
        matchingRules.some(rawRule => string(object(rawRule).operation) !== 'read')
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_SCOPE_SOURCE_LAST_KNOWN_GOOD_UNSAFE',
            'last_known_good 只能用于全部显式声明 operation=read 的低风险数据策略；其他场景使用 strict',
            `authz.scopeSources[${sourceIndex}].failureMode`
          )
        );
      }
    });
    dataResources.forEach((raw, index) => {
      const policyCode = string(object(raw).dataPolicyCode);
      if (policyCode && !policyCodes.has(policyCode)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_AUTHZ_DATA_POLICY_NOT_FOUND',
            `DataResource 引用了未声明的数据策略: ${policyCode}`,
            `data.resources[${index}].dataPolicyCode`
          )
        );
      }
    });
    diagnostics.push(
      ...validateAuthzSemanticBindings({
        resources: dataResources,
        dimensions,
        scopeSources,
        policies,
      })
    );
    validateAuthorizationTransitions(
      authz.authorizationTransitions,
      roleCodes,
      diagnostics
    );
  }
  validateCapabilityClosure(
    appCode,
    config,
    declaredCapabilities,
    diagnostics
  );
  const events = object(config.events);
  const eventDataResources = Array.isArray(object(config.data).resources)
    ? (object(config.data).resources as unknown[])
    : [];
  const eventResourceFields = new Map<string, Map<string, string>>(
    eventDataResources.map(rawResource => {
      const resource = object(rawResource);
      const fields = Array.isArray(object(resource.schema).fields)
        ? (object(resource.schema).fields as unknown[])
        : [];
      return [
        string(resource.code),
        new Map(
          fields.map(rawField => {
            const field = object(rawField);
            return [string(field.code), string(field.type)];
          })
        ),
      ];
    })
  );
  const workflowSummaryResourceFields = new Map<
    string,
    Map<string, { type: string; system: boolean; maxLength?: number }>
  >(
    eventDataResources.map(rawResource => {
      const resource = object(rawResource);
      const fields = Array.isArray(object(resource.schema).fields)
        ? (object(resource.schema).fields as unknown[])
        : [];
      const surfaceFields = object(object(resource.surface).fields);
      return [
        string(resource.code),
        new Map(
          fields.map(rawField => {
            const field = object(rawField);
            const code = string(field.code);
            const surface = object(surfaceFields[code]);
            const maxLength =
              typeof field.maxLength === 'number' &&
              Number.isFinite(field.maxLength)
                ? field.maxLength
                : undefined;
            return [
              code,
              {
                type: string(field.type),
                system: surface.system === true || field.system === true,
                ...(maxLength !== undefined ? { maxLength } : {}),
              },
            ] as const;
          })
        ),
      ] as const;
    })
  );
  const platformEventTypes = new Set<string>(PLATFORM_EVENT_TYPES_V2);
  const declaredEventTypes = new Set<string>();
  const applicationEventSchemas = new Map<string, Record<string, unknown>>();
  const schemaKeys = new Set<string>();
  (Array.isArray(events.schemas) ? events.schemas : []).forEach((item, index) => {
    const schema = object(item);
    const path = `events.schemas[${index}]`;
    const eventType = string(schema.eventType);
    const dataSchemaVersion = string(schema.dataSchemaVersion);
    const jsonSchema = object(schema.jsonSchema);
    const sensitiveFields = Array.isArray(schema.sensitiveFields)
      ? schema.sensitiveFields.map(value => string(value))
      : [];
    const sensitiveFieldsValid =
      (schema.sensitiveFields === undefined ||
        Array.isArray(schema.sensitiveFields)) &&
      sensitiveFields.length <= 100 &&
      new Set(sensitiveFields).size === sensitiveFields.length &&
      sensitiveFields.every(
        field =>
          /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){0,7}$/.test(
            field
          ) && eventSchemaDeclaresPath(jsonSchema, field)
      );
    const schemaKey = `${eventType}:${dataSchemaVersion}`;
    let schemaBytes = Number.POSITIVE_INFINITY;
    try {
      schemaBytes = Buffer.byteLength(JSON.stringify(schema.jsonSchema), 'utf8');
    } catch {
      // Reported by the combined validation below.
    }
    const schemaValid = !(
      !EVENT_TYPE_PATTERN.test(eventType) ||
      eventType.startsWith('openxiangda.') ||
      !eventType.startsWith(`${appCode}.`) ||
      !EVENT_DATA_SCHEMA_VERSION_PATTERN.test(dataSchemaVersion) ||
      object(schema.jsonSchema) !== schema.jsonSchema ||
      jsonSchema.type !== 'object' ||
      schemaBytes > 256 * 1024 ||
      !sensitiveFieldsValid ||
      schemaKeys.has(schemaKey) ||
      declaredEventTypes.has(eventType)
    );
    if (!schemaValid) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_EVENT_SCHEMA_INVALID',
          '应用事件 Schema 必须使用 appCode 命名空间、major 事件类型、SemVer dataSchemaVersion、不超过 256 KiB 的 object JSON Schema；sensitiveFields 最多 100 个、路径规范且必须指向已声明字段，且版本不可重复',
          path
        )
      );
    }
    if (schemaValid) {
      declaredEventTypes.add(eventType);
      applicationEventSchemas.set(eventType, jsonSchema);
    }
    schemaKeys.add(schemaKey);
  });
  const allowedEventTypes = new Set([...platformEventTypes, ...declaredEventTypes]);
  const captureFieldsByResource = new Map<string, Set<string>>();
  const subscriptionCodes = new Set<string>();
  if (config.events !== undefined && !Array.isArray(events.subscriptions)) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_EVENT_SUBSCRIPTIONS_REQUIRED',
        'events.subscriptions 必须是数组',
        'events.subscriptions'
      )
    );
  } else {
    (Array.isArray(events.subscriptions) ? events.subscriptions : []).forEach(
      (item, index) => {
        const subscription = object(item);
        const path = `events.subscriptions[${index}]`;
        if ('environmentKey' in subscription) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_ENVIRONMENT_OVERRIDE_FORBIDDEN',
              '事件声明属于环境中立 AppVersion，不能声明 environmentKey',
              `${path}.environmentKey`
            )
          );
        }
        const subscriptionCode = string(subscription.code);
        if (
          !/^[a-z][a-z0-9-]*$/.test(subscriptionCode) ||
          subscriptionCodes.has(subscriptionCode)
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_EVENT_SUBSCRIPTION_CODE_INVALID',
              '事件订阅 code 必须是唯一的 kebab-case',
              `${path}.code`
            )
          );
        }
        if (
          !Array.isArray(subscription.eventTypes) ||
          subscription.eventTypes.length === 0 ||
          subscription.eventTypes.length > 20 ||
          new Set(subscription.eventTypes.map(string)).size !==
            subscription.eventTypes.length ||
          subscription.eventTypes.some(
            eventType => !allowedEventTypes.has(string(eventType))
          )
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_EVENT_TYPES_INVALID',
              '事件订阅必须声明 1 到 20 个不重复且已注册的 v2 eventTypes',
              `${path}.eventTypes`
            )
          );
        }
        if ('endpointPath' in subscription) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_EVENT_ENDPOINT_DECLARATION_FORBIDDEN',
              '事件订阅 endpointPath 由 code 生成，应用不能重复声明',
              `${path}.endpointPath`
            )
          );
        }
        subscriptionCodes.add(subscriptionCode);
        const filter = object(subscription.filter);
        const filterKeys = Object.keys(filter);
        const resourceCodes = Array.isArray(filter.resourceCodes)
          ? filter.resourceCodes.map(string)
          : [];
        if (
          filterKeys.some(
            key =>
              !['resourceCodes', 'subject', 'changedFields', 'changes', 'where'].includes(
                key
              )
          ) ||
          resourceCodes.length > 20 ||
          new Set(resourceCodes).size !== resourceCodes.length ||
          resourceCodes.some(code => !eventResourceFields.has(code))
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_EVENT_FILTER_RESOURCE_INVALID',
              '事件过滤 resourceCodes 必须引用最多 20 个不重复的已声明资源',
              `${path}.filter`
            )
          );
        }
        const allowedFields = new Set<string>();
        if (resourceCodes.length > 0) {
          const fieldSets = resourceCodes
            .map(code => eventResourceFields.get(code))
            .filter(Boolean) as Map<string, string>[];
          for (const field of fieldSets[0]?.keys() || []) {
            if (fieldSets.every(fields => fields.has(field))) allowedFields.add(field);
          }
        }
        const subject = object(filter.subject);
        if (
          Object.keys(subject).length > 1 ||
          Object.keys(subject).some(key => !['equals', 'prefix'].includes(key)) ||
          Object.values(subject).some(value => typeof value !== 'string')
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_EVENT_FILTER_SUBJECT_INVALID',
              'subject 过滤只能声明 equals 或 prefix 之一',
              `${path}.filter.subject`
            )
          );
        }
        const referencedFields = new Set<string>();
        const changedFields = object(filter.changedFields);
        const filterComplexity = {
          atoms:
            (resourceCodes.length > 0 ? 1 : 0) +
            (Object.keys(subject).length > 0 ? 1 : 0),
        };
        for (const [group, rawFields] of Object.entries(changedFields)) {
          const fields = Array.isArray(rawFields) ? rawFields.map(string) : [];
          fields.forEach(field => referencedFields.add(field));
          if (['anyOf', 'allOf', 'noneOf'].includes(group)) {
            filterComplexity.atoms += 1;
          }
          if (
            !['anyOf', 'allOf', 'noneOf'].includes(group) ||
            fields.length < 1 ||
            fields.length > 32 ||
            new Set(fields).size !== fields.length
          ) {
            diagnostics.push(
              diagnostic(
                'APP_CONFIG_EVENT_CHANGED_FIELDS_INVALID',
                'changedFields 只支持 anyOf/allOf/noneOf，每组 1 到 32 个不重复字段',
                `${path}.filter.changedFields.${group}`
              )
            );
          }
        }
        const changes = Array.isArray(filter.changes) ? filter.changes : [];
        filterComplexity.atoms += changes.length;
        if (changes.length > 16) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_EVENT_CHANGE_FILTERS_EXCEEDED',
              '单个订阅最多声明 16 个字段变化条件',
              `${path}.filter.changes`
            )
          );
        }
        changes.forEach((change, changeIndex) => {
          referencedFields.add(string(object(change).field));
          validateEventChangeFilter(
            change,
            `${path}.filter.changes[${changeIndex}]`,
            allowedFields,
            diagnostics
          );
        });
        if (filter.where !== undefined) {
          validateEventFilterCondition(
            filter.where,
            `${path}.filter.where`,
            allowedFields,
            diagnostics,
            filterComplexity
          );
        }
        if (filterComplexity.atoms > 16) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_EVENT_FILTER_ATOMS_EXCEEDED',
              '单个订阅最多包含 16 个原子过滤条件',
              `${path}.filter`
            )
          );
        }
        const payload = object(subscription.payload);
        const projectionFields = Array.isArray(payload.fields)
          ? payload.fields.map(string)
          : [];
        projectionFields.forEach(field => referencedFields.add(field));
        if (
          Object.keys(payload).some(
            key => !['includeChanges', 'fields'].includes(key)
          ) ||
          (payload.includeChanges !== undefined &&
            typeof payload.includeChanges !== 'boolean') ||
          projectionFields.length > 32 ||
          new Set(projectionFields).size !== projectionFields.length ||
          referencedFields.size > 0 && resourceCodes.length === 0 ||
          [...referencedFields].some(field => !allowedFields.has(field))
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_EVENT_PROJECTION_INVALID',
              '字段过滤和 payload.fields 必须绑定 resourceCodes、引用各目标资源共有字段，且单订阅投影最多 32 个字段',
              `${path}.payload`
            )
          );
        }
        for (const resourceCode of resourceCodes) {
          const captured = captureFieldsByResource.get(resourceCode) || new Set();
          referencedFields.forEach(field => captured.add(field));
          captureFieldsByResource.set(resourceCode, captured);
        }
        if (subscription.platformAccess !== undefined) {
          const access = object(subscription.platformAccess);
          const notification = object(access.notification);
          const copies = Array.isArray(access.managedFileCopies)
            ? access.managedFileCopies
            : [];
          let copiesInvalid =
            access.managedFileCopies !== undefined &&
            (copies.length === 0 || copies.length > 16);
          const copyKeys = new Set<string>();
          for (const rawCopy of copies) {
            const copy = object(rawCopy);
            const sourceResourceCode = string(copy.sourceResourceCode);
            const targetResourceCode = string(copy.targetResourceCode);
            const sourceFields = Array.isArray(copy.sourceFieldCodes)
              ? copy.sourceFieldCodes.map(string)
              : [];
            const targetFields = Array.isArray(copy.targetFieldCodes)
              ? copy.targetFieldCodes.map(string)
              : [];
            const source = eventResourceFields.get(sourceResourceCode);
            const target = eventResourceFields.get(targetResourceCode);
            copiesInvalid ||=
              copy.mode !== 'copy' ||
              !source ||
              !target ||
              sourceFields.length === 0 ||
              targetFields.length === 0 ||
              sourceFields.length > 16 ||
              targetFields.length > 16 ||
              new Set(sourceFields).size !== sourceFields.length ||
              new Set(targetFields).size !== targetFields.length ||
              sourceFields.some(field => !['file', 'image'].includes(source?.get(field) || '')) ||
              targetFields.some(field => !['file', 'image'].includes(target?.get(field) || '')) ||
              sourceFields.length !== targetFields.length ||
              sourceFields.some((field, i) => source?.get(field) !== target?.get(targetFields[i] || '')) ||
              Object.keys(copy).some(key => ![
                'mode',
                'sourceResourceCode',
                'sourceFieldCodes',
                'targetResourceCode',
                'targetFieldCodes',
              ].includes(key));
            const key = `${sourceResourceCode}:${sourceFields.join(',')}=>${targetResourceCode}:${targetFields.join(',')}`;
            if (copyKeys.has(key)) copiesInvalid = true;
            copyKeys.add(key);
          }
          if (
            Object.keys(access).some(key => !['notification', 'managedFileCopies'].includes(key)) ||
            (access.notification !== undefined &&
              (notification.mode !== 'business-standard' ||
                Object.keys(notification).some(key => key !== 'mode'))) ||
            (access.notification === undefined && access.managedFileCopies === undefined) ||
            copiesInvalid
          ) {
            diagnostics.push(
              diagnostic(
                'APP_CONFIG_EVENT_PLATFORM_ACCESS_INVALID',
                '事件订阅 platformAccess 只能显式声明标准业务通知或有界托管文件复制依赖',
                `${path}.platformAccess`
              )
            );
          }
        }
        const delivery = {
          timeoutMs: 10_000,
          maxAttempts: 8,
          initialBackoffMs: 1_000,
          maxBackoffMs: 300_000,
          ordering: 'none',
          concurrency: 10,
          ...object(subscription.delivery),
        };
        if (
          !Number.isInteger(delivery.timeoutMs) ||
          Number(delivery.timeoutMs) < 1000 ||
          Number(delivery.timeoutMs) > 30_000 ||
          !Number.isInteger(delivery.maxAttempts) ||
          Number(delivery.maxAttempts) < 1 ||
          Number(delivery.maxAttempts) > 12 ||
          !Number.isInteger(delivery.initialBackoffMs) ||
          Number(delivery.initialBackoffMs) < 1000 ||
          !Number.isInteger(delivery.maxBackoffMs) ||
          Number(delivery.maxBackoffMs) < Number(delivery.initialBackoffMs) ||
          Number(delivery.maxBackoffMs) > 1_800_000 ||
          !['none', 'record', 'workflow-instance'].includes(
            string(delivery.ordering)
          ) ||
          !Number.isInteger(delivery.concurrency) ||
          Number(delivery.concurrency) < 1 ||
          Number(delivery.concurrency) > 50
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_EVENT_DELIVERY_POLICY_INVALID',
              'delivery 超出 timeout、attempt、backoff、ordering 或 concurrency 的平台上限',
              `${path}.delivery`
            )
          );
        }
      }
    );
  }
  for (const [resourceCode, fields] of captureFieldsByResource) {
    if (fields.size > 64) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_EVENT_CAPTURE_PLAN_EXCEEDED',
          `资源 ${resourceCode} 的订阅捕获字段并集超过 64 个`,
          'events.subscriptions'
        )
      );
    }
  }
  const timerCodes = new Set<string>();
  (Array.isArray(events.timers) ? events.timers : []).forEach(
    (item, index) => {
      const timer = object(item);
      const path = `events.timers[${index}]`;
      if ('environmentKey' in timer) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_ENVIRONMENT_OVERRIDE_FORBIDDEN',
            '定时声明属于环境中立 AppVersion，不能声明 environmentKey',
            `${path}.environmentKey`
          )
        );
      }
      if (
        !/^[a-z][a-z0-9-]*$/.test(string(timer.code)) ||
        timerCodes.has(string(timer.code))
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_TIMER_CODE_INVALID',
            '定时订阅 code 必须是 kebab-case',
            `${path}.code`
          )
        );
      }
      timerCodes.add(string(timer.code));
      if (
        !declaredEventTypes.has(string(timer.eventType)) ||
        !string(timer.cronExpression) ||
        !string(timer.timezone) ||
        (timer.misfirePolicy !== undefined &&
          timer.misfirePolicy !== 'coalesce_one')
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_TIMER_SCHEDULE_REQUIRED',
            '定时订阅必须引用应用事件 Schema，并声明六段 cronExpression、IANA timezone 和 coalesce_one misfire policy',
            path
          )
        );
      }
      const cronExpression = string(timer.cronExpression);
      const timezone = string(timer.timezone);
      if (cronExpression && timezone) {
        try {
          const first = CronExpressionParser.parse(cronExpression, {
            currentDate: '2026-01-01T00:00:00.000Z',
            tz: timezone,
            strict: true,
            hashSeed: string(timer.code),
          });
          const firstDueAt = first.next().toDate();
          const secondDueAt = first.next().toDate();
          if (secondDueAt.getTime() - firstDueAt.getTime() < 60_000) {
            diagnostics.push(
              diagnostic(
                'APP_CONFIG_TIMER_FREQUENCY_TOO_HIGH',
                '定时订阅最短间隔为 60 秒',
                `${path}.cronExpression`
              )
            );
          }
        } catch (error) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_TIMER_CRON_INVALID',
              `定时订阅必须使用明确的六段 Cron 与有效 IANA 时区：${
                error instanceof Error ? error.message : String(error)
              }`,
              cronExpression ? `${path}.cronExpression` : `${path}.timezone`
            )
          );
        }
      }
      if (
        timer.payload === null ||
        typeof timer.payload !== 'object' ||
        Array.isArray(timer.payload)
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_TIMER_PAYLOAD_INVALID',
            '定时事件 payload 必须是对象',
            `${path}.payload`
          )
        );
      } else if (
        Buffer.byteLength(JSON.stringify(timer.payload || {}), 'utf8') > 64 * 1024
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_TIMER_PAYLOAD_TOO_LARGE',
            '定时事件 payload 不能超过 64 KiB',
            `${path}.payload`
          )
        );
      } else if (
        !eventDataMatchesSchema(
          applicationEventSchemas.get(string(timer.eventType)),
          timer.payload
        )
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_TIMER_PAYLOAD_SCHEMA_INVALID',
            '定时事件 payload 必须完整满足所引用的应用事件 JSON Schema',
            `${path}.payload`
          )
        );
      }
    }
  );
  const dateTriggerCodes = new Set<string>();
  (Array.isArray(events.dateTriggers) ? events.dateTriggers : []).forEach(
    (item, index) => {
      const trigger = object(item);
      const path = `events.dateTriggers[${index}]`;
      const code = string(trigger.code);
      const resourceCode = string(trigger.resourceCode);
      const field = string(trigger.field);
      const fieldType = eventResourceFields.get(resourceCode)?.get(field);
      const payload = object(trigger.payload);
      let payloadBytes = Number.POSITIVE_INFINITY;
      try {
        payloadBytes = Buffer.byteLength(
          JSON.stringify(trigger.payload || {}),
          'utf8'
        );
      } catch {
        // Reported by the combined validation below.
      }
      if (
        !/^[a-z][a-z0-9-]*$/.test(code) ||
        dateTriggerCodes.has(code) ||
        !eventResourceFields.has(resourceCode) ||
        !['date', 'datetime'].includes(fieldType || '') ||
        !validDateTriggerOffset(trigger.offset) ||
        !declaredEventTypes.has(string(trigger.eventType)) ||
        trigger.payload === null ||
        typeof trigger.payload !== 'object' ||
        Array.isArray(trigger.payload) ||
        payloadBytes > 64 * 1024 ||
        Object.keys(payload).some(key =>
          DATE_TRIGGER_RESERVED_DATA_FIELDS.has(key)
        ) ||
        !eventDataMatchesSchema(
          applicationEventSchemas.get(string(trigger.eventType)),
          {
            ...payload,
            triggerCode: code,
            resourceCode,
            recordId: '00000000-0000-4000-8000-000000000000',
            recordRevision: 1,
            field,
            dueAt: '2026-01-01T00:00:00.000Z',
          }
        )
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATE_TRIGGER_INVALID',
            'dateTrigger 必须使用唯一 code、date/datetime 字段、十年内 ISO-8601 offset、已注册应用事件、无保留字段且完整生成数据满足 JSON Schema',
            path
          )
        );
      }
      dateTriggerCodes.add(code);
    }
  );
  const workflows = object(config.workflows);
  if (
    config.workflows !== undefined &&
    (!Array.isArray(workflows.definitions) ||
      !Array.isArray(workflows.bindings) ||
      !Array.isArray(workflows.activations))
  ) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_WORKFLOW_DECLARATIONS_REQUIRED',
        'workflows 必须同时声明 definitions、bindings 和 activations 数组',
        'workflows'
      )
    );
  } else {
    const definitions = Array.isArray(workflows.definitions)
      ? workflows.definitions
      : [];
    const bindings = Array.isArray(workflows.bindings) ? workflows.bindings : [];
    const activations = Array.isArray(workflows.activations)
      ? workflows.activations
      : [];
    const providers = Array.isArray(workflows.providers)
      ? workflows.providers
      : [];
    const editableParameters = Array.isArray(workflows.editableParameters)
      ? workflows.editableParameters
      : [];
    const frontendRoutesByCode = new Map<string, Record<string, unknown>>(
      (Array.isArray(frontend.routes) ? frontend.routes : []).map(
        routeValue => {
          const route = object(routeValue);
          return [string(route.code), route] as const;
        }
      )
    );
    const definitionByKey = new Map<string, WorkflowDefinition>();
    const bindingByKey = new Map<string, WorkflowBinding>();
    const providerKeys = new Set<string>();
    providers.forEach((item, index) => {
      const provider = object(item);
      const path = `workflows.providers[${index}]`;
      const code = string(provider.code);
      const endpointPath = string(provider.endpointPath);
      const key = code;
      if ('environmentKey' in provider) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_ENVIRONMENT_OVERRIDE_FORBIDDEN',
            'Workflow Provider 属于环境中立 AppVersion，不能声明 environmentKey',
            `${path}.environmentKey`
          )
        );
      }
      if (
        !/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(code) ||
        !/^\/[A-Za-z0-9/_-]+$/.test(endpointPath) ||
        endpointPath.split('/').includes('..')
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_PROVIDER_INVALID',
            'App Provider 必须声明合法 code 和应用内 endpointPath',
            path
          )
        );
      }
      if (providerKeys.has(key)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_PROVIDER_DUPLICATE',
            `App Provider 重复: ${key}`,
            path
          )
        );
      }
      providerKeys.add(key);
    });
    const editableParameterCodes = new Set<string>();
    editableParameters.forEach((item, index) => {
      const parameter = object(item);
      const code = string(parameter.code);
      const path = `workflows.editableParameters[${index}]`;
      const allowedRoleCodes = Array.isArray(parameter.allowedRoleCodes)
        ? parameter.allowedRoleCodes.map(string)
        : [];
      const allowedProviderCodes = Array.isArray(parameter.allowedProviderCodes)
        ? parameter.allowedProviderCodes.map(string)
        : [];
      if (
        !OPERATION_CODE_PATTERN.test(code) ||
        editableParameterCodes.has(code) ||
        !string(parameter.workflowCode) ||
        !string(parameter.bindingKey) ||
        !string(parameter.label) ||
        !['role_code', 'user_ids', 'provider_code'].includes(
          string(parameter.valueType)
        ) ||
        new Set(allowedRoleCodes).size !== allowedRoleCodes.length ||
        new Set(allowedProviderCodes).size !== allowedProviderCodes.length
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_EDITABLE_PARAMETER_INVALID',
            'Workflow editable parameter 必须声明唯一 code、workflow/binding、label 和受支持的 valueType',
            path
          )
        );
      }
      editableParameterCodes.add(code);
    });
    const backendOperationsByCode = new Map(
      (Array.isArray(backend.operations) ? backend.operations : []).map(raw => {
        const operation = object(raw);
        return [string(operation.code), operation] as const;
      })
    );
    const dataResourcesByCode = new Map(
      (Array.isArray(data.resources) ? data.resources : []).map(raw => {
        const resource = object(raw);
        return [string(resource.code), resource] as const;
      })
    );
    const validateNamedOperationIntent = (
      rawIntent: unknown,
      intentKind: 'create' | 'existing',
      definition: WorkflowDefinition,
      path: string
    ) => {
      const intent = object(rawIntent);
      const operationCode = string(intent.operationCode);
      const operation = backendOperationsByCode.get(operationCode);
      const inputs = object(intent.inputs);
      const output = object(intent.output);
      const subjectResource = dataResourcesByCode.get(
        definition.subject?.resourceCode
      );
      const subjectSchema = object(subjectResource?.schema);
      const subjectFields = new Set(
        (Array.isArray(subjectSchema.fields) ? subjectSchema.fields : []).map(
          field => string(object(field).code)
        )
      );
      const requestSchema = object(operation?.requestSchema);
      const requestProperties = object(requestSchema.properties);
      const requestRequired = new Set(
        Array.isArray(requestSchema.required)
          ? requestSchema.required.map(string)
          : []
      );
      const responseProperties = object(
        object(operation?.responseSchema).properties
      );
      const operationWorkflow = object(
        object(operation?.platformAccess).workflow
      );
      const operationWorkflowCodes = Array.isArray(operationWorkflow.codes)
        ? operationWorkflow.codes.map(string)
        : [];
      if (
        Object.keys(intent).some(
          key => !['operationCode', 'inputs', 'output'].includes(key)
        ) ||
        !OPERATION_CODE_PATTERN.test(operationCode) ||
        !operation ||
        string(operation.method) !== 'POST' ||
        !operationWorkflowCodes.includes(definition.code)
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_NAMED_OPERATION_INVALID',
            '标准 Workflow named-operation 必须引用同一应用中声明目标 Workflow platformAccess 的 POST operation',
            path
          )
        );
      }
      const inputEntries = Object.entries(inputs);
      const propertyCodePattern = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;
      const fieldCodes = new Set<string>();
      const sourceCounts = new Map<string, number>();
      let inputsInvalid =
        !isRecord(intent.inputs) ||
        inputEntries.length === 0 ||
        inputEntries.length > 64;
      for (const [inputCode, rawBinding] of inputEntries) {
        const binding = object(rawBinding);
        const source = string(binding.source);
        const allowedKeys = source === 'field' ? ['source', 'fieldCode'] : ['source'];
        inputsInvalid ||=
          !propertyCodePattern.test(inputCode) ||
          !(inputCode in requestProperties) ||
          ![
            'field',
            'idempotency-key',
            'current-user-reference',
            'subject-id',
            'subject-revision',
            'requested-at',
          ].includes(source) ||
          Object.keys(binding).some(key => !allowedKeys.includes(key));
        sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
        if (source === 'field') {
          const fieldCode = string(binding.fieldCode);
          inputsInvalid ||=
            !propertyCodePattern.test(fieldCode) ||
            !subjectFields.has(fieldCode) ||
            fieldCodes.has(fieldCode);
          fieldCodes.add(fieldCode);
        }
      }
      inputsInvalid ||=
        [...requestRequired].some(inputCode => !(inputCode in inputs)) ||
        (sourceCounts.get('idempotency-key') || 0) !== 1 ||
        ![...inputEntries].some(
          ([inputCode, rawBinding]) =>
            string(object(rawBinding).source) === 'idempotency-key' &&
            requestRequired.has(inputCode)
        );
      if (intentKind === 'create') {
        inputsInvalid ||=
          (sourceCounts.get('subject-id') || 0) > 0 ||
          (sourceCounts.get('subject-revision') || 0) > 0;
      } else {
        inputsInvalid ||=
          (sourceCounts.get('subject-id') || 0) !== 1 ||
          (sourceCounts.get('subject-revision') || 0) !== 1;
      }
      if (inputsInvalid) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_NAMED_OPERATION_INPUT_INVALID',
            'named-operation 必须以唯一且完整的顶层 input binding 覆盖请求必填字段、平台幂等键及对应 create/existing 身份来源',
            `${path}.inputs`
          )
        );
      }
      const subjectIdOutput = string(output.subjectId);
      const subjectRevisionOutput = string(output.subjectRevision);
      const processCommandOutput = string(output.processCommand);
      if (
        !isRecord(intent.output) ||
        Object.keys(output).some(
          key => !['subjectId', 'subjectRevision', 'processCommand'].includes(key)
        ) ||
        !propertyCodePattern.test(subjectIdOutput) ||
        !(subjectIdOutput in responseProperties) ||
        (output.subjectRevision !== undefined &&
          (!propertyCodePattern.test(subjectRevisionOutput) ||
            !(subjectRevisionOutput in responseProperties))) ||
        (output.processCommand !== undefined &&
          (!propertyCodePattern.test(processCommandOutput) ||
            !(processCommandOutput in responseProperties)))
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_NAMED_OPERATION_OUTPUT_INVALID',
            'named-operation output 必须引用 responseSchema 中的顶层 subjectId、可选 revision 和可选 processCommand 属性',
            `${path}.output`
          )
        );
      }
      return fieldCodes;
    };
    definitions.forEach((item, index) => {
      const declaration = object(item);
      const definition = object(declaration.definition) as unknown as WorkflowDefinition;
      const version = Number(declaration.version);
      const path = `workflows.definitions[${index}]`;
      const launch = object(declaration.launch);
      if (
        Object.keys(declaration).some(
          key =>
            !['version', 'definition', 'launch', 'detailRouteCode'].includes(
              key
            )
        )
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_DEFINITION_DECLARATION_INVALID',
            'Workflow definition declaration 只能声明 version、definition、launch 和 detailRouteCode',
            path
          )
        );
      }
      if (
        declaration.launch !== undefined &&
        (Object.keys(launch).some(
          key => !['mode', 'submission'].includes(key)
        ) ||
          ![
            'standalone',
            'custom-page',
            'hidden-handoff',
            'work-center-only',
          ].includes(string(launch.mode)))
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_LAUNCH_MODE_INVALID',
            'Workflow launch.mode 必须是 standalone、custom-page、hidden-handoff 或 work-center-only',
            `${path}.launch.mode`
          )
        );
      }
      if (launch.submission !== undefined) {
        const submission = object(launch.submission);
        const createFields = submission.create
          ? validateNamedOperationIntent(
              submission.create,
              'create',
              definition,
              `${path}.launch.submission.create`
            )
          : new Set<string>();
        const existingFields = submission.existing
          ? validateNamedOperationIntent(
              submission.existing,
              'existing',
              definition,
              `${path}.launch.submission.existing`
            )
          : new Set<string>();
        const contexts = Array.isArray(submission.context)
          ? submission.context
          : [];
        const contextKeys = new Set<string>();
        let contextInvalid = contexts.length > 16;
        for (const rawContext of contexts) {
          const context = object(rawContext);
          const queryParameter = string(context.queryParameter);
          const fieldCode = string(context.fieldCode);
          contextInvalid ||=
            Object.keys(context).some(
              key => !['queryParameter', 'fieldCode'].includes(key)
            ) ||
            !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(queryParameter) ||
            contextKeys.has(queryParameter) ||
            (!createFields.has(fieldCode) && !existingFields.has(fieldCode));
          contextKeys.add(queryParameter);
        }
        if (
          !isRecord(launch.submission) ||
          submission.kind !== 'named-operation' ||
          Object.keys(submission).some(
            key => !['kind', 'create', 'existing', 'context'].includes(key)
          ) ||
          (!['standalone', 'hidden-handoff'].includes(string(launch.mode))) ||
          (!submission.create && !submission.existing)
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_WORKFLOW_NAMED_OPERATION_SUBMISSION_INVALID',
              'named-operation submission 只适用于 standalone/hidden-handoff，且必须声明 create 或 existing intent',
              `${path}.launch.submission`
            )
          );
        }
        if (contextInvalid) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_WORKFLOW_LAUNCH_CONTEXT_INVALID',
              'Workflow launch context 必须唯一、受限并指向已绑定的 subject form field',
              `${path}.launch.submission.context`
            )
          );
        }
      }
      if (declaration.detailRouteCode !== undefined) {
        const detailRouteCode = object(declaration.detailRouteCode);
        const desktopCode = string(detailRouteCode.desktop);
        const mobileCode = string(detailRouteCode.mobile);
        if (
          Object.keys(detailRouteCode).some(
            key => !['desktop', 'mobile'].includes(key)
          ) ||
          !OPERATION_CODE_PATTERN.test(desktopCode) ||
          !OPERATION_CODE_PATTERN.test(mobileCode) ||
          desktopCode === mobileCode
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_WORKFLOW_DETAIL_ROUTE_INVALID',
              'detailRouteCode 必须声明两个不同且合法的 desktop/mobile route code',
              `${path}.detailRouteCode`
            )
          );
        } else {
          for (const [device, code, surface] of [
            ['desktop', desktopCode, 'admin'],
            ['mobile', mobileCode, 'user'],
          ] as const) {
            const route = frontendRoutesByCode.get(code);
            const routePointer = `${path}.detailRouteCode.${device}`;
            if (!route) {
              diagnostics.push(
                diagnostic(
                  'APP_CONFIG_WORKFLOW_DETAIL_ROUTE_REFERENCE_MISSING',
                  `detailRouteCode.${device} 必须引用已声明 frontend route`,
                  routePointer
                )
              );
              continue;
            }
            if (string(route.surface) !== surface) {
              diagnostics.push(
                diagnostic(
                  'APP_CONFIG_WORKFLOW_DETAIL_ROUTE_SURFACE_INVALID',
                  `detailRouteCode.${device} 必须引用 ${surface} surface`,
                  routePointer
                )
              );
            }
            const parameters = [
              ...string(route.path).matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g),
            ].map(match => match[1]);
            if (
              string(route.path).includes('*') ||
              parameters.length !== 1 ||
              parameters[0] !== 'instanceId'
            ) {
              diagnostics.push(
                diagnostic(
                  'APP_CONFIG_WORKFLOW_DETAIL_ROUTE_PATH_INVALID',
                  `detailRouteCode.${device} 路由必须且只能声明 :instanceId 动态参数`,
                  routePointer
                )
              );
            }
          }
        }
      }
      if (!Number.isInteger(version) || version < 1) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_VERSION_INVALID',
            'Workflow definition version 必须是正整数',
            `${path}.version`
          )
        );
      }
      if (
        string(object(declaration.definition).title) ===
        string(object(declaration.definition).code)
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_USER_TITLE_REQUIRED',
            'Workflow title 必须是用户可读本地化名称，不能等于内部 code',
            `${path}.definition.title`
          )
        );
      }
      const subject = object(definition.subject);
      const factProjection = object(subject.factProjection);
      const factEntries = Object.entries(factProjection);
      const subjectFields = eventResourceFields.get(
        string(subject.resourceCode)
      );
      const summaryFieldsValue = subject.summaryFields;
      const summaryFields = Array.isArray(summaryFieldsValue)
        ? summaryFieldsValue
        : [];
      const summaryResourceFields = workflowSummaryResourceFields.get(
        string(subject.resourceCode)
      );
      const summaryFieldsInvalid =
        summaryFieldsValue !== undefined &&
        (!Array.isArray(summaryFieldsValue) ||
          summaryFields.length > WORKFLOW_SUMMARY_MAX_FIELDS ||
          new Set(summaryFields).size !== summaryFields.length ||
          summaryFields.some(field => {
            if (
              typeof field !== 'string' ||
              !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(field)
            ) {
              return true;
            }
            const metadata = summaryResourceFields?.get(field);
            return (
              !metadata ||
              metadata.system ||
              !isWorkflowSummaryFieldType(metadata.type) ||
              (metadata.type === 'text.long' &&
                metadata.maxLength !== undefined &&
                metadata.maxLength > WORKFLOW_SUMMARY_TEXT_LONG_MAX_BYTES)
            );
          }));
      if (
        Object.keys(subject).some(
          key => !['resourceCode', 'factProjection', 'summaryFields'].includes(key)
        ) ||
        !subjectFields ||
        !isRecord(subject.factProjection) ||
        factEntries.length < 1 ||
        factEntries.length > 64 ||
        factEntries.some(
          ([factKey, fieldCode]) =>
            !/^[A-Za-z][A-Za-z0-9_.]{0,127}$/.test(factKey) ||
            !/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(string(fieldCode)) ||
            !subjectFields.has(string(fieldCode))
        )
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_SUBJECT_INVALID',
            'Workflow subject 必须绑定已声明资源，并将 1 到 64 个 fact key 映射到该资源的已声明字段',
            `${path}.definition.subject`
          )
        );
      }
      if (summaryFieldsInvalid) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_SUMMARY_FIELDS_INVALID',
            `Workflow summaryFields 最多 ${WORKFLOW_SUMMARY_MAX_FIELDS} 个，必须是不重复的已声明 scalar/reference 字段；禁止 system/rich/json/subtable/file/image/signature，且 text.long 不超过 ${WORKFLOW_SUMMARY_TEXT_LONG_MAX_BYTES} bytes`,
            `${path}.definition.subject.summaryFields`
          )
        );
      }
      for (const error of validateWorkflowDefinition(definition)) {
        diagnostics.push(
          diagnostic('APP_CONFIG_WORKFLOW_DEFINITION_INVALID', error, path)
        );
      }
      const policyResource = object((Array.isArray(data.resources) ? data.resources : []).find(
        resource => object(resource).code === definition.subject?.resourceCode
      ));
      const policyFields = object(policyResource.schema).fields;
      for (const error of validateWorkflowInstanceCommandPolicies(definition, {
        appCode,
        capabilities: declaredCapabilities.map(item => string(object(item).code)),
        fields: new Map((Array.isArray(policyFields) ? policyFields : []).map(raw => {
          const field = object(raw);
          return [string(field.code), { type: string(field.type), nullable: field.nullable === true }];
        })),
      })) {
        diagnostics.push(diagnostic('APP_CONFIG_WORKFLOW_INSTANCE_COMMAND_POLICY_INVALID', error, `${path}.definition.instanceCommands`));
      }
      const key = `${definition.code}:${version}`;
      if (definitionByKey.has(key)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_DEFINITION_DUPLICATE',
            `Workflow definition 重复: ${key}`,
            path
          )
        );
      }
      definitionByKey.set(key, definition);
    });
    bindings.forEach((item, index) => {
      const declaration = object(item);
      const binding = object(declaration.binding) as unknown as WorkflowBinding;
      const version = Number(declaration.version);
      const path = `workflows.bindings[${index}]`;
      if (!Number.isInteger(version) || version < 1) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_VERSION_INVALID',
            'Workflow binding version 必须是正整数',
            `${path}.version`
          )
        );
      }
      const key = `${binding.workflowCode}:${version}`;
      if (bindingByKey.has(key)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_BINDING_DUPLICATE',
            `Workflow binding 重复: ${key}`,
            path
          )
        );
      }
      bindingByKey.set(key, binding);
    });
    const activationWorkflowCodes = new Set<string>();
    activations.forEach((item, index) => {
      const activation = object(item);
      const path = `workflows.activations[${index}]`;
      if (
        Object.keys(activation).some(
          key =>
            ![
              'workflowCode',
              'definitionVersion',
              'bindingVersion',
              'acceptedCommandDeactivationPolicy',
            ].includes(key)
        )
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_ACTIVATION_INVALID',
            'Workflow activation 只能声明固定版本与停用策略',
            path
          )
        );
      }
      const workflowCode = string(activation.workflowCode);
      if (activationWorkflowCodes.has(workflowCode)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_ACTIVATION_DUPLICATE',
            `Workflow activation 重复: ${workflowCode}`,
            path
          )
        );
      }
      activationWorkflowCodes.add(workflowCode);
      if ('environmentKey' in activation) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_ENVIRONMENT_OVERRIDE_FORBIDDEN',
            'Workflow activation 属于环境中立 AppVersion，不能声明 environmentKey',
            `${path}.environmentKey`
          )
        );
      }
      const definitionVersion = Number(activation.definitionVersion);
      const bindingVersion = Number(activation.bindingVersion);
      const definition = definitionByKey.get(`${workflowCode}:${definitionVersion}`);
      const binding = bindingByKey.get(`${workflowCode}:${bindingVersion}`);
      if (!definition || !binding) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_ACTIVATION_VERSION_NOT_FOUND',
            'Workflow activation 引用的 definition 或 binding 版本不存在',
            path
          )
        );
        return;
      }
      if (
        activation.acceptedCommandDeactivationPolicy !==
        definition.acceptedCommandDeactivationPolicy
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_ACTIVATION_DEACTIVATION_POLICY_MISMATCH',
            'Workflow activation 停用策略必须等于所选 definition',
            `${path}.acceptedCommandDeactivationPolicy`
          )
        );
      }
      for (const error of validateWorkflowBinding(definition, binding)) {
        diagnostics.push(
          diagnostic('APP_CONFIG_WORKFLOW_BINDING_INVALID', error, path)
        );
      }
      for (const entry of Object.values(binding.bindings || {})) {
        if (
          entry.provider === 'application_provider' &&
          !providerKeys.has(entry.providerCode || '')
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_WORKFLOW_PROVIDER_NOT_FOUND',
              `Workflow binding 引用了未声明的 App Provider: ${
                entry.providerCode || ''
              }`,
              path
            )
          );
        }
      }
    });
    editableParameters.forEach((item, index) => {
      const parameter = object(item);
      const workflowCode = string(parameter.workflowCode);
      const bindingKey = string(parameter.bindingKey);
      const active = activations.find(
        item => string(object(item).workflowCode) === workflowCode
      );
      const binding = active
        ? bindingByKey.get(
            `${workflowCode}:${Number(object(active).bindingVersion)}`
          )
        : undefined;
      if (!binding || !binding.bindings[bindingKey]) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_WORKFLOW_EDITABLE_PARAMETER_BINDING_NOT_FOUND',
            'Workflow editable parameter 必须引用活动版本中的 binding key',
            `workflows.editableParameters[${index}]`
          )
        );
      }
      for (const roleCode of Array.isArray(parameter.allowedRoleCodes)
        ? parameter.allowedRoleCodes.map(string)
        : []) {
        if (!new Set((Array.isArray(authz.roles) ? authz.roles : []).map(item => string(object(item).code))).has(roleCode)) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_WORKFLOW_EDITABLE_PARAMETER_ROLE_NOT_FOUND',
              `editable parameter 引用了未声明 role: ${roleCode}`,
              `workflows.editableParameters[${index}].allowedRoleCodes`
            )
          );
        }
      }
      for (const providerCode of Array.isArray(parameter.allowedProviderCodes)
        ? parameter.allowedProviderCodes.map(string)
        : []) {
        if (!providerKeys.has(providerCode)) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_WORKFLOW_EDITABLE_PARAMETER_PROVIDER_NOT_FOUND',
              `editable parameter 引用了未声明 provider: ${providerCode}`,
              `workflows.editableParameters[${index}].allowedProviderCodes`
            )
          );
        }
      }
    });
  }
  return diagnostics;
}

function validatePerspectives(
  rawPerspectives: unknown,
  rawRoles: unknown,
  diagnostics: Diagnostic[]
) {
  if (rawPerspectives !== undefined && !Array.isArray(rawPerspectives)) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_PERSPECTIVES_INVALID',
        'perspectives 必须是数组',
        'perspectives'
      )
    );
    return;
  }
  const roleCodes = new Set(
    (Array.isArray(rawRoles) ? rawRoles : []).map(role =>
      string(object(role).code)
    )
  );
  const codes = new Set<string>();
  let defaults = 0;
  (Array.isArray(rawPerspectives) ? rawPerspectives : []).forEach(
    (raw, index) => {
      const perspective = object(raw);
      const path = `perspectives[${index}]`;
      const code = string(perspective.code);
      const basis = Array.isArray(perspective.roleCodes)
        ? perspective.roleCodes.map(string)
        : [];
      if (
        !/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(code) ||
        codes.has(code) ||
        !string(perspective.name) ||
        basis.length < 1 ||
        basis.length > 20 ||
        new Set(basis).size !== basis.length ||
        basis.some(roleCode => !roleCodes.has(roleCode)) ||
        Object.keys(perspective).some(
          key =>
            !['code', 'name', 'description', 'roleCodes', 'default'].includes(
              key
            )
        ) ||
        (perspective.default !== undefined &&
          typeof perspective.default !== 'boolean')
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_PERSPECTIVE_INVALID',
            'Perspective 必须声明唯一 code/name，并引用 1 到 20 个已声明角色',
            path
          )
        );
      }
      if (perspective.default === true) defaults += 1;
      codes.add(code);
    }
  );
  if (defaults > 1) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_PERSPECTIVE_DEFAULT_DUPLICATE',
        '最多只能声明一个默认 Perspective',
        'perspectives'
      )
    );
  }
}

const CAPABILITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._*-]{0,254}$/;
const OPERATION_CODE_PATTERN = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/;
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const RESERVED_NATIVE_KEYS = new Map([
  ['environmentKey', 'environmentKey'],
  ['environmentId', 'environmentId'],
  ['secretValue', 'Secret value'],
  ['ciphertext', 'Secret ciphertext'],
  ['oauthClient', 'OAuth client'],
  ['oauthClientId', 'OAuth client'],
  ['oauthClientSecret', 'OAuth client Secret'],
  ['signingSecret', 'signing Secret'],
  ['kubernetesNamespace', 'Kubernetes namespace'],
  ['nodePort', 'Kubernetes NodePort'],
  ['productionUrl', 'production URL'],
]);

function rejectNativeEnvironmentFields(
  value: unknown,
  diagnostics: Diagnostic[],
  path = '$',
  seen = new Set<object>()
) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      rejectNativeEnvironmentFields(item, diagnostics, `${path}[${index}]`, seen)
    );
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const reserved = RESERVED_NATIVE_KEYS.get(key);
    if (reserved) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_NATIVE_RUNTIME_FIELD_FORBIDDEN',
          `${reserved} 属于环境运行态，不能进入环境中立 AppVersion`,
          path === '$' ? key : `${path}.${key}`
        )
      );
      continue;
    }
    rejectNativeEnvironmentFields(
      child,
      diagnostics,
      path === '$' ? key : `${path}.${key}`,
      seen
    );
  }
}

function validateCapabilityDeclarations(
  appCode: string,
  declarations: unknown[],
  diagnostics: Diagnostic[]
) {
  const seen = new Set<string>();
  declarations.forEach((raw, index) => {
    const capability = object(raw);
    const code = string(capability.code);
    const path = `authz.capabilities[${index}]`;
    if (
      !CAPABILITY_PATTERN.test(code) ||
      !code.startsWith(`app:${appCode}:`) ||
      seen.has(code) ||
      !['backend', 'ui'].includes(string(capability.kind)) ||
      !string(capability.name)
    ) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHZ_CAPABILITY_DECLARATION_INVALID',
          '显式 capability 必须属于当前应用、code 唯一，并声明 backend/ui kind 与 name',
          path
        )
      );
    }
    if (platformCapabilityCodes(appCode).has(code)) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHZ_PLATFORM_CAPABILITY_RESERVED',
          '平台 capability 由平台保留 catalog 提供，应用不能重复声明',
          `${path}.code`
        )
      );
    }
    seen.add(code);
  });
}

function validateBackendOperations(
  rawOperations: unknown,
  declaredResources: Map<string, Map<string, string>>,
  declaredWorkflowCodes: Set<string>,
  declaredRoleCodes: Set<string>,
  diagnostics: Diagnostic[]
) {
  const declaredResourceCodes = new Set(declaredResources.keys());
  if (rawOperations !== undefined && !Array.isArray(rawOperations)) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_BACKEND_OPERATIONS_INVALID',
        'backend.operations 必须是数组',
        'backend.operations'
      )
    );
    return;
  }
  const codes = new Set<string>();
  const routes = new Set<string>();
  (Array.isArray(rawOperations) ? rawOperations : []).forEach((raw, index) => {
    const operation = object(raw);
    const code = string(operation.code);
    const method = string(operation.method).toUpperCase();
    const route = string(operation.path);
    const path = `backend.operations[${index}]`;
    const routeKey = `${method} ${route}`;
    if (
      !OPERATION_CODE_PATTERN.test(code) ||
      codes.has(code) ||
      !HTTP_METHODS.has(method) ||
      !validAppPath(route) ||
      route.startsWith('/__platform/') ||
      routes.has(routeKey) ||
      !CAPABILITY_PATTERN.test(string(operation.capability)) ||
      !isRecord(operation.requestSchema) ||
      !isRecord(operation.responseSchema)
    ) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_BACKEND_OPERATION_INVALID',
          'App API operation 必须声明唯一 code/route、静态 HTTP path、capability 与请求响应 JSON Schema',
          path
        )
      );
    }
    if ('resources' in operation) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_BACKEND_OPERATION_RESOURCES_REMOVED',
          '资源范围只能在显式 backend.operations[].ai 中声明',
          `${path}.resources`
        )
      );
    }
    if (operation.platformAccess !== undefined) {
      const access = object(operation.platformAccess);
      const allowedAccessKeys = new Set([
        'directory',
        'managedFiles',
        'managedFileCopies',
        'notification',
        'workflow',
        'roleAssertions',
      ]);
      let invalid =
        !isRecord(operation.platformAccess) ||
        Object.keys(access).length === 0 ||
        Object.keys(access).some(key => !allowedAccessKeys.has(key));
      if (access.roleAssertions !== undefined) {
        const assertion = object(access.roleAssertions);
        const roles = Array.isArray(assertion.roleCodes) ? assertion.roleCodes : [];
        invalid ||= !isRecord(access.roleAssertions) || roles.length < 1 || roles.length > 20 ||
          new Set(roles).size !== roles.length || roles.some(role => !declaredRoleCodes.has(string(role))) ||
          Object.keys(assertion).some(key => key !== 'roleCodes');
      }
      if (access.directory !== undefined) {
        const directory = object(access.directory);
        const fields = Array.isArray(directory.fields) ? directory.fields : [];
        const allowedFields = new Set([
          'displayName',
          'employeeNumber',
          'primaryDepartment',
          'departments',
        ]);
        invalid ||=
          directory.mode !== 'current-initiator' ||
          fields.length === 0 ||
          fields.length > allowedFields.size ||
          new Set(fields).size !== fields.length ||
          fields.some(field => !allowedFields.has(string(field))) ||
          Object.keys(directory).some(
            key => !['mode', 'fields'].includes(key)
          );
      }
      if (access.managedFiles !== undefined) {
        const managedFiles = Array.isArray(access.managedFiles)
          ? access.managedFiles
          : [];
        invalid ||= managedFiles.length === 0 || managedFiles.length > 16;
        const resources = new Set<string>();
        for (const rawManagedFile of managedFiles) {
          const managedFile = object(rawManagedFile);
          const resourceCode = string(managedFile.resourceCode);
          const fieldCodes = Array.isArray(managedFile.fieldCodes)
            ? managedFile.fieldCodes.map(string)
            : [];
          const intents = Array.isArray(managedFile.intents)
            ? managedFile.intents.map(string)
            : [];
          const resourceFields = declaredResources.get(resourceCode);
          invalid ||=
            !resourceFields ||
            resources.has(resourceCode) ||
            fieldCodes.length === 0 ||
            fieldCodes.length > 16 ||
            new Set(fieldCodes).size !== fieldCodes.length ||
            fieldCodes.some(
              fieldCode =>
                !['file', 'image', 'signature'].includes(
                  string(resourceFields?.get(fieldCode))
                )
            ) ||
            intents.length === 0 ||
            intents.length > 2 ||
            new Set(intents).size !== intents.length ||
            intents.some(intent => !['create', 'update'].includes(intent)) ||
            Object.keys(managedFile).some(
              key => !['resourceCode', 'fieldCodes', 'intents'].includes(key)
            );
          resources.add(resourceCode);
        }
      }
      if (access.managedFileCopies !== undefined) {
        const copies = Array.isArray(access.managedFileCopies)
          ? access.managedFileCopies
          : [];
        invalid ||= copies.length === 0 || copies.length > 16;
        const copyKeys = new Set<string>();
        for (const rawCopy of copies) {
          const copy = object(rawCopy);
          const sourceResourceCode = string(copy.sourceResourceCode);
          const targetResourceCode = string(copy.targetResourceCode);
          const sourceFields = Array.isArray(copy.sourceFieldCodes)
            ? copy.sourceFieldCodes.map(string)
            : [];
          const targetFields = Array.isArray(copy.targetFieldCodes)
            ? copy.targetFieldCodes.map(string)
            : [];
          const source = declaredResources.get(sourceResourceCode);
          const target = declaredResources.get(targetResourceCode);
          invalid ||=
            copy.mode !== 'copy' ||
            !source ||
            !target ||
            sourceFields.length === 0 ||
            targetFields.length === 0 ||
            sourceFields.length > 16 ||
            targetFields.length > 16 ||
            new Set(sourceFields).size !== sourceFields.length ||
            new Set(targetFields).size !== targetFields.length ||
            sourceFields.some(field => !['file', 'image'].includes(source?.get(field) || '')) ||
            targetFields.some(field => !['file', 'image'].includes(target?.get(field) || '')) ||
            sourceFields.length !== targetFields.length ||
            sourceFields.some((field, i) => source?.get(field) !== target?.get(targetFields[i] || '')) ||
            Object.keys(copy).some(key => ![
              'mode',
              'sourceResourceCode',
              'sourceFieldCodes',
              'targetResourceCode',
              'targetFieldCodes',
            ].includes(key));
          const key = `${sourceResourceCode}:${sourceFields.join(',')}=>${targetResourceCode}:${targetFields.join(',')}`;
          if (copyKeys.has(key)) invalid = true;
          copyKeys.add(key);
        }
      }
      if (access.notification !== undefined) {
        const notification = object(access.notification);
        invalid ||=
          notification.mode !== 'business-standard' ||
          Object.keys(notification).some(key => key !== 'mode');
      }
      if (access.workflow !== undefined) {
        const workflow = object(access.workflow);
        const workflowCodes = Array.isArray(workflow.codes)
          ? workflow.codes.map(string)
          : [];
        invalid ||=
          workflowCodes.length === 0 ||
          workflowCodes.length > 16 ||
          new Set(workflowCodes).size !== workflowCodes.length ||
          workflowCodes.some(code => !declaredWorkflowCodes.has(code)) ||
          Object.keys(workflow).some(key => key !== 'codes');
      }
      if (invalid) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_BACKEND_OPERATION_PLATFORM_ACCESS_INVALID',
            'operation.platformAccess 必须只声明有界的发起人目录、托管文件、托管文件复制、标准通知、现有工作流或已声明角色条件依赖',
            `${path}.platformAccess`
          )
        );
      }
    }
    if (operation.ai !== undefined) {
      const ai = object(operation.ai);
      const aiResources = Array.isArray(ai.resources) ? ai.resources : [];
      const sideEffects = Array.isArray(ai.sideEffects)
        ? ai.sideEffects
        : [];
      const risk = string(ai.risk);
      const aiKeys = Object.keys(ai);
      const allowedAiKeys = new Set([
        'name',
        'description',
        'risk',
        'resources',
        'sideEffects',
        'concurrency',
        'timeoutMs',
      ]);
      if (
        !/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/.test(code) ||
        !string(ai.name) ||
        !string(ai.description) ||
        !['read', 'write', 'destructive', 'external'].includes(risk) ||
        (risk === 'read') !== (method === 'GET') ||
        (method === 'DELETE' && !['destructive', 'external'].includes(risk)) ||
        aiResources.length < 1 ||
        aiResources.length > 16 ||
        new Set(aiResources).size !== aiResources.length ||
        aiResources.some(
          item =>
            !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(String(item)) ||
            !declaredResourceCodes.has(String(item))
        ) ||
        sideEffects.length > 20 ||
        new Set(sideEffects).size !== sideEffects.length ||
        sideEffects.some(item => !string(item)) ||
        (risk === 'read' ? sideEffects.length !== 0 : sideEffects.length < 1) ||
        (ai.concurrency !== undefined &&
          !['none', 'revision'].includes(string(ai.concurrency))) ||
        (ai.timeoutMs !== undefined &&
          (!Number.isSafeInteger(ai.timeoutMs) ||
            Number(ai.timeoutMs) < 100 ||
            Number(ai.timeoutMs) > 30000)) ||
        aiKeys.some(key => !allowedAiKeys.has(key))
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_BACKEND_OPERATION_AI_INVALID',
            'AI 操作必须显式声明名称、说明、风险、现有资源、副作用和有界执行策略；GET 只能只读，写操作必须确认',
            `${path}.ai`
          )
        );
      }
    }
    codes.add(code);
    routes.add(routeKey);
  });
}

type FrontendRouteClaim = {
  owner: string;
  path: string;
};

function canonicalFrontendRouteShape(path: string) {
  const normalized = path.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
  return normalized
    .split('/')
    .map(segment =>
      segment.startsWith(':') ? ':' : segment.includes('*') ? '*' : segment
    )
    .join('/');
}

function generatedPlatformRouteClaims(
  config: Record<string, unknown>
): FrontendRouteClaim[] {
  const claims: FrontendRouteClaim[] = [
    { owner: 'platform:admin-entry', path: '/' },
    { owner: 'platform:admin-entry', path: '/admin' },
    {
      owner: 'platform:file-preview',
      path: '/files/:resourceCode/:fileId/preview',
    },
  ];
  const data = object(config.data);
  const resources = Array.isArray(data.resources) ? data.resources : [];
  for (const rawResource of resources) {
    const resource = object(rawResource);
    const code = string(resource.code);
    if (!code) continue;
    const resourceSurface = object(resource.surface);
    for (const selected of [resourceSurface, ...(Array.isArray(resourceSurface.views) ? resourceSurface.views.map(object) : [])]) {
    const surface = { ...resourceSurface, ...selected };
    const viewCode = string(selected.code);
    const generated = object(surface.generated);
    const native = !surface.mutationOwner || surface.mutationOwner === 'native';
    const operations = {
      list: generated.list === undefined ? true : generated.list === true,
      detail: generated.detail === undefined ? true : generated.detail === true,
      create:
        generated.create === undefined ? native : generated.create === true,
      update:
        generated.update === undefined ? native : generated.update === true,
    };
    const base = `/admin/resources/${code}${viewCode ? `/views/${viewCode}` : ""}`;
    const candidates = [
      ['list', base],
      ['detail', `${base}/:id`],
      ['create', `${base}/new`],
      ['update', `${base}/:id/edit`],
    ] as const;
    for (const [operation, path] of candidates) {
      if (!operations[operation]) continue;
      const owner = `resource:${code}${viewCode ? `:view:${viewCode}` : ''}:${operation}`;
      claims.push({ owner, path });
      if (object(surface.mobile).enabled !== false)
        claims.push({ owner: `${owner}:mobile`, path: `/m${path}` });
    }
    }
  }
  const frontend = object(config.frontend);
  const user = object(frontend.user);
  const hasTodoCenter = user.applicationTodoCenter === true;
  if (hasTodoCenter) {
    claims.push(
      { owner: 'application:todo-center', path: '/todos' },
      { owner: 'application:todo-center:mobile', path: '/m/todos' }
    );
  }
  const workflows = object(config.workflows);
  const definitions = Array.isArray(workflows.definitions)
    ? workflows.definitions
    : [];
  if (definitions.length > 0) {
    claims.push(
      { owner: 'workflow:work-center', path: '/work-center' },
      { owner: 'workflow:work-center:mobile', path: '/m/work-center' },
      { owner: 'workflow:task', path: '/tasks/:taskId' },
      { owner: 'workflow:task:mobile', path: '/m/tasks/:taskId' },
      { owner: 'workflow:instance', path: '/workflows/:instanceId' },
      {
        owner: 'workflow:instance:mobile',
        path: '/m/workflows/:instanceId',
      }
    );
    const launchCodes = new Set<string>();
    for (const rawDefinition of definitions) {
      const declaration = object(rawDefinition);
      if (
        !['standalone', 'hidden-handoff'].includes(
          string(object(declaration.launch).mode)
        )
      )
        continue;
      const workflowCode = string(object(declaration.definition).code);
      if (workflowCode) launchCodes.add(workflowCode);
    }
    for (const workflowCode of launchCodes) {
      claims.push({
        owner: `workflow:${workflowCode}:launch`,
        path: '/workflows/:workflowCode/start',
      });
    }
    if (launchCodes.size > 0) {
      claims.push({
        owner: 'workflow:launch:mobile',
        path: '/m/workflows/:workflowCode/start',
      });
    }
  }
  return claims;
}

function validateFrontendDevicePolicy(
  config: Record<string, unknown>,
  diagnostics: Diagnostic[]
) {
  const frontend = object(config.frontend);
  if (frontend.devicePolicy === undefined) return;
  const policy = object(frontend.devicePolicy);
  const mobileMaxWidthPx = policy.mobileMaxWidthPx;
  const desktopMinWidthPx = policy.desktopMinWidthPx;
  const invalid =
    Object.keys(policy).some(
      key => !['kind', 'mobileMaxWidthPx', 'desktopMinWidthPx'].includes(key)
    ) ||
    policy.kind !== 'viewport-family' ||
    !Number.isInteger(mobileMaxWidthPx) ||
    !Number.isInteger(desktopMinWidthPx) ||
    Number(mobileMaxWidthPx) < 320 ||
    Number(mobileMaxWidthPx) > 1600 ||
    Number(desktopMinWidthPx) < 320 ||
    Number(desktopMinWidthPx) > 1600 ||
    Number(desktopMinWidthPx) !== Number(mobileMaxWidthPx) + 1;
  if (invalid) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_FRONTEND_DEVICE_POLICY_INVALID',
        'frontend.devicePolicy 必须是 viewport-family，移动最大宽度和桌面最小宽度为 320-1600 的相邻整数',
        'frontend.devicePolicy'
      )
    );
  }
}

function validateResourceDetailRoutes(
  config: Record<string, unknown>,
  diagnostics: Diagnostic[]
) {
  const frontend = object(config.frontend);
  const routesByCode = new Map<string, Record<string, unknown>>(
    (Array.isArray(frontend.routes) ? frontend.routes : []).map(rawRoute => {
      const route = object(rawRoute);
      return [string(route.code), route] as const;
    })
  );
  const data = object(config.data);
  const resources = Array.isArray(data.resources) ? data.resources : [];
  resources.forEach((rawResource, resourceIndex) => {
    const resource = object(rawResource);
    if (resource.detailRouteCode === undefined) return;
    const path = `data.resources[${resourceIndex}].detailRouteCode`;
    const detailRouteCode = object(resource.detailRouteCode);
    const desktopCode = string(detailRouteCode.desktop);
    const mobileCode = string(detailRouteCode.mobile);
    if (
      Object.keys(detailRouteCode).some(
        key => !['desktop', 'mobile'].includes(key)
      ) ||
      !OPERATION_CODE_PATTERN.test(desktopCode) ||
      !OPERATION_CODE_PATTERN.test(mobileCode) ||
      desktopCode === mobileCode
    ) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_DATA_RESOURCE_DETAIL_ROUTE_INVALID',
          'detailRouteCode 必须声明两个不同且合法的 desktop/mobile route code',
          path
        )
      );
      return;
    }
    const readCapability = string(object(resource.capabilities).read);
    for (const [device, code] of [
      ['desktop', desktopCode],
      ['mobile', mobileCode],
    ] as const) {
      const route = routesByCode.get(code);
      const routePointer = `${path}.${device}`;
      if (!route) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_RESOURCE_DETAIL_ROUTE_REFERENCE_MISSING',
            `detailRouteCode.${device} 必须引用已声明 frontend route`,
            routePointer
          )
        );
        continue;
      }
      if (string(route.surface) !== 'user') {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_RESOURCE_DETAIL_ROUTE_SURFACE_INVALID',
            `detailRouteCode.${device} 必须引用 user surface`,
            routePointer
          )
        );
      }
      const routePath = string(route.path);
      const parameters = [
        ...routePath.matchAll(/:([A-Za-z][A-Za-z0-9_]*)/g),
      ].map(match => match[1]);
      const wrongDeviceFamily =
        device === 'mobile'
          ? !routePath.startsWith('/m/')
          : routePath === '/m' || routePath.startsWith('/m/');
      if (
        routePath.includes('*') ||
        routePath.includes('?') ||
        routePath.includes('#') ||
        routePath.split('/').includes('..') ||
        parameters.length !== 1 ||
        wrongDeviceFamily
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_RESOURCE_DETAIL_ROUTE_PATH_INVALID',
            `detailRouteCode.${device} 路由必须属于对应端且只能声明一个有界动态记录参数`,
            routePointer
          )
        );
      }
      const access = object(route.access);
      const allOf = Array.isArray(access.allOf) ? access.allOf.map(string) : [];
      if (
        !readCapability ||
        (string(route.capability) !== readCapability &&
          !allOf.includes(readCapability))
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_RESOURCE_DETAIL_ROUTE_CAPABILITY_INVALID',
            `detailRouteCode.${device} 路由必须要求当前资源的 read capability`,
            routePointer
          )
        );
      }
    }
  });
}

function validateFrontendRoutes(
  config: Record<string, unknown>,
  diagnostics: Diagnostic[]
) {
  const frontend = object(config.frontend);
  const rawRoutes = frontend.routes;
  if (rawRoutes !== undefined && !Array.isArray(rawRoutes)) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_FRONTEND_ROUTES_INVALID',
        'frontend.routes 必须是数组',
        'frontend.routes'
      )
    );
    return;
  }
  const routes = Array.isArray(rawRoutes) ? rawRoutes : [];
  const codes = new Set<string>();
  const pathClaims = new Map<string, FrontendRouteClaim>();
  for (const claim of generatedPlatformRouteClaims(config)) {
    pathClaims.set(canonicalFrontendRouteShape(claim.path), claim);
  }
  const authentication = object(frontend.authentication);
  const authenticationSurfaces = object(authentication.surfaces);
  for (const device of ['desktop', 'mobile'] as const) {
    const surface = object(authenticationSurfaces[device]);
    const surfacePath = string(surface.path);
    if (surfacePath) {
      pathClaims.set(canonicalFrontendRouteShape(surfacePath), {
        owner: `authentication:${device}`,
        path: surfacePath,
      });
    }
  }
  routes.forEach((raw, index) => {
    const route = object(raw);
    const code = string(route.code);
    const routePath = string(route.path);
    const path = `frontend.routes[${index}]`;
    const access = object(route.access);
    const allowedKeys = new Set([
      'code',
      'path',
      'label',
      'surface',
      'parentCode',
      'capability',
      'access',
      'pinned',
      'tabPersistence',
      'keepAlive',
    ]);
    const accessKeys = Object.keys(access);
    const allOf = Array.isArray(access.allOf) ? access.allOf : [];
    const anyOf = Array.isArray(access.anyOf) ? access.anyOf : [];
    const accessInvalid =
      route.access !== undefined &&
      (route.capability !== undefined ||
        !route.access ||
        typeof route.access !== 'object' ||
        Array.isArray(route.access) ||
        accessKeys.some(key => !['allOf', 'anyOf'].includes(key)) ||
        (allOf.length === 0 && anyOf.length === 0) ||
        allOf.length > 50 ||
        anyOf.length > 50 ||
        allOf.some(value => !CAPABILITY_PATTERN.test(string(value))) ||
        anyOf.some(value => !CAPABILITY_PATTERN.test(string(value))) ||
        new Set(allOf.map(string)).size !== allOf.length ||
        new Set(anyOf.map(string)).size !== anyOf.length);
    const dynamicRoute = /[:*]/.test(routePath);
    const routePolicyInvalid =
      Object.keys(route).some(key => !allowedKeys.has(key)) ||
      (route.pinned !== undefined && typeof route.pinned !== 'boolean') ||
      (route.tabPersistence !== undefined &&
        !['session', 'none'].includes(string(route.tabPersistence))) ||
      (route.keepAlive !== undefined &&
        !['none', 'memory'].includes(string(route.keepAlive))) ||
      (dynamicRoute && route.pinned === true) ||
      (dynamicRoute && route.tabPersistence === 'session') ||
      (dynamicRoute && route.keepAlive === 'memory');
    if (
      !OPERATION_CODE_PATTERN.test(code) ||
      codes.has(code) ||
      !validAppPath(routePath) ||
      !string(route.label) ||
      !['admin', 'user'].includes(string(route.surface)) ||
      (route.surface === 'admin' &&
        routePath !== '/admin' &&
        !routePath.startsWith('/admin/') &&
        routePath !== '/m/admin' &&
        !routePath.startsWith('/m/admin/')) ||
      (route.surface === 'user' &&
        (routePath === '/admin' ||
          routePath.startsWith('/admin/') ||
          routePath === '/m/admin' ||
          routePath.startsWith('/m/admin/'))) ||
      (route.capability !== undefined &&
        !CAPABILITY_PATTERN.test(string(route.capability))) ||
      accessInvalid ||
      routePolicyInvalid
    ) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_FRONTEND_ROUTE_INVALID',
          '前端 route 必须声明唯一 code/path、label、surface、有效访问表达式和有界标签策略；动态 route 不能固定、恢复或保活',
          path
        )
      );
    }
    const shape = canonicalFrontendRouteShape(routePath);
    const existing = pathClaims.get(shape);
    if (routePath && existing) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_FRONTEND_ROUTE_PATH_CONFLICT',
          `前端 route path 与 ${existing.owner} 冲突: ${routePath}`,
          `${path}.path`
        )
      );
    } else if (routePath) {
      pathClaims.set(shape, {
        owner: `frontend:${code || index}`,
        path: routePath,
      });
    }
    codes.add(code);
  });
  const parentByCode = new Map<string, string>();
  routes.forEach((raw, index) => {
    const route = object(raw);
    const code = string(route.code);
    const parentCode = string(route.parentCode);
    if (parentCode) {
      parentByCode.set(code, parentCode);
      if (!codes.has(parentCode) || parentCode === code) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_FRONTEND_ROUTE_PARENT_INVALID',
            'parentCode 必须引用另一个已声明 route',
            `frontend.routes[${index}].parentCode`
          )
        );
      }
    }
  });
  for (const code of codes) {
    const visited = new Set<string>();
    let current: string | undefined = code;
    while (current && parentByCode.has(current)) {
      if (visited.has(current)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_FRONTEND_ROUTE_CYCLE',
            `route parentCode 形成循环: ${code}`,
            'frontend.routes'
          )
        );
        break;
      }
      visited.add(current);
      current = parentByCode.get(current);
    }
  }
}

const ANONYMOUS_PUBLIC_OPERATIONS = new Set([
  'draft.read',
  'draft.update',
  'validate',
  'create',
  'own.list',
  'own.read',
]);

function validateAnonymousPublicAccess(
  config: Record<string, unknown>,
  diagnostics: Diagnostic[]
) {
  const frontend = object(config.frontend);
  if (frontend.publicAccess === undefined) return;
  const publicAccess = object(frontend.publicAccess);
  const policies = Array.isArray(publicAccess.policies)
    ? publicAccess.policies
    : [];
  if (
    Object.keys(publicAccess).some(key => key !== 'policies') ||
    !Array.isArray(publicAccess.policies) ||
    policies.length < 1 ||
    policies.length > 16
  ) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_ANONYMOUS_PUBLIC_ACCESS_INVALID',
        'frontend.publicAccess 只接受 1 到 16 个 policies',
        'frontend.publicAccess'
      )
    );
    return;
  }
  const routes = new Map(
    (Array.isArray(frontend.routes) ? frontend.routes : []).map(raw => {
      const route = object(raw);
      return [string(route.code), route] as const;
    })
  );
  const resourceMap = new Map<
    string,
    {
      fields: Map<string, string>;
      requiredCreateFields: Set<string>;
      nativeCreate: boolean;
    }
  >(
    (Array.isArray(object(config.data).resources)
      ? (object(config.data).resources as unknown[])
      : []
    ).map(raw => {
      const resource = object(raw);
      const fields: unknown[] = Array.isArray(object(resource.schema).fields)
        ? (object(resource.schema).fields as unknown[])
        : [];
      const fieldMap = new Map(
        fields.map(field => {
          const declaration = object(field);
          return [string(declaration.code), string(declaration.type)] as const;
        })
      );
      const surface = object(resource.surface);
      const surfaceFields = object(surface.fields);
      const requiredCreateFields = new Set(
        fields
          .map(object)
          .filter(field => {
            const type = string(field.type) as DataFieldDefinition['type'];
            const fieldSurface = object(surfaceFields[string(field.code)]);
            return (
              APP_DATA_FIELD_TYPES.has(type) &&
              nativeFieldRequiresCreateInputV2(
                { type, ...(field.nullable === false ? { nullable: false } : {}) },
                { system: fieldSurface.system === true, requiredHint: fieldSurface.requiredHint === true }
              )
            );
          })
          .map(field => string(field.code))
      );
      const generated = object(surface.generated);
      const nativeCreate =
        (string(surface.mutationOwner) || 'native') === 'native' &&
        generated.create !== false;
      return [
        string(resource.code),
        { fields: fieldMap, requiredCreateFields, nativeCreate },
      ] as const;
    })
  );
  const policyCodes = new Set<string>();
  const routeCodes = new Set<string>();
  policies.forEach((raw, index) => {
    const policy = object(raw);
    const path = `frontend.publicAccess.policies[${index}]`;
    const code = string(policy.code);
    const routeCode = string(policy.routeCode);
    const resourceCode = string(policy.resourceCode);
    const route = routes.get(routeCode);
    const resource = resourceMap.get(resourceCode);
    const resourceFields = resource?.fields;
    const operations = Array.isArray(policy.operations)
      ? policy.operations.map(string)
      : [];
    const fields = Array.isArray(policy.fields) ? policy.fields.map(string) : [];
    const requiredFields = Array.isArray(policy.requiredFields)
      ? policy.requiredFields.map(string)
      : [];
    const ownRecordFields = Array.isArray(policy.ownRecordFields)
      ? policy.ownRecordFields.map(string)
      : fields;
    const draft = object(policy.draft);
    const validations = Array.isArray(policy.validations)
      ? policy.validations
      : [];
    const exactRootKeys = [
      'code',
      'routeCode',
      'mode',
      'resourceCode',
      'operations',
      'fields',
      'requiredFields',
      'ownRecordFields',
      'draft',
      'validations',
    ];
    const invalid =
      Object.keys(policy).some(key => !exactRootKeys.includes(key)) ||
      !OPERATION_CODE_PATTERN.test(code) ||
      policyCodes.has(code) ||
      routeCodes.has(routeCode) ||
      policy.mode !== 'anonymous' ||
      !route ||
      route.surface !== 'user' ||
      route.capability !== undefined ||
      route.access !== undefined ||
      /[:*]/.test(string(route.path)) ||
      !resourceFields ||
      operations.length < 1 ||
      operations.length > ANONYMOUS_PUBLIC_OPERATIONS.size ||
      new Set(operations).size !== operations.length ||
      operations.some(operation => !ANONYMOUS_PUBLIC_OPERATIONS.has(operation)) ||
      fields.length < 1 ||
      fields.length > 64 ||
      new Set(fields).size !== fields.length ||
      fields.some(field => !resourceFields?.has(field)) ||
      new Set(requiredFields).size !== requiredFields.length ||
      requiredFields.some(field => !fields.includes(field)) ||
      (operations.includes('create') && !resource?.nativeCreate) ||
      new Set(ownRecordFields).size !== ownRecordFields.length ||
      ownRecordFields.some(field => !fields.includes(field)) ||
      (operations.includes('draft.read') !== operations.includes('draft.update')) ||
      (operations.some(operation => operation.startsWith('draft.')) &&
        (policy.draft === undefined || draft.enabled !== true)) ||
      (policy.draft !== undefined &&
        (Object.keys(draft).some(
          key => !['enabled', 'inactivityTtlSeconds', 'maxBytes'].includes(key)
        ) ||
          draft.enabled !== true ||
          (draft.inactivityTtlSeconds !== undefined &&
            (!Number.isSafeInteger(draft.inactivityTtlSeconds) ||
              Number(draft.inactivityTtlSeconds) < 3600 ||
              Number(draft.inactivityTtlSeconds) > 7_776_000)) ||
          (draft.maxBytes !== undefined &&
            (!Number.isSafeInteger(draft.maxBytes) ||
              Number(draft.maxBytes) < 4096 ||
              Number(draft.maxBytes) > 262_144)))) ||
      validations.length > 16;
    if (invalid) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_ANONYMOUS_PUBLIC_POLICY_INVALID',
          '匿名公开策略必须绑定唯一静态 user route、已声明资源/字段和有界操作',
          path
        )
      );
    }
    if (operations.includes('create') && resource?.nativeCreate) {
      const missingFields = [...resource.requiredCreateFields].filter(field => !fields.includes(field));
      const missingRequired = [...resource.requiredCreateFields].filter(field => !requiredFields.includes(field));
      if (missingFields.length || missingRequired.length) {
        diagnostics.push(diagnostic(
          'APP_CONFIG_ANONYMOUS_CREATE_FIELDS_INCOMPLETE',
          `公开创建必须覆盖资源 ${resourceCode} 的必填字段：${[...new Set([...missingFields, ...missingRequired])].join('、')}`,
          `${path}.${missingFields.length ? 'fields' : 'requiredFields'}`
        ));
      }
    }
    const validationCodes = new Set<string>();
    validations.forEach((rawValidation, validationIndex) => {
      const validation = object(rawValidation);
      const validationCode = string(validation.code);
      const validationFields = Array.isArray(validation.fields)
        ? validation.fields.map(string)
        : [];
      if (
        Object.keys(validation).some(
          key => !['code', 'kind', 'fields', 'result'].includes(key)
        ) ||
        !OPERATION_CODE_PATTERN.test(validationCode) ||
        validationCodes.has(validationCode) ||
        validation.kind !== 'duplicate' ||
        validation.result !== 'availability' ||
        validationFields.length < 1 ||
        validationFields.length > 8 ||
        new Set(validationFields).size !== validationFields.length ||
        validationFields.some(field => !fields.includes(field)) ||
        validationFields.some(field =>
          ['file', 'subtable'].includes(resourceFields?.get(field) || '')
        )
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_ANONYMOUS_PUBLIC_VALIDATION_INVALID',
            '匿名公开校验必须是只使用已授权字段的有界 duplicate availability 校验',
            `${path}.validations[${validationIndex}]`
          )
        );
      }
      validationCodes.add(validationCode);
    });
    policyCodes.add(code);
    routeCodes.add(routeCode);
  });
}

function validateApplicationAuthentication(
  config: Record<string, unknown>,
  diagnostics: Diagnostic[]
) {
  const frontend = object(config.frontend);
  if (frontend.authentication === undefined) return;
  const authentication = object(frontend.authentication);
  const allowedRootKeys = new Set([
    'accountMode',
    'registration',
    'methods',
    'surfaces',
  ]);
  const registration = object(authentication.registration);
  const surfaces = object(authentication.surfaces);
  const methods = Array.isArray(authentication.methods)
    ? authentication.methods
    : [];
  if (
    !frontend.authentication ||
    typeof frontend.authentication !== 'object' ||
    Array.isArray(frontend.authentication) ||
    Object.keys(authentication).some(key => !allowedRootKeys.has(key)) ||
    authentication.accountMode !== 'existing-platform-users-only' ||
    Object.keys(registration).some(key => key !== 'mode') ||
    registration.mode !== 'reject' ||
    !Array.isArray(authentication.methods) ||
    methods.length < 1 ||
    methods.length > 8 ||
    !authentication.surfaces ||
    typeof authentication.surfaces !== 'object' ||
    Array.isArray(authentication.surfaces) ||
    Object.keys(surfaces).some(key => !['desktop', 'mobile'].includes(key)) ||
    !surfaces.desktop ||
    !surfaces.mobile
  ) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_AUTHENTICATION_INVALID',
        'frontend.authentication 只支持现有平台用户、拒绝注册、1-8 个方法和独立 desktop/mobile surface',
        'frontend.authentication'
      )
    );
  }

  const methodCodes = new Set<string>();
  const methodTypes = new Set<string>();
  let primaryCount = 0;
  methods.forEach((raw, index) => {
    const method = object(raw);
    const type = string(method.type);
    const code = string(method.code);
    const commonKeys = ['code', 'type', 'label', 'presentation', 'required'];
    const allowedKeys = new Set(
      type === 'sso'
        ? [...commonKeys, 'provider']
        : type === 'dingtalk'
          ? [...commonKeys, 'flow']
          : commonKeys
    );
    if (method.presentation === 'primary') primaryCount += 1;
    const invalid =
      Object.keys(method).some(key => !allowedKeys.has(key)) ||
      !OPERATION_CODE_PATTERN.test(code) ||
      methodCodes.has(code) ||
      methodTypes.has(type) ||
      !['sso', 'password', 'dingtalk'].includes(type) ||
      !string(method.label) ||
      !['primary', 'secondary'].includes(string(method.presentation)) ||
      typeof method.required !== 'boolean' ||
      (type === 'sso' && method.provider !== 'tenant-default') ||
      (type === 'dingtalk' &&
        !['auto', 'jsapi', 'oauth'].includes(string(method.flow)));
    if (invalid) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHENTICATION_METHOD_INVALID',
          '登录方法必须使用唯一 code、受支持类型和不含 Secret 的有界公开描述',
          `frontend.authentication.methods[${index}]`
        )
      );
    }
    methodCodes.add(code);
    methodTypes.add(type);
  });
  if (methods.length > 0 && primaryCount !== 1) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_AUTHENTICATION_PRIMARY_METHOD_INVALID',
        '登录方法必须且只能有一个 primary',
        'frontend.authentication.methods'
      )
    );
  }

  const routes = Array.isArray(frontend.routes) ? frontend.routes : [];
  const routeByCode = new Map(
    routes.map(raw => {
      const route = object(raw);
      return [string(route.code), route] as const;
    })
  );
  const routeCodes = new Set(routeByCode.keys());
  const claimedShapes = new Map(
    generatedPlatformRouteClaims(config).map(claim => [
      canonicalFrontendRouteShape(claim.path),
      claim,
    ])
  );
  const surfaceCodes = new Set<string>();
  const surfaceShapes = new Set<string>();
  for (const device of ['desktop', 'mobile'] as const) {
    const surface = object(surfaces[device]);
    const pointer = `frontend.authentication.surfaces.${device}`;
    const routeCode = string(surface.routeCode);
    const routePath = string(surface.path);
    const defaultRouteCode = string(surface.defaultRouteCode);
    const defaultRoute = routeByCode.get(defaultRouteCode);
    const shape = canonicalFrontendRouteShape(routePath);
    const expectedPath = device === 'mobile' ? '/m/login' : '/login';
    const invalid =
      Object.keys(surface).some(
        key => !['routeCode', 'path', 'defaultRouteCode'].includes(key)
      ) ||
      !OPERATION_CODE_PATTERN.test(routeCode) ||
      surfaceCodes.has(routeCode) ||
      routeCodes.has(routeCode) ||
      !validAppPath(routePath) ||
      /[:*?#\\\\]/.test(routePath) ||
      routePath !== expectedPath ||
      surfaceShapes.has(shape) ||
      /(?:^|\/)(?:auth|oauth)[^/]*callback(?:\/|$)/i.test(routePath);
    if (invalid) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHENTICATION_SURFACE_INVALID',
          '登录 surface 必须使用独立静态 routeCode，desktop path=/login、mobile path=/m/login',
          pointer
        )
      );
    }
    const generatedClaim = claimedShapes.get(shape);
    if (routePath && generatedClaim) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHENTICATION_ROUTE_CONFLICT',
          `登录 surface path 与 ${generatedClaim.owner} 冲突: ${routePath}`,
          `${pointer}.path`
        )
      );
    }
    if (
      !defaultRoute ||
      defaultRoute.surface !== 'user' ||
      (device === 'mobile'
        ? !string(defaultRoute.path).startsWith('/m/')
        : string(defaultRoute.path).startsWith('/m/')) ||
      canonicalFrontendRouteShape(string(defaultRoute.path)) === shape
    ) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHENTICATION_DEFAULT_ROUTE_INVALID',
          'defaultRouteCode 必须引用同设备的受保护 user route，且不能指回登录 surface',
          `${pointer}.defaultRouteCode`
        )
      );
    }
    surfaceCodes.add(routeCode);
    surfaceShapes.add(shape);
  }
}

const ADMIN_NAVIGATION_ICONS = new Set<AppAdminNavigationIcon>([
  'overview',
  'database',
  'operations',
  'workflow',
  'members',
  'calendar',
  'document',
  'folder',
  'settings',
]);

function validAdminOrder(value: unknown) {
  return (
    value === undefined ||
    (Number.isSafeInteger(value) && Math.abs(Number(value)) <= 10_000)
  );
}

function validateFrontendUser(
  config: Record<string, unknown>,
  diagnostics: Diagnostic[]
) {
  const frontend = object(config.frontend);
  if (frontend.user === undefined) return;
  const user = object(frontend.user);
  if (
    !frontend.user ||
    typeof frontend.user !== 'object' ||
    Array.isArray(frontend.user) ||
    Object.keys(user).some(key => key !== 'applicationTodoCenter') ||
    (user.applicationTodoCenter !== undefined &&
      typeof user.applicationTodoCenter !== 'boolean')
  ) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_FRONTEND_USER_INVALID',
        'frontend.user 只接受 applicationTodoCenter 布尔值',
        'frontend.user'
      )
    );
  }
}

function validateAdminAccess(
  config: OpenXiangdaAppConfig,
  diagnostics: Diagnostic[]
) {
  const accessValue = config.frontend.admin?.access;
  if (accessValue === undefined) return;
  const access = object(accessValue);
  const allOf = Array.isArray(access.allOf) ? access.allOf : [];
  const anyOf = Array.isArray(access.anyOf) ? access.anyOf : [];
  const invalid =
    !accessValue ||
    typeof accessValue !== 'object' ||
    Array.isArray(accessValue) ||
    Object.keys(access).some(key => !['allOf', 'anyOf'].includes(key)) ||
    (allOf.length === 0 && anyOf.length === 0) ||
    allOf.length > 50 ||
    anyOf.length > 50 ||
    allOf.some(value => !CAPABILITY_PATTERN.test(string(value))) ||
    anyOf.some(value => !CAPABILITY_PATTERN.test(string(value))) ||
    new Set(allOf.map(string)).size !== allOf.length ||
    new Set(anyOf.map(string)).size !== anyOf.length;
  if (invalid) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_ADMIN_ACCESS_INVALID',
        'frontend.admin.access 必须包含非空、无重复且有效的 allOf 或 anyOf capability 数组',
        'frontend.admin.access'
      )
    );
  }
}

function validateAdminNavigation(
  config: OpenXiangdaAppConfig,
  diagnostics: Diagnostic[]
) {
  const frontend = object(config.frontend);
  const admin = object(frontend.admin);
  const rawNavigation = admin.navigation;
  if (
    frontend.admin !== undefined &&
    (Object.keys(admin).some(key => !['access', 'navigation'].includes(key)) ||
      !Array.isArray(rawNavigation))
  ) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_ADMIN_NAVIGATION_INVALID',
        'frontend.admin 只接受 access 和 navigation 数组',
        'frontend.admin.navigation'
      )
    );
    return;
  }
  const groups = Array.isArray(rawNavigation) ? rawNavigation : [];
  if (groups.length > 100) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_ADMIN_NAVIGATION_LIMIT_EXCEEDED',
        '后台导航最多包含 100 个业务分组',
        'frontend.admin.navigation'
      )
    );
  }
  const resources = new Map(
    (config.data?.resources || []).map(resource => [resource.code, resource])
  );
  const routes = new Map(
    (config.frontend.routes || []).map(route => [route.code, route])
  );
  const groupCodes = new Set<string>();
  const pageKeys = new Set<string>();
  let itemCount = 0;
  groups.forEach((rawGroup, groupIndex) => {
    const group = object(rawGroup);
    const path = `frontend.admin.navigation[${groupIndex}]`;
    const code = string(group.code);
    const label = string(group.label);
    const items = Array.isArray(group.items) ? group.items : [];
    if (
      Object.keys(group).some(
        key => !['code', 'label', 'icon', 'order', 'items'].includes(key)
      ) ||
      !OPERATION_CODE_PATTERN.test(code) ||
      groupCodes.has(code) ||
      !label ||
      label === code ||
      (group.icon !== undefined &&
        !ADMIN_NAVIGATION_ICONS.has(string(group.icon) as AppAdminNavigationIcon)) ||
      !validAdminOrder(group.order)
    ) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_ADMIN_GROUP_INVALID',
          '导航分组必须声明唯一 code、用户 label、受支持 icon/order 和 items',
          path
        )
      );
    }
    if (items.length === 0) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_ADMIN_GROUP_ORPHANED',
          '导航分组必须至少引用一个可见页面',
          `${path}.items`
        )
      );
    }
    groupCodes.add(code);
    items.forEach((rawItem, itemIndex) => {
      itemCount += 1;
      const item = object(rawItem);
      const itemPath = `${path}.items[${itemIndex}]`;
      const page = object(item.page);
      const kind = string(page.kind);
      let pageKey = '';
      let defaultLabel = '';
      let internalCode = '';
      let exists = false;
      if (kind === 'resource') {
        const resourceCode = string(page.resourceCode);
        const resource = resources.get(resourceCode);
        const viewCode = string(page.viewCode);
        const view = resource?.surface?.views?.find((item: { code: string }) => item.code === viewCode);
        pageKey = `resource:${resourceCode}${viewCode ? `:view:${viewCode}` : ""}:list`;
        defaultLabel = (viewCode ? view?.name : resource?.name) || '';
        internalCode = resourceCode;
        exists = Boolean(viewCode ? view?.generated?.list : resource?.surface?.generated?.list);
      } else if (kind === 'operation') {
        const routeCode = string(page.routeCode);
        const route = routes.get(routeCode);
        pageKey = `operation:${routeCode}`;
        defaultLabel = route?.label || '';
        internalCode = routeCode;
        exists = Boolean(
          route &&
            route.surface === 'admin' &&
            !route.path.startsWith('/m/admin') &&
            !/[:*]/.test(route.path)
        );
      }
      if (
        Object.keys(item).some(
          key => !['page', 'label', 'icon', 'order'].includes(key)
        ) ||
        ![
          'resource',
          'operation',
        ].includes(kind) ||
        (item.icon !== undefined &&
          !ADMIN_NAVIGATION_ICONS.has(string(item.icon) as AppAdminNavigationIcon)) ||
        !validAdminOrder(item.order)
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_ADMIN_ITEM_INVALID',
            '导航项必须使用受支持的页面 helper、label、icon 和 order',
            itemPath
          )
        );
      }
      if (!exists) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_ADMIN_PAGE_NOT_FOUND',
            '导航引用必须指向存在且可进入菜单的 page registry 页面',
            `${itemPath}.page`
          )
        );
      }
      if (pageKey && pageKeys.has(pageKey)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_ADMIN_PAGE_DUPLICATE',
            `同一页面不能重复出现在导航中: ${pageKey}`,
            `${itemPath}.page`
          )
        );
      }
      if (pageKey) pageKeys.add(pageKey);
      const label = string(item.label) || defaultLabel;
      if (!label || label === internalCode || label === pageKey) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_ADMIN_USER_LABEL_REQUIRED',
            '导航页面必须解析为用户可读 label，不能泄漏内部 code',
            item.label === undefined ? `${itemPath}.page` : `${itemPath}.label`
          )
        );
      }
    });
  });
  if (itemCount > 500) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_ADMIN_NAVIGATION_LIMIT_EXCEEDED',
        '后台导航最多包含 500 个页面引用',
        'frontend.admin.navigation'
      )
    );
  }
}

function validateAuthorizationTransitions(
  rawTransitions: unknown,
  _roleCodes: Set<string>,
  diagnostics: Diagnostic[]
) {
  if (rawTransitions !== undefined && !Array.isArray(rawTransitions)) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_AUTHZ_TRANSITIONS_INVALID',
        'authz.authorizationTransitions 必须是数组',
        'authz.authorizationTransitions'
      )
    );
    return;
  }
  const digests = new Set<string>();
  (Array.isArray(rawTransitions) ? rawTransitions : []).forEach((raw, index) => {
    const path = `authz.authorizationTransitions[${index}]`;
    if (!isPlainRecord(raw)) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHZ_TRANSITION_INVALID',
          '授权 transition 必须是只含 canonical 字段的对象',
          path
        )
      );
      return;
    }
    if (!exactKeys(raw, AUTHORIZATION_TRANSITION_KEYS)) {
      const unknownKey = Object.keys(raw).find(
        key => !AUTHORIZATION_TRANSITION_KEYS.includes(key as never)
      );
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHZ_TRANSITION_INVALID',
          '授权 transition 只允许 fromAuthzDigest、removeRoleCodes、removeCapabilityCodes、reason',
          unknownKey ? `${path}.${unknownKey}` : path
        )
      );
      return;
    }
    const transition = raw;
    const digest = transition.fromAuthzDigest;
    const removeRolesValid =
      transition.removeRoleCodes === undefined ||
      isExactStringArray(
        transition.removeRoleCodes,
        AUTHORIZATION_TRANSITION_ROLE_CODE_PATTERN,
        128
      );
    const removeCapabilitiesValid =
      transition.removeCapabilityCodes === undefined ||
      isExactStringArray(
        transition.removeCapabilityCodes,
        AUTHORIZATION_TRANSITION_CAPABILITY_CODE_PATTERN,
        255
      );
    if (
      typeof digest !== 'string' ||
      !/^[0-9a-f]{64}$/.test(digest) ||
      digests.has(digest) ||
      typeof transition.reason !== 'string' ||
      !transition.reason.trim() ||
      transition.reason.length > 2000 ||
      !removeRolesValid ||
      !removeCapabilitiesValid
    ) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_AUTHZ_TRANSITION_INVALID',
          '授权 transition 必须按来源摘要唯一，并使用有界、不重复的 canonical 移除项和 reason',
          path
        )
      );
    }
    if (typeof digest === 'string' && /^[0-9a-f]{64}$/.test(digest)) {
      digests.add(digest);
    }
  });
}

function validateCapabilityClosure(
  appCode: string,
  config: Record<string, unknown>,
  declarations: unknown[],
  diagnostics: Diagnostic[]
) {
  const catalog = new Set(platformCapabilityCodes(appCode));
  for (const raw of declarations) catalog.add(string(object(raw).code));
  const data = object(config.data);
  const catalogOwners = new Map<string, string>();
  const references: Array<{ capability: string; path: string }> = [];
  for (const raw of declarations) {
    const code = string(object(raw).code);
    if (code) catalogOwners.set(code, 'authz.capabilities');
  }
  for (const [resourceIndex, rawResource] of (Array.isArray(data.resources) ? data.resources : []).entries()) {
    const resource = object(rawResource);
    const resourceOwner = `data.resources.${string(resource.code)}`;
    Object.values(object(resource.capabilities)).forEach(value => {
      const code = string(value);
      registerCapabilityOwner(code, resourceOwner, catalogOwners, diagnostics);
      catalog.add(code);
    });
    Object.entries(object(resource.fieldPolicies)).forEach(([fieldCode, rawPolicy]) => {
      const policy = object(rawPolicy);
      for (const key of ['read', 'create', 'update'] as const) {
        for (const value of Array.isArray(policy[key]) ? policy[key] : []) {
          const code = string(value);
          if (isDataAuditMetadataField(fieldCode)) {
            references.push({
              capability: code,
              path: `data.resources[${resourceIndex}].fieldPolicies.${fieldCode}.${key}`,
            });
            continue;
          }
          registerCapabilityOwner(
            code,
            resourceOwner,
            catalogOwners,
            diagnostics
          );
          catalog.add(code);
        }
      }
    });
  }
  const authz = object(config.authz);
  (Array.isArray(authz.roles) ? authz.roles : []).forEach((rawRole, index) => {
    const role = object(rawRole);
    (Array.isArray(role.capabilities) ? role.capabilities : []).forEach(
      (value, capabilityIndex) =>
        references.push({
          capability: string(value),
          path: `authz.roles[${index}].capabilities[${capabilityIndex}]`,
        })
    );
    (Array.isArray(role.deniedCapabilities)
      ? role.deniedCapabilities
      : []
    ).forEach((value, capabilityIndex) =>
      references.push({
        capability: string(value),
        path: `authz.roles[${index}].deniedCapabilities[${capabilityIndex}]`,
      })
    );
  });
  const backend = object(config.backend);
  (Array.isArray(backend.operations) ? backend.operations : []).forEach(
    (rawOperation, index) =>
      references.push({
        capability: string(object(rawOperation).capability),
        path: `backend.operations[${index}].capability`,
      })
  );
  const frontend = object(config.frontend);
  (Array.isArray(frontend.routes) ? frontend.routes : []).forEach(
    (rawRoute, index) => {
      const route = object(rawRoute);
      const capability = string(route.capability);
      if (capability) {
        references.push({
          capability,
          path: `frontend.routes[${index}].capability`,
        });
      }
      const access = object(route.access);
      for (const key of ['allOf', 'anyOf'] as const) {
        const values = Array.isArray(access[key]) ? access[key] : [];
        values.forEach((value, capabilityIndex) =>
          references.push({
            capability: string(value),
            path: `frontend.routes[${index}].access.${key}[${capabilityIndex}]`,
          })
        );
      }
    }
  );
  const adminAccess = object(object(frontend.admin).access);
  for (const key of ['allOf', 'anyOf'] as const) {
    const values = Array.isArray(adminAccess[key]) ? adminAccess[key] : [];
    values.forEach((value, capabilityIndex) =>
      references.push({
        capability: string(value),
        path: `frontend.admin.access.${key}[${capabilityIndex}]`,
      })
    );
  }
  for (const reference of references) {
    if (
      !catalog.has(reference.capability) ||
      (!reference.capability.startsWith(`app:${appCode}:`) &&
        !platformCapabilityCodes(appCode).has(reference.capability))
    ) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_CAPABILITY_CLOSURE_FAILED',
          `引用了未声明、跨应用或非平台保留 capability: ${reference.capability}`,
          reference.path
        )
      );
    }
  }
}

function registerCapabilityOwner(
  code: string,
  owner: string,
  owners: Map<string, string>,
  diagnostics: Diagnostic[]
) {
  if (!code) return;
  const existing = owners.get(code);
  if (existing && existing !== owner) {
    diagnostics.push(
      diagnostic(
        'APP_CONFIG_CAPABILITY_OWNER_CONFLICT',
        `capability 只能由一个 catalog owner 定义: ${code}`,
        owner
      )
    );
    return;
  }
  owners.set(code, owner);
}

function platformCapabilityCodes(appCode: string) {
  return new Set(nativePlatformCapabilityCatalog(appCode).map(item => item.code));
}

function validAppPath(value: string) {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('..') &&
    !value.includes('?') &&
    !value.includes('#') &&
    value.length <= 2048
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export class AppConfigValidationError extends Error {
  readonly code = 'OPENXIANGDA_APP_CONFIG_INVALID';

  constructor(readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map(item => `${item.path}: ${item.message}`).join('; '));
    this.name = 'AppConfigValidationError';
  }
}

export function resourceCapabilityCodes(appCode: string, resourceCode: string) {
  const prefix = `app:${appCode}:data:${resourceCode}`;
  return {
    read: `${prefix}:read`,
    create: `${prefix}:create`,
    update: `${prefix}:update`,
    delete: `${prefix}:delete`,
  } as const;
}

function materializeRoleCapabilities(
  role: AuthzRoleDeclaration
) {
  const capabilities = new Set(role.capabilities);
  for (const denied of role.deniedCapabilities || []) {
    capabilities.delete(denied);
  }
  return [...capabilities].sort();
}

/** Explicit business permission preset; adding a page never changes grants. */
export function resourceRoleCapabilities(
  appCode: string,
  resourceCode: string,
  access: 'read' | 'manage' | readonly ('read' | 'create' | 'update' | 'delete')[]
): string[] {
  const codes = resourceCapabilityCodes(appCode, resourceCode);
  const operations = access === 'manage'
    ? ['read', 'create', 'update', 'delete'] as const
    : access === 'read' ? ['read'] as const : access;
  return [...new Set(operations.map(operation => codes[operation]))].sort();
}

export function currentUserDataPolicy(input: {
  code: string;
  name: string;
  resourceCode: string;
  field: string;
  roleCodes: string[];
  unrestrictedRoleCodes?: string[];
}): AppDataPolicyDeclaration {
  return {
    code: input.code,
    name: input.name,
    resourceCode: input.resourceCode,
    ...(input.unrestrictedRoleCodes
      ? { unrestrictedRoleCodes: [...input.unrestrictedRoleCodes] }
      : {}),
    matchMode: 'AND',
    rules: [
      {
        subject: 'current_user',
        field: input.field,
        roleCodes: [...input.roleCodes],
      },
    ],
  };
}

export const dataPolicyExpression = {
  allOf: (
    ...values: AppDataPolicyExpressionDeclaration[]
  ): AppDataPolicyExpressionDeclaration => ({ allOf: values }),
  anyOf: (
    ...values: AppDataPolicyExpressionDeclaration[]
  ): AppDataPolicyExpressionDeclaration => ({ anyOf: values }),
  constant: (input: {
    field: string;
    operator: 'eq' | 'not_eq' | 'in' | 'not_in';
    value: string | string[];
    roleCodes?: string[];
  }): AppDataPolicyRuleDeclaration => ({ ...input }),
  null: (input: {
    field: string;
    operator: 'is_null' | 'is_not_null';
    roleCodes?: string[];
  }): AppDataPolicyRuleDeclaration => ({ ...input }),
  databaseNow: (input: {
    field: string;
    operator: 'lt' | 'lte' | 'gt' | 'gte';
    roleCodes?: string[];
  }): AppDataPolicyRuleDeclaration => ({ ...input, operand: 'db_now' }),
  currentUser: (input: {
    field: string;
    roleCodes?: string[];
  }): AppDataPolicyRuleDeclaration => ({ ...input, subject: 'current_user' }),
  dimension: (input: {
    dimensionCode: string;
    field: string;
    roleCodes?: string[];
    operation?: string;
    valuePath?: string;
    emptyMatchesAll?: boolean;
  }): AppDataPolicyRuleDeclaration => ({ ...input }),
  relation: (input: {
    relationCode: string;
    resourceCode: string;
    field: string;
    roleCodes?: string[];
    operation?: string;
    valuePath?: string;
  }): AppDataPolicyRuleDeclaration => ({ ...input }),
} as const;

export function resourceReadPolicy(input: {
  code: string;
  name: string;
  resourceCode: string;
  expression: AppDataPolicyExpressionDeclaration;
  unrestrictedRoleCodes?: string[];
} & (
  | {
      matchMode: 'AND' | 'OR';
      rules: AppDataPolicyRuleDeclaration[];
      writeBoundary?: never;
    }
  | {
      matchMode?: never;
      rules?: never;
      writeBoundary: 'capability_only';
    }
)): AppDataPolicyDeclaration {
  const common = {
    code: input.code,
    name: input.name,
    resourceCode: input.resourceCode,
    ...(input.unrestrictedRoleCodes
      ? { unrestrictedRoleCodes: [...input.unrestrictedRoleCodes] }
      : {}),
    readExpression: input.expression,
  };
  if (input.writeBoundary === 'capability_only') {
    return {
      ...common,
      matchMode: 'AND',
      rules: [],
      writeBoundary: 'capability_only',
    };
  }
  return {
    ...common,
    matchMode: input.matchMode,
    rules: input.rules,
  };
}

export function materializeDataResource(
  appCode: string,
  declaration: AppDataResourceDeclaration
): AppConfiguredDataResource {
  const capabilities = resourceCapabilityCodes(appCode, declaration.code);
  const mutationOwner = declaration.mutationOwner || 'native';
  const nativeMutations = mutationOwner === 'native';
  const generated = {
    list: declaration.generated?.list ?? true,
    detail: declaration.generated?.detail ?? true,
    create: declaration.generated?.create ?? nativeMutations,
    update: declaration.generated?.update ?? nativeMutations,
    delete: declaration.generated?.delete ?? nativeMutations,
  };
  const fields = declaration.fields.map(field => {
    const definition: DataFieldDefinition = {
      code: field.code,
      type: field.type,
      nullable: fieldNullable({
        type: field.type,
        nullable: field.required !== true,
      }),
      indexed:
        field.indexed ??
        Boolean(field.filter || field.searchable || field.sortable),
      ...(field.options ? { options: field.options } : {}),
      ...(field.source ? { source: field.source } : {}),
      ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
      ...(field.precision !== undefined ? { precision: field.precision } : {}),
      ...(field.scale !== undefined ? { scale: field.scale } : {}),
      ...(field.min !== undefined ? { min: field.min } : {}),
      ...(field.max !== undefined ? { max: field.max } : {}),
      ...(field.rangeBoundary
        ? { rangeBoundary: field.rangeBoundary }
        : {}),
      ...(field.timePrecision ? { timePrecision: field.timePrecision } : {}),
      ...(field.file ? { file: field.file } : {}),
      ...(field.serial ? { serial: field.serial } : {}),
      ...(field.subtable ? { subtable: field.subtable } : {}),
    };
    physicalPlanForField(definition, field.searchable === true);
    return definition;
  });
  const listCandidates = declaration.fields
    .filter(field => field.list !== false && (field.hidden ?? field.system) !== true);
  const visible = declaration.list?.fields
    ? declaration.list.fields.flatMap(code => listCandidates.filter(field => field.code === code))
    : listCandidates.slice(0, 8);
  const defaultSortField = visible.find(field => supportsSort(field.type));
  const searchableFields = declaration.fields
    .filter(field => field.searchable === true)
    .map(field => field.code);
  const filterFields = declaration.fields
    .filter(field => field.filter === true)
    .map(field => field.code);
  const access = (
    field: AppDataFieldDeclaration,
    operation: 'read' | 'create' | 'update'
  ) => {
    if (
      operation !== 'read' &&
      !supportsGeneratedMutation({
        type: field.type,
        system: field.system,
      })
    ) {
      return [];
    }
    const override = field.access?.[operation];
    if (override === false) return [];
    if (Array.isArray(override)) return [...override];
    return [capabilities[operation]];
  };
  const surface: DataResourceSurface = {
    ...(declaration.views?.length ? { views: declaration.views } : {}),
    mutationOwner,
    generated,
    fields: Object.fromEntries(
      declaration.fields.map(field => [
        field.code,
        {
          label: field.label,
          type: field.type,
          widget: resolveDataFieldSurfaceWidget(field),
          ...(field.section ? { section: field.section } : {}),
          ...(field.required === true ? { requiredHint: true } : {}),
          ...(field.system !== undefined ? { system: field.system } : {}),
          ...(field.hidden !== undefined || field.system
            ? { hidden: field.hidden ?? true }
            : {}),
          readCapabilities: access(field, 'read'),
          createCapabilities: access(field, 'create'),
          updateCapabilities: access(field, 'update'),
          ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
          ...(field.precision !== undefined ? { precision: field.precision } : {}),
          ...(field.scale !== undefined ? { scale: field.scale } : {}),
          ...(field.min !== undefined ? { min: field.min } : {}),
          ...(field.max !== undefined ? { max: field.max } : {}),
          ...(field.rangeBoundary
            ? { rangeBoundary: field.rangeBoundary }
            : {}),
          ...(field.file?.maxCount !== undefined
            ? { maxCount: field.file.maxCount }
            : {}),
          ...(field.file?.maxSizeMb !== undefined
            ? { maxSizeMb: field.file.maxSizeMb }
            : {}),
          ...(field.file?.accept ? { accept: field.file.accept } : {}),
          ...(field.options ? { options: field.options } : {}),
          ...(field.source ? { source: field.source } : {}),
          ...(field.timePrecision ? { timePrecision: field.timePrecision } : {}),
          ...(field.serial ? { serial: field.serial } : {}),
          ...(field.subtable ? { subtable: field.subtable } : {}),
          ...(visible.some(item => item.code === field.code)
            ? { list: true }
            : { list: false }),
          ...(field.searchable !== undefined
            ? { searchable: field.searchable }
            : {}),
          ...(field.sortable !== undefined ? { sortable: field.sortable } : {}),
        },
      ])
    ),
    list: {
      fieldOrder: visible.map(field => field.code),
      ...(declaration.list?.actions !== undefined ? { actions: declaration.list.actions } : {}),
      defaultPageSize: declaration.list?.defaultPageSize || 20,
      ...(searchableFields.length ? { searchableFields } : {}),
      ...(filterFields.length ? { filterFields } : {}),
      ...(declaration.list?.defaultSort
        ? { defaultSort: declaration.list.defaultSort }
        : defaultSortField
          ? { defaultSort: { field: defaultSortField.code, order: 'asc' } }
          : {}),
    },
    form: {
      layout: declaration.form?.layout || 'flat',
      fieldOrder: declaration.form?.fields || declaration.fields.map(field => field.code),
    },
    detail: {
      layout: declaration.detail?.layout || 'flat',
      fieldOrder: declaration.detail?.fields || declaration.fields.map(field => field.code),
    },
    mobile: declaration.mobile || { enabled: true },
  };
  return {
    schemaVersion: SCHEMA_VERSIONS.dataResource,
    appCode,
    code: declaration.code,
    name: declaration.name,
    schema: { fields },
    ...(declaration.invariants ? { invariants: declaration.invariants } : {}),
    surface,
    capabilities,
    ...(declaration.dataPolicyCode
      ? { dataPolicyCode: declaration.dataPolicyCode }
      : {}),
    ...(declaration.detailRouteCode
      ? { detailRouteCode: { ...declaration.detailRouteCode } }
      : {}),
    fieldPolicies: {
      ...Object.fromEntries(
      declaration.fields.map(field => [
        field.code,
        {
          read: access(field, 'read'),
          create: access(field, 'create'),
          update: access(field, 'update'),
          ...(field.access?.mask ? { mask: field.access.mask } : {}),
        },
      ])
      ),
      ...(declaration.audit === undefined ? {} : Object.fromEntries(
        DATA_AUDIT_METADATA_FIELDS.map(code => [code, {
          read: declaration.audit!.read === false ? [] : [...declaration.audit!.read],
        }])
      )),
    },
  };
}

export function validateAppDeclaration(value: unknown): Diagnostic[] {
  const declaration = object(value);
  const appCode = string(object(declaration.app).code);
  const data = object(declaration.data);
  const resources = Array.isArray(data.resources) ? data.resources : [];
  const diagnostics: Diagnostic[] = [];
  const resourceKeys = new Set([
    'views',
    'code',
    'name',
    'mutationOwner',
    'generated',
    'fields',
    'invariants',
    'list',
    'form',
    'detail',
    'mobile',
    'dataPolicyCode',
    'detailRouteCode',
    'audit',
  ]);
  const fieldKeys = new Set([
    'code',
    'type',
    'label',
    'required',
    'indexed',
    'options',
    'source',
    'maxLength',
    'precision',
    'scale',
    'min',
    'max',
    'rangeBoundary',
    'timePrecision',
    'file',
    'serial',
    'subtable',
    'widget',
    'section',
    'system',
    'hidden',
    'list',
    'filter',
    'searchable',
    'sortable',
    'access',
  ]);
  resources.forEach((rawResource, resourceIndex) => {
    const resource = object(rawResource);
    const resourcePath = `data.resources[${resourceIndex}]`;
    for (const key of Object.keys(resource)) {
      if (!resourceKeys.has(key)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_RESOURCE_PROPERTY_UNSUPPORTED',
            `${resourcePath}.${key} 不属于单次资源声明合同`,
            `${resourcePath}.${key}`,
            '只声明 code、name、fields 及可选列表/布局/数据策略/详情路由'
          )
        );
      }
    }
    const fields = Array.isArray(resource.fields) ? resource.fields : [];
    let auditValid = true;
    if (resource.audit !== undefined) {
      const audit = object(resource.audit);
      const read = audit.read;
      if (!resource.audit || typeof resource.audit !== 'object' || Array.isArray(resource.audit) ||
        Object.keys(audit).some(key => key !== 'read') ||
        (read !== false && (!Array.isArray(read) || read.length < 1 || read.length > 20 ||
          read.some(value => typeof value !== 'string' || !value.trim()) || new Set(read).size !== read.length))) {
        auditValid = false;
        diagnostics.push(diagnostic('APP_CONFIG_DATA_AUDIT_READ_INVALID',
          'audit.read 必须为 false 或不重复的非空 capability 数组（最多 20 项）', `${resourcePath}.audit`));
      }
    }
    const mutationOwner = string(resource.mutationOwner) || 'native';
    const generated = object(resource.generated);
    if (!['native', 'action', 'readonly', 'workflow'].includes(mutationOwner)) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_DATA_RESOURCE_MUTATION_OWNER_INVALID',
          'mutationOwner 必须是 native、action、readonly 或 workflow',
          `${resourcePath}.mutationOwner`
        )
      );
    }
    for (const key of Object.keys(generated)) {
      if (!['list', 'detail', 'create', 'update', 'delete'].includes(key)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_RESOURCE_GENERATED_SURFACE_INVALID',
            `generated.${key} 不是受支持的标准页面/操作`,
            `${resourcePath}.generated.${key}`
          )
        );
      } else if (typeof generated[key] !== 'boolean') {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_RESOURCE_GENERATED_SURFACE_INVALID',
            `generated.${key} 必须是 boolean`,
            `${resourcePath}.generated.${key}`
          )
        );
      }
    }
    if (mutationOwner !== 'native') {
      for (const operation of ['create', 'update', 'delete'] as const) {
        if (generated[operation] === true) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_RESOURCE_NATIVE_MUTATION_OWNER_CONFLICT',
              `${mutationOwner} owns mutations; Native ${operation} cannot be generated`,
              `${resourcePath}.generated.${operation}`
            )
          );
        }
      }
    }
    if (fields.length === 0) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_DATA_RESOURCE_FIELDS_REQUIRED',
          '资源必须直接声明非空 fields 数组',
          `${resourcePath}.fields`
        )
      );
      return;
    }
    const declaredCodes = new Set<string>();
    let materializable = auditValid;
    fields.forEach((rawField, fieldIndex) => {
      const field = object(rawField);
      const fieldPath = `${resourcePath}.fields[${fieldIndex}]`;
      for (const key of Object.keys(field)) {
        if (!fieldKeys.has(key)) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_FIELD_PROPERTY_UNSUPPORTED',
              `${fieldPath}.${key} 不属于单次字段声明合同`,
              `${fieldPath}.${key}`
            )
          );
        }
      }
      const code = string(field.code);
      const fieldType = string(field.type);
      if (!APP_DATA_FIELD_TYPES.has(fieldType)) {
        materializable = false;
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_FIELD_TYPE_INVALID',
            `${fieldPath}.type 必须是 OpenXiangda 2.0 语义字段类型之一: ${DATA_FIELD_TYPES.join('、')}`,
            `${fieldPath}.type`,
            '直接声明业务语义类型，不声明 PostgreSQL 物理类型'
          )
        );
      } else {
        const semanticType = fieldType as DataFieldDefinition['type'];
        const widget = string(field.widget) as DataFieldSurfaceWidget;
        if (widget && !isCompatibleFieldWidget({ type: semanticType, widget })) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_FIELD_WIDGET_INCOMPATIBLE',
              `${fieldPath}.widget 与 ${semanticType} 不兼容；允许 ${compatibleWidgets(semanticType).join('、')}`,
              `${fieldPath}.widget`
            )
          );
        }
        if (field.filter === true && !supportsFilter(semanticType)) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_FIELD_FILTER_UNSUPPORTED',
              `${semanticType} 不支持作为父资源筛选字段`,
              `${fieldPath}.filter`
            )
          );
        }
        if (field.searchable === true && !supportsSearch(semanticType)) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_FIELD_SEARCH_UNSUPPORTED',
              `${semanticType} 没有全文/模糊搜索和 trigram 索引计划`,
              `${fieldPath}.searchable`
            )
          );
        }
        if (field.sortable === true && !supportsSort(semanticType)) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_FIELD_SORT_UNSUPPORTED',
              `${semanticType} 不支持稳定排序`,
              `${fieldPath}.sortable`
            )
          );
        }
        const rangeType =
          semanticType === 'date-range' || semanticType === 'datetime-range';
        if (
          rangeType &&
          !['closed', 'half-open'].includes(string(field.rangeBoundary))
        ) {
          materializable = false;
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_FIELD_RANGE_BOUNDARY_REQUIRED',
              `${semanticType} 必须显式声明 rangeBoundary: closed 或 half-open`,
              `${fieldPath}.rangeBoundary`
            )
          );
        } else if (!rangeType && field.rangeBoundary !== undefined) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_FIELD_RANGE_BOUNDARY_TYPE_INVALID',
              'rangeBoundary 只能用于 date-range 或 datetime-range',
              `${fieldPath}.rangeBoundary`
            )
          );
        }
        if (
          ['radio', 'checkbox'].includes(widget) &&
          object(field.source).loadMode !== 'all' &&
          field.source !== undefined
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_FIELD_SOURCE_LOAD_MODE_INVALID',
              '动态 Radio/Checkbox 必须声明 source.loadMode = all',
              `${fieldPath}.source.loadMode`
            )
          );
        }
      }
      if (!string(field.label)) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_FIELD_LABEL_REQUIRED',
            '字段必须同时声明中文或业务 label',
            `${fieldPath}.label`
          )
        );
      }
      for (const key of [
        'required',
        'indexed',
        'system',
        'hidden',
        'list',
        'filter',
        'searchable',
        'sortable',
      ]) {
        if (field[key] !== undefined && typeof field[key] !== 'boolean') {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_FIELD_BOOLEAN_INVALID',
              `${fieldPath}.${key} 必须为 boolean`,
              `${fieldPath}.${key}`
            )
          );
        }
      }
      const accessDeclaration = object(field.access);
      for (const key of Object.keys(accessDeclaration)) {
        if (!['read', 'create', 'update', 'mask'].includes(key)) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_FIELD_ACCESS_PROPERTY_UNSUPPORTED',
              `${fieldPath}.access.${key} 不受支持`,
              `${fieldPath}.access.${key}`
            )
          );
        }
      }
      for (const operation of ['read', 'create', 'update'] as const) {
        const grant = accessDeclaration[operation];
        if (
          grant !== undefined &&
          grant !== false &&
          (!Array.isArray(grant) ||
            grant.length === 0 ||
            grant.some(item => typeof item !== 'string' || !item.trim()))
        ) {
          diagnostics.push(
            diagnostic(
              'APP_CONFIG_DATA_FIELD_ACCESS_INVALID',
              `${fieldPath}.access.${operation} 必须为 false 或非空 capability 数组`,
              `${fieldPath}.access.${operation}`
            )
          );
        }
      }
      if (code) declaredCodes.add(code);
    });
    for (const view of ['list', 'form', 'detail'] as const) {
      const selected = object(resource[view]).fields;
      if (selected === undefined) continue;
      if (!Array.isArray(selected) || new Set(selected).size !== selected.length ||
          selected.some(code => typeof code !== 'string' || !declaredCodes.has(code))) {
        diagnostics.push(diagnostic(
          'APP_CONFIG_DATA_VIEW_FIELDS_INVALID',
          '列表/表单/详情 fields 必须是当前资源中不重复的字段列表',
          `${resourcePath}.${view}.fields`
        ));
        materializable = false;
      }
    }
    const selectedFormFields = object(resource.form).fields ?? fields.map(raw => object(raw).code);
    if (Array.isArray(selectedFormFields) && (generated.create ?? mutationOwner === 'native')) {
      for (const rawField of fields) {
        const field = object(rawField);
        if (field.required === true && field.system !== true &&
            supportsGeneratedMutation({ type: field.type as DataFieldDefinition['type'], system: false }) &&
            object(field.access).create !== false && (field.hidden === true || !selectedFormFields.includes(field.code))) {
          diagnostics.push(diagnostic(
            'APP_CONFIG_DATA_FORM_REQUIRED_FIELD_MISSING',
            `标准新增表单缺少必填字段 ${field.label || field.code}；请加入表单或关闭标准新增`,
            `${resourcePath}.form.fields`
          ));
        }
      }
    }
    for (const operation of ['create', 'update'] as const) {
      const enabled = generated[operation] ?? mutationOwner === 'native';
      const writable = fields.some(rawField => {
        const field = object(rawField);
        return (
          APP_DATA_FIELD_TYPES.has(string(field.type)) &&
          supportsGeneratedMutation({
            type: string(field.type) as DataFieldDefinition['type'],
            system: field.system === true,
          }) &&
          object(field.access)[operation] !== false
        );
      });
      if (materializable && enabled && !writable) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_RESOURCE_WRITABLE_FIELDS_REQUIRED',
            `generated.${operation} 需要至少一个可写业务字段`,
            `${resourcePath}.generated.${operation}`
          )
        );
      }
    }
    const defaultSortField = string(object(resource.list).defaultSort && object(object(resource.list).defaultSort).field);
    if (defaultSortField && !declaredCodes.has(defaultSortField)) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_DATA_RESOURCE_SORT_FIELD_INVALID',
          '默认排序字段必须在同一资源 fields 中声明',
          `${resourcePath}.list.defaultSort.field`
        )
      );
    }
    if (appCode && fields.length && materializable) {
      const canonical = materializeDataResource(
        appCode,
        rawResource as AppDataResourceDeclaration
      );
      for (const [viewIndex, view] of (canonical.surface?.views || []).entries()) {
        for (const [property, values, supports] of [
          ['searchableFields', view.list?.searchableFields || [], supportsSearch],
          ['filterFields', view.list?.filterFields || [], supportsFilter],
          ['defaultSort', view.list?.defaultSort ? [view.list.defaultSort.field] : [], supportsSort],
        ] as const) {
          for (const code of values) {
            const field = canonical.schema.fields.find(field => field.code === code);
            if (!field || !supports(field.type)) diagnostics.push(diagnostic(
              'APP_CONFIG_DATA_VIEW_QUERY_FIELD_INVALID',
              '视图查询字段不存在或不支持此查询类型', `${resourcePath}.views[${viewIndex}].list.${property}`
            ));
          }
        }
      }
      diagnostics.push(
        ...validateDataResource(canonical).map(item => ({
          ...item,
          path: `${resourcePath}.${item.path}`,
          source: 'openxiangda-app.config.ts',
        }))
      );
    }
  });
  const declaredResources = new Map(
    resources.map((rawResource, resourceIndex) => {
      const resource = object(rawResource);
      return [
        string(resource.code),
        {
          resource,
          resourceIndex,
          fields: new Map(
            (Array.isArray(resource.fields) ? resource.fields : []).map(rawField => {
              const field = object(rawField);
              return [string(field.code), field];
            })
          ),
        },
      ] as const;
    })
  );
  for (const [resourceCode, declaration] of declaredResources) {
    const fields = Array.isArray(declaration.resource.fields)
      ? declaration.resource.fields
      : [];
    const aggregateMaxRows = fields.reduce((total, rawField) => {
      const field = object(rawField);
      if (field.type !== 'subtable') return total;
      const configured = Number(object(field.subtable).maxRows);
      return total + (Number.isSafeInteger(configured) ? configured : 20);
    }, 0);
    if (aggregateMaxRows > 49) {
      diagnostics.push(
        diagnostic(
          'APP_CONFIG_DATA_SUBTABLE_AGGREGATE_MAX_ROWS_EXCEEDED',
          '同一父资源的所有子表 maxRows 总和不能超过 49',
          `data.resources[${declaration.resourceIndex}].fields`
        )
      );
    }
    fields.forEach((rawField, fieldIndex) => {
      const field = object(rawField);
      if (field.type !== 'subtable') return;
      const path = `data.resources[${declaration.resourceIndex}].fields[${fieldIndex}].subtable`;
      const subtable = object(field.subtable);
      const targetCode = string(subtable.resourceCode);
      const target = declaredResources.get(targetCode);
      if (!target || targetCode === resourceCode) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_SUBTABLE_TARGET_INVALID',
            '子表必须引用同一应用内不同的子资源',
            `${path}.resourceCode`
          )
        );
        return;
      }
      const foreignKey = target.fields.get(string(subtable.foreignKey));
      if (
        !foreignKey ||
        foreignKey.type !== 'uuid' ||
        foreignKey.required !== true ||
        object(foreignKey.access).create === false
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_SUBTABLE_FOREIGN_KEY_INVALID',
            '子表外键必须是子资源中可创建写入的必填 uuid 字段',
            `${path}.foreignKey`
          )
        );
      }
      const orderField = target.fields.get(string(subtable.orderField));
      if (
        !orderField ||
        orderField.type !== 'number.integer' ||
        orderField.required !== true ||
        object(orderField.access).create === false ||
        object(orderField.access).update === false
      ) {
        diagnostics.push(
          diagnostic(
            'APP_CONFIG_DATA_SUBTABLE_ORDER_FIELD_INVALID',
            '子表排序字段必须是子资源中可创建和更新的必填 number.integer 字段',
            `${path}.orderField`
          )
        );
      }
    });
  }
  return diagnostics;
}

export function defineOpenXiangdaApp(
  declaration: OpenXiangdaAppDeclaration
): OpenXiangdaAppConfig {
  const { modules, ...input } = declaration;
  const projected = materializeApplicationModules(modules || []);
  if (projected.diagnostics.length) throw new AppConfigValidationError(projected.diagnostics);
  const normalizedDeclaration = normalizeLegacyUserSurfaceAuthoring({
    ...input,
    schemaVersion: declaration.schemaVersion ?? 3,
    frontend: { root: 'apps/web', ...declaration.frontend },
    backend: {
      root: 'apps/server', runtime: 'node', framework: 'nestjs',
      enabled: Boolean(
        declaration.backend?.operations?.length || declaration.backend?.secrets?.length ||
        declaration.events?.subscriptions?.some(item => !item.execution) || declaration.events?.timers?.length ||
        declaration.events?.dateTriggers?.length ||
        declaration.workflows?.providers?.length
      ),
      ...declaration.backend,
    },
    platform: { root: 'platform', ...declaration.platform },
    ...(modules || declaration.data ? {
      data: { resources: [...(declaration.data?.resources || []), ...projected.resources] },
    } : {}),
  });
  const declarationDiagnostics = validateAppDeclaration(normalizedDeclaration);
  if (declarationDiagnostics.length > 0) {
    throw new AppConfigValidationError(declarationDiagnostics);
  }
  const { data, ...application } = normalizedDeclaration;
  const materialized: OpenXiangdaAppConfig = {
    ...application,
    ...(data
      ? {
          data: {
            resources: data.resources.map(resource =>
              materializeDataResource(normalizedDeclaration.app.code, resource)
            ),
          },
        }
      : {}),
  };
  const config: OpenXiangdaAppConfig = materialized.authz
    ? {
        ...materialized,
        authz: {
          ...materialized.authz,
          roles: materialized.authz.roles.map(role => ({
            ...role,
            capabilities: materializeRoleCapabilities(role),
          })),
        },
      }
    : materialized;
  const diagnostics = validateAppConfig(config);
  if (diagnostics.length > 0) throw new AppConfigValidationError(diagnostics);
  const sealed: OpenXiangdaAppConfig = config.authz
    ? {
        ...config,
        authz: {
          ...config.authz,
          roles: config.authz.roles.map(role => {
            const {
              deniedCapabilities: _deniedCapabilities,
              ...materializedRole
            } = role;
            return materializedRole;
          }),
        },
      }
    : config;
  return Object.freeze(sealed);
}
