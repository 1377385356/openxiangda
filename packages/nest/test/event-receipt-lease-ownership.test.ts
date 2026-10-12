import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { SCHEMA_VERSIONS, type EventReceiptCommand } from 'openxiangda-contracts';
import { PlatformOpenXiangdaEventReceiptStore } from '../src/events.js';
import type { OpenXiangdaEventReceiptContext, OpenXiangdaModuleOptions } from '../src/types.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

/** A platform fence that grants a fresh lease only after explicit expiry. */
function platform() {
  const calls: EventReceiptCommand[] = [];
  let token: string | undefined;
  let active = false;
  let attempts = 0;
  let releaseGate: { entered: ReturnType<typeof deferred<void>>; continue: ReturnType<typeof deferred<void>> } | undefined;
  const response = (command: EventReceiptCommand, outcome: string, status: string, claimToken?: string) => new Response(JSON.stringify({
    code: 200,
    data: { schemaVersion: SCHEMA_VERSIONS.eventReceiptResult, eventId: command.eventId,
      deliveryId: command.deliveryId, outcome, status, attempts, ...(claimToken ? { claimToken } : {}) },
  }), { status: 200 });
  const options: OpenXiangdaModuleOptions = {
    appCode: 'receipt-owner-app', platformBaseUrl: 'https://platform.invalid/service', environmentKey: 'preproduction',
    environmentId: randomUUID(), appVersionId: randomUUID(), deploymentRunId: randomUUID(),
    environmentHeadRevision: 1, backendRevisionId: randomUUID(), version: 'candidate',
    eventSigningSecret: 'test-only-receipt-signing-secret', eventReceiptMaxAttempts: 1,
    eventReceiptRetryDelayMs: 0,
    fetch: async (_url, init) => {
      const command = JSON.parse(String(init?.body)) as EventReceiptCommand;
      calls.push(command);
      if (command.action === 'claim') {
        assert.equal(active, false, 'fixture requires expiry before a fresh claim');
        token = randomUUID(); active = true; attempts += 1;
        return response(command, 'claimed', 'processing', token);
      }
      if (command.action === 'release' && releaseGate) {
        const gate = releaseGate; releaseGate = undefined;
        gate.entered.resolve();
        await gate.continue.promise;
      }
      if (!active || command.claimToken !== token) {
        return new Response(JSON.stringify({ code: 409, errorCode: 'EVENT_V2_RECEIPT_CLAIM_LOST' }), { status: 409 });
      }
      active = false;
      return response(command, command.action === 'complete' ? 'completed' : 'released',
        command.action === 'complete' ? 'succeeded' : 'pending');
    },
  };
  const receipt: OpenXiangdaEventReceiptContext = { tenantId: 'tenant', appCode: options.appCode,
    environmentKey: options.environmentKey, subscriptionCode: 'worker', eventId: randomUUID(), deliveryId: randomUUID() };
  const store = new PlatformOpenXiangdaEventReceiptStore(options);
  return {
    receipt, store, calls,
    expire() { active = false; },
    pauseRelease() {
      const gate = { entered: deferred<void>(), continue: deferred<void>() };
      releaseGate = gate;
      return gate;
    },
  };
}

async function reclaimed() {
  const fixture = platform();
  const first = fixture.receipt;
  assert.equal(await fixture.store.claim(first), 'claimed');
  const firstToken = fixture.store.workerClaimToken(first);
  assert.ok(firstToken);
  fixture.expire();
  // Retried delivery has equal protocol fields but a distinct handler receipt.
  const second = { ...first };
  assert.equal(await fixture.store.claim(second), 'claimed');
  const secondToken = fixture.store.workerClaimToken(second);
  assert.ok(secondToken);
  assert.notEqual(firstToken, secondToken);
  return { ...fixture, first, second, firstToken, secondToken };
}

test('a reclaimed event keeps each handler receipt bound to its own token', async () => {
  const fixture = await reclaimed();
  assert.equal(fixture.store.workerClaimToken(fixture.first), fixture.firstToken);
  assert.equal(fixture.store.workerClaimToken(fixture.second), fixture.secondToken);
});

test('late completion cannot complete the newer lease', async () => {
  const fixture = await reclaimed();
  await assert.rejects(fixture.store.complete(fixture.first), /EVENT_V2_RECEIPT_CLAIM_LOST/);
  assert.equal(fixture.calls.at(-1)?.claimToken, fixture.firstToken);
  assert.equal(fixture.store.workerClaimToken(fixture.second), fixture.secondToken);
  await fixture.store.complete(fixture.second);
  assert.equal(fixture.calls.at(-1)?.claimToken, fixture.secondToken);
  assert.equal(fixture.store.workerClaimToken(fixture.second), null);
});

test('late failed release clears only the stale handler receipt', async () => {
  const fixture = await reclaimed();
  await assert.rejects(fixture.store.release(fixture.first), /EVENT_V2_RECEIPT_CLAIM_LOST/);
  assert.equal(fixture.calls.at(-1)?.claimToken, fixture.firstToken);
  assert.equal(fixture.store.workerClaimToken(fixture.first), null);
  assert.equal(fixture.store.workerClaimToken(fixture.second), fixture.secondToken);
  await fixture.store.complete(fixture.second);
});

test('reclaim while a release is awaiting transport cannot erase the new handler token', async () => {
  const fixture = platform();
  assert.equal(await fixture.store.claim(fixture.receipt), 'claimed');
  const firstToken = fixture.store.workerClaimToken(fixture.receipt);
  const gate = fixture.pauseRelease();
  const rejection = assert.rejects(fixture.store.release(fixture.receipt), /EVENT_V2_RECEIPT_CLAIM_LOST/);
  await gate.entered.promise;
  fixture.expire();
  const second = { ...fixture.receipt };
  assert.equal(await fixture.store.claim(second), 'claimed');
  const secondToken = fixture.store.workerClaimToken(second);
  gate.continue.resolve();
  await rejection;
  assert.equal(fixture.calls.find(command => command.action === 'release')?.claimToken, firstToken);
  assert.equal(fixture.store.workerClaimToken(second), secondToken);
  await fixture.store.complete(second);
});

test('an equal receipt that never claimed cannot borrow token authority', async () => {
  const fixture = platform();
  await fixture.store.claim(fixture.receipt);
  const copy = { ...fixture.receipt };
  assert.equal(fixture.store.workerClaimToken(copy), null);
  const before = fixture.calls.length;
  await assert.rejects(fixture.store.complete(copy), /claimToken/);
  assert.equal(fixture.calls.length, before);
  await fixture.store.complete(fixture.receipt);
});
