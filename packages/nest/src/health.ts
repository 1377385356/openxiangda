import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OPENXIANGDA_CONTRACT_VERSION } from 'openxiangda-contracts';
import { OpenXiangdaPlatformClient } from './platform-client.js';
import { OPENXIANGDA_MODULE_OPTIONS } from './tokens.js';
import type { OpenXiangdaModuleOptions } from './types.js';
import { OpenXiangdaInfrastructureController } from './infrastructure-controller.js';

@OpenXiangdaInfrastructureController()
@Controller('__platform')
export class OpenXiangdaPlatformController {
  constructor(
    @Inject(OPENXIANGDA_MODULE_OPTIONS)
    private readonly options: OpenXiangdaModuleOptions,
    @Inject(OpenXiangdaPlatformClient)
    private readonly platform: OpenXiangdaPlatformClient
  ) {}

  @Get('health')
  health() {
    return { status: 'ok' as const };
  }

  @Get('ready')
  ready() {
    return {
      status: 'ready' as const,
      appCode: this.options.appCode,
      environmentKey: this.options.environmentKey,
      environmentId: this.options.environmentId,
      appVersionId: this.options.appVersionId,
      deploymentRunId: this.options.deploymentRunId,
      environmentHeadRevision: this.options.environmentHeadRevision,
      backendRevisionId: this.options.backendRevisionId,
      contractVersion: OPENXIANGDA_CONTRACT_VERSION,
    };
  }

  @Get('dependencies/platform')
  async platformDependency() {
    try {
      const capabilities = await this.platform.capabilities();
      if (capabilities.contractVersion !== OPENXIANGDA_CONTRACT_VERSION) {
        throw new Error(
          `contract mismatch: ${capabilities.contractVersion}`
        );
      }
      return {
        status: 'ready' as const,
        dependency: 'platform' as const,
        platformVersion: capabilities.platformVersion,
        contractVersion: capabilities.contractVersion,
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        dependency: 'platform',
        reason: (error as Error)?.message || 'platform unavailable',
      });
    }
  }

  @Get('version')
  version() {
    return {
      appCode: this.options.appCode,
      environmentKey: this.options.environmentKey,
      version: this.options.version,
      gitSha: this.options.gitSha || null,
      buildId: this.options.buildId || null,
      contractVersion: OPENXIANGDA_CONTRACT_VERSION,
    };
  }
}
