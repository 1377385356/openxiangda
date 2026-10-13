import assert from 'node:assert/strict';
import test from 'node:test';
import Status from '../src/commands/status.js';

test('status routes an explicit run to read-only preview and never status-watch or retry', async () => {
  const command: any = Object.create(Status.prototype);
  command.parse = async () => ({ args: { deploymentId: 'original-run' }, flags: { cwd: '/workspace', 'workflow-exceptions': true } });
  let calls = 0;
  command.services = { deploymentWorkflowPreview: async (root: string, id: string) => {
    calls++; assert.equal(root, '/workspace'); assert.equal(id, 'original-run'); return { activationPermission: 'not-granted' };
  } };
  command.present = (value: unknown) => value;
  assert.deepEqual(await command.run(), { activationPermission: 'not-granted' });
  assert.equal(calls, 1);
  assert.deepEqual(Status.flags['workflow-exceptions'].exclusive, ['watch']);
});
test('preview refuses to guess the latest deployment when the original id is omitted', async () => {
  const command: any = Object.create(Status.prototype);
  command.parse = async () => ({ args: {}, flags: { 'workflow-exceptions': true } });
  command.services = new Proxy({}, { get() { throw new Error('Unexpected service call'); } });
  await assert.rejects(command.run(), /DEPLOYMENT_ID_REQUIRED/);
});
