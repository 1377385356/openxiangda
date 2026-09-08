import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { Inject, Injectable, Module, Scope, type Provider, type Type } from '@nestjs/common';
import { DiscoveryModule, NestFactory, REQUEST } from '@nestjs/core';
import {
  SCHEMA_VERSIONS,
  eventDeliverySignatureContentV2,
  sha256Digest,
  type AppEventHandlerContract,
  type CloudEvent,
} from 'openxiangda-contracts';
import { OpenXiangdaApplicationCredentials } from '../src/application-credentials.js';
import { OpenXiangdaBusinessNotificationService } from '../src/business-notification.js';
import { OpenXiangdaEventContext, type OpenXiangdaEventHandlerContext } from '../src/event-context.js';
import {
  OpenXiangdaEventController, OpenXiangdaEventHandler, OpenXiangdaEventRegistry,
} from '../src/event-handler.js';
import { InMemoryOpenXiangdaEventReceiptStore, OpenXiangdaEventReceiver } from '../src/events.js';
import { OpenXiangdaPlatformClient } from '../src/platform-client.js';
import { OPENXIANGDA_EVENT_RECEIPT_STORE, OPENXIANGDA_MODULE_OPTIONS } from '../src/tokens.js';
import type { OpenXiangdaModuleOptions } from '../src/types.js';

const appCode = 'scope-test';
const secret = 'isolated-scope-test-signing-key';
const declaration = (code: string): AppEventHandlerContract => ({
  code, endpointPath: `/__platform/events/${code}`,
  eventTypes: [`${appCode}.created.v1`], dataSchemaVersions: ['1.0.0'],
  maxBodyBytes: 65_536, receiptProtocolVersion: 2,
});

async function fixture(
  handlers: AppEventHandlerContract[], providers: Provider[], imports: Type[] = [],
  fetch?: typeof globalThis.fetch
) {
  const manifest = { schemaVersion: SCHEMA_VERSIONS.eventHandlerManifest, appCode, handlers };
  const options: OpenXiangdaModuleOptions = {
    appCode, environmentKey: 'preproduction', platformBaseUrl: 'https://scope.invalid/service',
    eventHandlerManifest: manifest, eventSigningSecret: secret,
    oauthClient: { clientId: 'isolated-client', clientSecret: 'isolated-secret', scopes: ['notification:send'] },
    eventSchemas: [{ owner: 'application', eventType: `${appCode}.created.v1`,
      dataSchemaVersion: '1.0.0', jsonSchema: {
        type: 'object', required: ['recipients', 'title'], properties: {
          recipients: { type: 'array', minItems: 1, items: { type: 'string' } },
          title: { type: 'string' },
        },
      } }],
    fetch,
  };
  class FixtureModule {}
  Module({ imports: [DiscoveryModule, ...imports], providers: [
    OpenXiangdaEventRegistry, OpenXiangdaEventReceiver, OpenXiangdaEventController,
    OpenXiangdaBusinessNotificationService, OpenXiangdaEventContext,
    OpenXiangdaApplicationCredentials, OpenXiangdaPlatformClient,
    { provide: OPENXIANGDA_MODULE_OPTIONS, useValue: options },
    { provide: OPENXIANGDA_EVENT_RECEIPT_STORE, useValue: new InMemoryOpenXiangdaEventReceiptStore() },
    ...providers,
  ] })(FixtureModule);
  const app = await NestFactory.createApplicationContext(FixtureModule, { logger: false, abortOnError: false });
  const controller = app.get(OpenXiangdaEventController);
  const packet = (code: string, id: string, deliveryId = `${id}:delivery`, overrides: Partial<CloudEvent> = {}) => {
    const event = { specversion: '1.0', id, type: `${appCode}.created.v1`, source: '/scope-test',
      time: new Date().toISOString(), tenantid: 'tenant-1', appcode: appCode, environment: 'preproduction',
      datacontenttype: 'application/json', schemaversion: '1.0.0', traceid: `trace:${id}`,
      data: { recipients: ['user-1'], title: id }, ...overrides };
    const rawBody = Buffer.from(JSON.stringify(event));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const digest = sha256Digest(manifest);
    const signature = createHmac('sha256', secret).update(eventDeliverySignatureContentV2({
      timestamp, signingKeyVersion: '1', deliveryId, eventId: id, subscriptionCode: code,
      handlerManifestDigest: digest, rawBody: rawBody.toString('utf8'),
    })).digest('hex');
    return { rawBody, headers: {
      'content-type': 'application/cloudevents+json', 'x-openxiangda-subscription-code': code,
      'x-openxiangda-timestamp': timestamp, 'x-openxiangda-signature': `v2=${signature}`,
      'x-openxiangda-delivery-id': deliveryId, 'x-openxiangda-event-id': id,
      'x-openxiangda-signing-key-version': '1', 'x-openxiangda-handler-manifest-digest': digest,
    } };
  };
  return { app, packet, deliver: (code: string, value: ReturnType<typeof packet>) =>
    controller.deliver(code, value.headers, value) };
}

