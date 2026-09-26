import assert from 'node:assert/strict';
import test from 'node:test';
import { CliEventStream } from '../src/cli-events.js';

test('emits one ordered JSONL-compatible event stream per AgentRun', () => {
  const events: Array<Record<string, unknown>> = [];
  const stream = new CliEventStream('run-123', event => {
    events.push(event as unknown as Record<string, unknown>);
  });
  stream.emit('command.started', { operation: 'check' });
  stream.emit('command.status', { operation: 'check', stage: 'test' });
  stream.emit('command.completed', {
    operation: 'check',
    result: { ok: true },
  });

  assert.deepEqual(events.map(event => event.seq), [1, 2, 3]);
  assert.deepEqual(events.map(event => event.runId), [
    'run-123',
    'run-123',
    'run-123',
  ]);
  assert.deepEqual(events.map(event => event.type), [
    'command.started',
    'command.status',
    'command.completed',
  ]);
  for (const event of events) {
    assert.equal(event.schemaVersion, 'openxiangda.cli-event/v1');
    assert.match(String(event.eventId), /^[0-9a-f-]{36}$/);
    assert.equal(Number.isNaN(Date.parse(String(event.timestamp))), false);
  }
});

test('bounds the externally supplied AgentRun identifier', () => {
  assert.throws(
    () => new CliEventStream('x'.repeat(257), () => undefined),
    /CLI_RUN_ID_INVALID/
  );
});
