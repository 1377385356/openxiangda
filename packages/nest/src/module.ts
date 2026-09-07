import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule, Reflector } from '@nestjs/core';
import {
  OpenXiangdaAssigneeProviderController,
  OpenXiangdaAssigneeProviderReceiver,
  OpenXiangdaAssigneeProviderRegistry,
} from './assignee-provider.js';
import { OpenXiangdaApplicationCredentials } from './application-credentials.js';
import { OpenXiangdaBusinessNotificationService } from './business-notification.js';
import { OpenXiangdaBusinessDirectoryService } from './business-directory.js';
import { OpenXiangdaBusinessProcessService } from './business-process.js';
import { OpenXiangdaAuthzGuard } from './authz.js';
import {
  OpenXiangdaApplicationDataApiService,
  OpenXiangdaBusinessDataApiService,
  OpenXiangdaDataApiService,
} from './data-api.js';
import { OpenXiangdaPlatformController } from './health.js';
import {
  OpenXiangdaGatewayAssertionVerifier,
  OpenXiangdaGatewayTransportGuard,
} from './gateway-transport.js';
import {
  OpenXiangdaEventReceiver,
  PlatformOpenXiangdaEventReceiptStore,
} from './events.js';
import { OpenXiangdaEventContext } from './event-context.js';
import {
  OpenXiangdaEventController,
  OpenXiangdaEventRegistry,
} from './event-handler.js';
import { OpenXiangdaPlatformClient } from './platform-client.js';
import { OpenXiangdaNotificationService } from './notification.js';
import { OpenXiangdaTodoService } from './todo.js';
import { OpenXiangdaLoggerService } from './logger.js';
import { OpenXiangdaWorkflowService } from './workflow.js';
import {
  OpenXiangdaRuntimeLeaseService,
  OpenXiangdaRuntimeSecrets,
} from './runtime.js';
import { OpenXiangdaStandardOperations } from './standard-operations.js';
import {
  OPENXIANGDA_EVENT_RECEIPT_STORE,
  OPENXIANGDA_MODULE_OPTIONS,
} from './tokens.js';
import type {
  OpenXiangdaApplicationModuleOptions,
  OpenXiangdaModuleOptions,
} from './types.js';

const APPLICATION_OPTION_KEYS = new Set([
  'requestTimeoutMs',
  'eventSigningSecret',
  'eventSigningSecrets',
  'eventMaxAgeSeconds',
  'eventReceiptMaxAttempts',
  'eventReceiptRetryDelayMs',
  'eventHandlerManifest',
  'eventSchemas',
  'workflowAssigneeProviderSecrets',
  'workflowAssigneeProviderMaxAgeSeconds',
  'eventReceiptStore',
  'fetch',
]);

const PLATFORM_RUNTIME_OPTION_KEYS = new Set([
  'appCode',
  'platformBaseUrl',
  'environmentKey',
  'environmentId',
  'appVersionId',
  'deploymentRunId',
  'environmentHeadRevision',
  'backendRevisionId',
  'version',
  'gitSha',
  'buildId',
  'connectedDevelopment',
  'oauthClient',
  'runtimeInstanceId',
]);

