import type { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

export interface OpenXiangdaApplicationBootstrapOptions {
  port?: number;
  host?: string;
  trustProxy?: boolean;
}

const STRUCTURED_CLOUD_EVENT_CONTENT_TYPE = 'application/cloudevents+json';
const STRUCTURED_CLOUD_EVENT_BODY_LIMIT = 65_536;

class OpenXiangdaFastifyAdapter extends FastifyAdapter {
  override registerParserMiddleware(prefix?: string, rawBody?: boolean): void {
    super.registerParserMiddleware(prefix, rawBody);

    const fastify = this.getInstance();
    const { onProtoPoisoning, onConstructorPoisoning } = fastify.initialConfig;
    const jsonParser = fastify.getDefaultJsonParser(
      onProtoPoisoning ?? 'error',
      onConstructorPoisoning ?? 'error'
    );
    this.useBodyParser(
      STRUCTURED_CLOUD_EVENT_CONTENT_TYPE,
      rawBody === true,
      { bodyLimit: STRUCTURED_CLOUD_EVENT_BODY_LIMIT },
      (request, body, done) =>
        jsonParser(request, body.toString('utf8'), done)
    );
  }
}

/**
 * Starts the canonical OpenXiangda 2.0 NestJS runtime.
 *
 * Raw body capture is part of the gateway assertion contract, so applications
 * must not reproduce the NestFactory/Fastify setup themselves.
 */
export async function bootstrapOpenXiangdaApplication(
  rootModule: Type<unknown>,
  options: OpenXiangdaApplicationBootstrapOptions = {}
): Promise<NestFastifyApplication> {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('OPENXIANGDA_BOOTSTRAP_OPTIONS_OBJECT_REQUIRED');
  }
  const allowedOptionKeys = new Set(['port', 'host', 'trustProxy']);
  const unknownOption = Object.keys(options).find(
    key => !allowedOptionKeys.has(key)
  );
  if (unknownOption) {
    throw new Error(`OPENXIANGDA_BOOTSTRAP_OPTION_UNKNOWN:${unknownOption}`);
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    rootModule,
    new OpenXiangdaFastifyAdapter({
      trustProxy: options.trustProxy ?? true,
    }),
    { rawBody: true }
  );
  app.enableShutdownHooks();
  const production = process.env.NODE_ENV === 'production';
  const port =
    options.port ??
    Number(process.env.OPENXIANGDA_APP_PORT || process.env.PORT || 3000);
  const host = options.host ?? (production ? '0.0.0.0' : '127.0.0.1');
  await app.listen(port, host);
  return app;
}
