import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommandProcess } from '../src/command-process.js';
import { operationStage, skippedOperationStage, withOperationProgress, type OperationProgress } from '../src/operation-progress.js';
import { observeDeployment, watchDeployment } from '../src/deployment-observer.js';
import type { DeploymentRun, DevkitResult } from 'openxiangda-contracts';
import type { OpenXiangdaApplicationServices } from '../src/application-services.js';

test('real child processes leave the event loop available for bounded progress heartbeats', async () => {
  const events: OperationProgress[] = [];
  const result = await withOperationProgress('check', event => { events.push(event); }, async () => {
    const run = await operationStage('test', '应用测试', () => runCommandProcess(process.execPath, ['-e', 'setTimeout(() => process.stdout.write("完成"), 120)'], { cwd: process.cwd() }));
    return { ok: run.ok, data: run };
  }, 10);
  assert.equal(result.ok, true);
  assert.ok(events.some(event => event.heartbeat && event.state === 'running'));
  assert.equal(events.at(-1)?.state, 'passed');
  assert.ok(events.at(-1)!.durationMs >= 100);
  assert.deepEqual(events.map(event => event.sequence), events.map((_, index) => index + 1));
  assert.equal((result.data as any).execution.stages.length, 1);
  assert.match(result.data.output, /完成/);
});

test('concurrent observers and failing listeners cannot contaminate operations or mask failures', async () => {
  const events: OperationProgress[][] = [[], []];
  const operations = events.map((observed, index) => withOperationProgress(`request-${index}`, event => {
    observed.push(event);
    if (index) return Promise.reject(new Error('notification transport gone'));
    throw new Error('listener failure');
  }, async () => {
    await operationStage('check', '检查', () => runCommandProcess(process.execPath, ['-e', 'setTimeout(() => {}, 50)'], { cwd: process.cwd() }));
    skippedOperationStage('build', '构建');
    return { data: {} };
  }, 10));
  await Promise.all(operations);
  assert.notEqual(events[0]![0]!.operationId, events[1]![0]!.operationId);
  for (const [index, observed] of events.entries()) {
    assert.ok(observed.every(event => event.operation === `request-${index}`));
    assert.equal(observed.at(-1)?.state, 'skipped');
  }
  const failure = Object.freeze(new Error('original failure'));
  await assert.rejects(() => withOperationProgress('error', undefined, () => operationStage('fail', '失败阶段', async () => { throw failure; })), error => error === failure);
  const mutableFailure = new Error('mutable failure');
  await assert.rejects(() => withOperationProgress('error', undefined, () => operationStage('fail', '失败阶段', async () => { throw mutableFailure; })), error => {
    assert.equal((error as any).data.execution.stages[0].state, 'failed'); return error === mutableFailure;
  });
});

test('child failure, missing executable, timeout and large output preserve useful bounded results', async () => {
  const nonzero = await runCommandProcess(process.execPath, ['-e', 'process.stderr.write("failed"); process.exitCode = 2'], { cwd: process.cwd() });
  assert.equal(nonzero.ok, false); assert.equal(nonzero.status, 2); assert.equal(nonzero.output, 'failed');
  const missing = await runCommandProcess('/not-existing/openxiangda-command', [], { cwd: process.cwd() });
  assert.equal(missing.ok, false); assert.equal(missing.error?.code, 'ENOENT');
  const timeout = await runCommandProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: process.cwd(), timeoutMs: 80 });
  assert.equal(timeout.ok, false); assert.equal(timeout.error?.code, 'ETIMEDOUT');
  const large = await runCommandProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(100_000) + "end")'], { cwd: process.cwd(), maximumOutputBytes: 1000 });
  assert.equal(large.ok, true); assert.equal(large.outputTruncated, true); assert.ok(large.output.endsWith('end')); assert.ok(Buffer.byteLength(large.output) < 1200);
});

function run(status: DeploymentRun['status']): DevkitResult<DeploymentRun> {
  return { ok: true, operation: 'deploy', workspace: { appCode: 'demo', root: '/demo' }, diagnostics: [], nextActions: [], data: {
    id: 'original-run', status, stage: status, attempt: 1,
    recovery: { nextCommand: 'openxiangda retry original-run' },
  } as DeploymentRun };
}
test('monitor follows one run through platform stages and surfaces real failures with recovery', async () => {
  const events: OperationProgress[] = [];
  const reads: string[] = [];
  const remaining = [run('deploying'), run('verifying'), run('succeeded')];
  const services = { deploymentStatus: async (_root: unknown, id: string) => { reads.push(id); return remaining.shift()!; } } as unknown as OpenXiangdaApplicationServices;
  const result = await withOperationProgress('deploy', event => { events.push(event); }, () => observeDeployment(services, run('queued'), { pollIntervalMs: 1 }));
  assert.equal(result.ok, true); assert.equal((result.data as DeploymentRun).status, 'succeeded');
  assert.deepEqual(reads, ['original-run', 'original-run', 'original-run']);
  assert.deepEqual(events.filter(event => event.details && !event.heartbeat).slice(0, 4).map(event => event.details?.status), ['queued', 'deploying', 'verifying', 'succeeded']);
  const failed = run('failed');
  failed.data!.failure = { code: 'HEALTH_FAILED', message: '健康检查失败', retryable: true };
  const failure = await observeDeployment(services, failed);
  assert.equal(failure.ok, false); assert.equal(failure.diagnostics[0]!.code, 'HEALTH_FAILED');
  assert.equal((failure.data as DeploymentRun).recovery.nextCommand, 'openxiangda retry original-run');
});

test('observation timeout or disconnected query retains the original run without declaring success', async () => {
  let reads = 0;
  const services = { deploymentStatus: async () => { reads++; throw new Error('network disconnected'); } } as unknown as OpenXiangdaApplicationServices;
  const timeout = await observeDeployment(services, run('queued'), { timeoutMs: 0 });
  assert.equal(reads, 0); assert.equal(timeout.ok, false);
  assert.equal(timeout.diagnostics[0]!.code, 'DEPLOYMENT_OBSERVATION_TIMEOUT');
  assert.equal((timeout.data as DeploymentRun).status, 'queued');
  assert.match(timeout.nextActions[0]!.command!, /status original-run --watch/);
  const disconnected = await observeDeployment(services, run('activating'), { pollIntervalMs: 1 });
  assert.equal(disconnected.ok, false); assert.equal((disconnected.data as DeploymentRun).id, 'original-run');
  assert.equal(reads, 1);
  const watching = await watchDeployment({ deploymentStatus: async () => run('succeeded') } as unknown as OpenXiangdaApplicationServices);
  assert.equal(watching.ok, true);
});