@Global()
@Module({})
export class OpenXiangdaModule {
  static forApplication(
    applicationOptions: OpenXiangdaApplicationModuleOptions
  ): DynamicModule {
    const options = runtimeOptionsFromEnvironment(applicationOptions);
    validateOptions(options);
    return {
      module: OpenXiangdaModule,
      global: true,
      imports: [DiscoveryModule],
      controllers: [
        OpenXiangdaPlatformController,
        OpenXiangdaAssigneeProviderController,
        OpenXiangdaEventController,
      ],
      providers: [
        { provide: OPENXIANGDA_MODULE_OPTIONS, useValue: Object.freeze(options) },
        {
          provide: OPENXIANGDA_EVENT_RECEIPT_STORE,
          useValue:
            options.eventReceiptStore ||
            new PlatformOpenXiangdaEventReceiptStore(options),
        },
        OpenXiangdaPlatformClient,
        Reflector,
        OpenXiangdaGatewayAssertionVerifier,
        OpenXiangdaGatewayTransportGuard,
        {
          provide: APP_GUARD,
          useExisting: OpenXiangdaGatewayTransportGuard,
        },
        OpenXiangdaApplicationCredentials,
        OpenXiangdaRuntimeLeaseService,
        OpenXiangdaRuntimeSecrets,
        OpenXiangdaAuthzGuard,
        {
          provide: APP_GUARD,
          useExisting: OpenXiangdaAuthzGuard,
        },
        OpenXiangdaDataApiService,
        OpenXiangdaBusinessDataApiService,
        OpenXiangdaBusinessDirectoryService,
        OpenXiangdaBusinessProcessService,
        OpenXiangdaStandardOperations,
        OpenXiangdaApplicationDataApiService,
        OpenXiangdaEventReceiver,
        OpenXiangdaEventContext,
        OpenXiangdaEventRegistry,
        OpenXiangdaNotificationService,
        OpenXiangdaBusinessNotificationService,
        OpenXiangdaWorkflowService,
        OpenXiangdaTodoService,
        OpenXiangdaLoggerService,
        OpenXiangdaAssigneeProviderReceiver,
        OpenXiangdaAssigneeProviderRegistry,
      ],
      exports: [
        OPENXIANGDA_MODULE_OPTIONS,
        OpenXiangdaPlatformClient,
        OpenXiangdaApplicationCredentials,
        OpenXiangdaRuntimeLeaseService,
        OpenXiangdaRuntimeSecrets,
        OpenXiangdaAuthzGuard,
        OpenXiangdaDataApiService,
        OpenXiangdaBusinessDataApiService,
        OpenXiangdaBusinessDirectoryService,
        OpenXiangdaBusinessProcessService,
        OpenXiangdaStandardOperations,
        OpenXiangdaApplicationDataApiService,
        OpenXiangdaEventReceiver,
        OpenXiangdaEventContext,
        OpenXiangdaEventRegistry,
        OpenXiangdaNotificationService,
        OpenXiangdaBusinessNotificationService,
        OpenXiangdaWorkflowService,
        OpenXiangdaTodoService,
        OpenXiangdaLoggerService,
        OpenXiangdaAssigneeProviderReceiver,
        OpenXiangdaAssigneeProviderRegistry,
        OPENXIANGDA_EVENT_RECEIPT_STORE,
      ],
    };
  }
}

function runtimeOptionsFromEnvironment(
  applicationOptions: OpenXiangdaApplicationModuleOptions
): OpenXiangdaModuleOptions {
  if (
    !applicationOptions ||
    typeof applicationOptions !== 'object' ||
    Array.isArray(applicationOptions)
  ) {
    throw new Error('OPENXIANGDA_APPLICATION_OPTIONS_OBJECT_REQUIRED');
  }
  for (const key of Object.keys(applicationOptions)) {
    if (PLATFORM_RUNTIME_OPTION_KEYS.has(key)) {
      throw new Error(
        key === 'oauthClient'
          ? 'OPENXIANGDA_APPLICATION_MANUAL_OAUTH_FORBIDDEN'
          : `OPENXIANGDA_APPLICATION_MANUAL_IDENTITY_FORBIDDEN:${key}`
      );
    }
    if (!APPLICATION_OPTION_KEYS.has(key)) {
      throw new Error(`OPENXIANGDA_APPLICATION_OPTION_UNKNOWN:${key}`);
    }
  }
  const required = {
    appCode: process.env.OPENXIANGDA_APP_CODE,
    platformBaseUrl: process.env.OPENXIANGDA_PLATFORM_BASE_URL,
    environmentKey: process.env.OPENXIANGDA_ENVIRONMENT_KEY,
    environmentId: process.env.OPENXIANGDA_ENVIRONMENT_ID,
    appVersionId: process.env.OPENXIANGDA_APP_VERSION_ID,
    deploymentRunId: process.env.OPENXIANGDA_DEPLOYMENT_RUN_ID,
    environmentHeadRevision:
      process.env.OPENXIANGDA_ENVIRONMENT_HEAD_REVISION,
    backendRevisionId: process.env.OPENXIANGDA_BACKEND_REVISION_ID,
    version: process.env.OPENXIANGDA_APP_VERSION,
  } as const;
  const present = Object.values(required).filter(
    value => String(value || '').trim().length > 0
  ).length;
  if (present !== Object.keys(required).length) {
    throw new Error(
      present === 0
        ? 'OPENXIANGDA_RUNTIME_DESCRIPTOR_REQUIRED'
        : 'OPENXIANGDA_RUNTIME_DESCRIPTOR_INCOMPLETE'
    );
  }
  const connectedRaw = String(
    process.env.OPENXIANGDA_CONNECTED_DEV || 'false'
  ).trim();
  if (!['true', 'false'].includes(connectedRaw)) {
    throw new Error('OPENXIANGDA_CONNECTED_DEV_INVALID');
  }
  const oauthEnvironment = {
    clientId: process.env.OPENXIANGDA_OAUTH_CLIENT_ID,
    clientSecret: process.env.OPENXIANGDA_OAUTH_CLIENT_SECRET,
    scopes: process.env.OPENXIANGDA_OAUTH_SCOPES,
  };
  const oauthPresent = Object.values(oauthEnvironment).filter(
    value => String(value || '').trim().length > 0
  ).length;
  if (oauthPresent !== 0 && oauthPresent !== 3) {
    throw new Error('OPENXIANGDA_OAUTH_RUNTIME_DESCRIPTOR_INCOMPLETE');
  }
  const oauthScopes = String(oauthEnvironment.scopes || '')
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
  if (oauthPresent === 3 && oauthScopes.length === 0) {
    throw new Error('OPENXIANGDA_OAUTH_RUNTIME_SCOPES_REQUIRED');
  }
  const options: OpenXiangdaModuleOptions = {
    ...applicationOptions,
    appCode: String(required.appCode),
    platformBaseUrl: String(required.platformBaseUrl),
    environmentKey: String(required.environmentKey),
    environmentId: String(required.environmentId),
    appVersionId: String(required.appVersionId),
    deploymentRunId: String(required.deploymentRunId),
    environmentHeadRevision: Number(required.environmentHeadRevision),
    backendRevisionId: String(required.backendRevisionId),
    version: String(required.version),
    connectedDevelopment: connectedRaw === 'true',
    ...(process.env.OPENXIANGDA_GIT_SHA
      ? { gitSha: process.env.OPENXIANGDA_GIT_SHA }
      : {}),
    ...(process.env.OPENXIANGDA_BUILD_ID
      ? { buildId: process.env.OPENXIANGDA_BUILD_ID }
      : {}),
    ...(process.env.OPENXIANGDA_RUNTIME_INSTANCE_ID
      ? { runtimeInstanceId: process.env.OPENXIANGDA_RUNTIME_INSTANCE_ID }
      : {}),
    ...(oauthPresent === 3
      ? {
          oauthClient: {
            clientId: String(oauthEnvironment.clientId),
            clientSecret: String(oauthEnvironment.clientSecret),
            scopes: oauthScopes,
          },
        }
      : {}),
  };
  if (
    options.eventHandlerManifest &&
    options.eventHandlerManifest.appCode !== options.appCode
  ) {
    throw new Error('OPENXIANGDA_RUNTIME_APP_CONTRACT_MISMATCH');
  }
  return options;
}