test('signed event consumers resolve scoped notifications only after validation and claim', async () => {
  const contract = declaration('notifications');
  const consumers: Consumer[] = [];
  const outgoing: Array<{ headers: Headers; body: any }> = [];
  let failNext = false;
  let unblock: (() => void) | undefined;
  let entered: (() => void) | undefined;
  let pause: Promise<void> | undefined;
  class Consumer {
    constructor(readonly notifications: OpenXiangdaBusinessNotificationService, readonly request: object) {
      consumers.push(this);
    }
    handle = async (event: CloudEvent, context: OpenXiangdaEventHandlerContext) => {
      assert.deepEqual(this.request, {});
      assert.equal(Object.isFrozen(this.request), true);
      assert.equal(event.id, context.eventId);
      if (pause) { entered?.(); await pause; }
      await new Promise(resolve => setImmediate(resolve));
      return this.notifications.sendFromEvent({
        schemaVersion: 'openxiangda.notification.event-send/v2', correlationId: event.id,
        messageKey: 'notice', recipientPaths: ['recipients'], titlePath: 'title',
        navigationTarget: { kind: 'APP_ROUTE', access: 'AUTHENTICATED',
          routeCodes: { desktop: 'detail', mobile: 'mobile-detail' }, pathParams: { id: event.id } },
        idempotencyKey: `${context.idempotencyKey}:notice`,
      });
    };
  }
  Inject(OpenXiangdaBusinessNotificationService)(Consumer, undefined, 0);
  Inject(REQUEST)(Consumer, undefined, 1);
  Injectable()(Consumer);
  OpenXiangdaEventHandler(contract)(Consumer);
  const f = await fixture([contract], [Consumer], [], async (url, init) => {
    if (String(url).endsWith('/oauth2/token')) return Response.json({
      access_token: 'isolated-application-token', token_type: 'Bearer', expires_in: 3600,
    });
    assert.ok(String(url).endsWith('/notification-hub/send/event-consumer'));
    outgoing.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    if (failNext) {
      failNext = false;
      return Response.json({ code: 503, errorCode: 'TRANSIENT_TEST' }, { status: 503 });
    }
    return Response.json({ code: 200, data: { id: 'notification' } });
  });
  try {
    assert.equal(consumers.length, 0);
    const tampered = f.packet(contract.code, 'tampered');
    tampered.headers['x-openxiangda-signature'] = `v2=${'0'.repeat(64)}`;
    await assert.rejects(f.deliver(contract.code, tampered), /签名无效/);
    for (const overrides of [{ appcode: 'other' }, { environment: 'production' }, { data: {} }]) {
      await assert.rejects(f.deliver(contract.code, f.packet(contract.code, 'invalid', undefined, overrides)));
    }
    assert.equal(consumers.length, 0);
    const first = await f.deliver(contract.code, f.packet(contract.code, 'first'));
    assert.equal(first.duplicate, false);
    assert.equal((await f.deliver(contract.code, f.packet(contract.code, 'first', 'replay'))).duplicate, true);
    assert.equal(consumers.length, 1);
    await assert.rejects(consumers[0]!.notifications.sendFromEvent({} as any), /EVENT_CONTEXT_REQUIRED/);
    await assert.rejects(consumers[0]!.notifications.send({} as any), /CONTEXT_NOT_VERIFIED/);

    await Promise.all(['parallel-a', 'parallel-b'].map(id => f.deliver(contract.code, f.packet(contract.code, id))));
    assert.notEqual(consumers[1], consumers[2]);
    assert.notEqual(consumers[1]!.notifications, consumers[2]!.notifications);
    assert.notEqual(consumers[1]!.request, consumers[2]!.request);
    failNext = true;
    await assert.rejects(f.deliver(contract.code, f.packet(contract.code, 'retry')), { code: 'TRANSIENT_TEST' });
    await f.deliver(contract.code, f.packet(contract.code, 'retry', 'retry-delivery'));
    const retries = outgoing.filter(item => item.body.correlationId === 'retry');
    assert.equal(retries.length, 2);
    assert.deepEqual(retries[0]!.body, retries[1]!.body);
    assert.notEqual(retries[0]!.headers.get('x-openxiangda-origin-delivery-id'), retries[1]!.headers.get('x-openxiangda-origin-delivery-id'));

    const started = new Promise<void>(resolve => { entered = resolve; });
    pause = new Promise<void>(resolve => { unblock = resolve; });
    const inFlight = f.deliver(contract.code, f.packet(contract.code, 'busy'));
    await started;
    const beforeBusy = consumers.length;
    await assert.rejects(f.deliver(contract.code, f.packet(contract.code, 'busy', 'busy-second')),
      (error: any) => error.getResponse().code === 'OPENXIANGDA_EVENT_RECEIPT_BUSY' && error.getStatus() === 425);
    assert.equal(consumers.length, beforeBusy);
    unblock!();
    await inFlight;
    assert.equal(f.app.get(OpenXiangdaEventContext).current(), null);
    for (const { headers, body } of outgoing) {
      assert.equal(headers.get('authorization'), 'Bearer isolated-application-token');
      assert.equal(headers.get('x-openxiangda-causation-event-id'), body.correlationId);
      assert.equal(headers.get('x-openxiangda-origin-subscription-code'), contract.code);
      assert.equal(headers.get('x-openxiangda-trace-id'), `trace:${body.correlationId}`);
      assert.equal(headers.get('x-openxiangda-business-action-code'), null);
      assert.equal(body.environmentKey, 'preproduction');
      assert.equal(body.idempotencyKey, `${body.correlationId}:notice`);
    }
  } finally { unblock?.(); await f.app.close(); }
});

test('event resolution retains module ownership with repeated provider tokens', async () => {
  const contracts = [declaration('module-a'), declaration('module-b')];
  const calls: string[] = [];
  const imports = contracts.map(contract => {
    class Consumer {
      constructor(readonly label: string, readonly request: object) {}
      handle = () => { assert.deepEqual(this.request, {}); calls.push(this.label); };
    }
    Inject('label')(Consumer, undefined, 0);
    Inject(REQUEST)(Consumer, undefined, 1);
    Injectable()(Consumer);
    OpenXiangdaEventHandler(contract)(Consumer);
    class OwnerModule {}
    Module({ providers: [
      { provide: 'repeated-handler-token', useClass: Consumer },
      { provide: 'label', useValue: contract.code },
    ] })(OwnerModule);
    return OwnerModule;
  });
  const f = await fixture(contracts, [], imports);
  try {
    await Promise.all(contracts.map(contract => f.deliver(contract.code, f.packet(contract.code, contract.code))));
    assert.deepEqual(calls.sort(), ['module-a', 'module-b']);
  } finally { await f.app.close(); }
});

test('Nest reuses static consumers and initializes transient class-field handlers per attempt', async () => {
  const contracts = [declaration('static'), declaration('transient')];
  let staticCount = 0;
  let transientCount = 0;
  let handled = 0;
  class StaticConsumer {
    constructor() { staticCount++; }
    handle = () => { handled++; };
  }
  class TransientConsumer {
    constructor() { transientCount++; }
    handle = () => { handled++; };
  }
  Injectable()(StaticConsumer);
  Injectable({ scope: Scope.TRANSIENT })(TransientConsumer);
  OpenXiangdaEventHandler(contracts[0]!)(StaticConsumer);
  OpenXiangdaEventHandler(contracts[1]!)(TransientConsumer);
  const f = await fixture(contracts, [StaticConsumer, TransientConsumer]);
  try {
    assert.equal(staticCount, 1);
    assert.equal(transientCount, 0);
    for (const contract of contracts) for (const id of ['a', 'b']) {
      await f.deliver(contract.code, f.packet(contract.code, `${contract.code}:${id}`));
    }
    assert.equal(staticCount, 1);
    assert.equal(transientCount, 2);
    assert.equal(handled, 4);
  } finally { await f.app.close(); }
});

test('dependency resolution failure releases the original receipt for a fresh scope', async () => {
  const contract = declaration('resolution-retry');
  let attempts = 0;
  let handled = 0;
  class Consumer {
    constructor(readonly dependency: object) {}
    handle = () => { handled++; };
  }
  Inject('fallible-dependency')(Consumer, undefined, 0);
  Injectable()(Consumer);
  OpenXiangdaEventHandler(contract)(Consumer);
  const f = await fixture([contract], [Consumer, {
    provide: 'fallible-dependency', scope: Scope.REQUEST,
    useFactory: () => { if (++attempts === 1) throw new Error('resolution failed'); return {}; },
  }]);
  try {
    await assert.rejects(f.deliver(contract.code, f.packet(contract.code, 'same-event')), /resolution failed/);
    await f.deliver(contract.code, f.packet(contract.code, 'same-event', 'next-delivery'));
    assert.equal(attempts, 2);
    assert.equal(handled, 1);
  } finally { await f.app.close(); }
});