function validateOptions(options: OpenXiangdaModuleOptions) {
  if (
    options.eventReceiptStore &&
    !['test', 'unittest'].includes(String(process.env.NODE_ENV || ''))
  ) {
    throw new Error(
      'OpenXiangdaModule.eventReceiptStore 只允许测试；生产必须使用平台持久 receipt'
    );
  }
  for (const key of [
    'appCode',
    'platformBaseUrl',
    'environmentKey',
    'environmentId',
    'appVersionId',
    'deploymentRunId',
    'backendRevisionId',
    'version',
  ] as const) {
    if (!String(options?.[key] || '').trim()) {
      throw new Error(`OpenXiangdaModule.${key} 不能为空`);
    }
  }
  let url: URL;
  try {
    url = new URL(options.platformBaseUrl);
  } catch {
    throw new Error('OpenXiangdaModule.platformBaseUrl 必须是有效 URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('OpenXiangdaModule.platformBaseUrl 只允许 HTTP(S)');
  }
  if (!['local', 'preproduction', 'production'].includes(options.environmentKey)) {
    throw new Error('OpenXiangdaModule.environmentKey 无效');
  }
  if (
    options.connectedDevelopment &&
    !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  ) {
    throw new Error(
      'OpenXiangdaModule.connectedDevelopment 只允许使用 loopback platformBaseUrl'
    );
  }
  if (
    !Number.isSafeInteger(options.environmentHeadRevision) ||
    options.environmentHeadRevision < 1
  ) {
    throw new Error('OpenXiangdaModule.environmentHeadRevision 必须是正整数');
  }
  if (options.oauthClient) {
    if (!String(options.oauthClient.clientId || '').trim()) {
      throw new Error('OpenXiangdaModule.oauthClient.clientId 不能为空');
    }
    if (!String(options.oauthClient.clientSecret || '')) {
      throw new Error('OpenXiangdaModule.oauthClient.clientSecret 不能为空');
    }
    if (String(options.oauthClient.clientId).includes(':')) {
      throw new Error('OpenXiangdaModule.oauthClient.clientId 不能包含冒号');
    }
    for (const scope of options.oauthClient.scopes || []) {
      if (!/^[A-Za-z0-9*._:-]+$/.test(String(scope))) {
        throw new Error('OpenXiangdaModule.oauthClient.scopes 包含非法 scope');
      }
    }
  }
}
