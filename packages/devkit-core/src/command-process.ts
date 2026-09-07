import { spawn } from 'node:child_process';

/** 异步收集有界输出，让阶段心跳与 MCP 通知在检查、测试和 Docker 构建期间持续执行。 */
export function runCommandProcess(command: string, args: string[], options: {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maximumOutputBytes?: number;
}) {
  return new Promise<{ ok: boolean; status: number | null; output: string; outputTruncated: boolean; error?: NodeJS.ErrnoException }>(resolve => {
    const limit = Math.max(1, options.maximumOutputBytes ?? 4 * 1024 * 1024);
    const chunks: Buffer[] = [];
    let outputBytes = 0;
    let outputTruncated = false;
    let processError: NodeJS.ErrnoException | undefined;
    const child = spawn(command, args, { cwd: options.cwd, env: options.env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = (chunk: Buffer) => {
      chunks.push(chunk); outputBytes += chunk.length;
      while (outputBytes > limit) {
        outputTruncated = true;
        const first = chunks[0]!;
        const excess = outputBytes - limit;
        if (first.length <= excess) { chunks.shift(); outputBytes -= first.length; }
        else { chunks[0] = first.subarray(excess); outputBytes -= excess; }
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      processError = Object.assign(new Error('子进程超过运行时限'), { code: 'ETIMEDOUT' });
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5_000);
      killTimer.unref();
    }, options.timeoutMs ?? 30 * 60_000);
    timer.unref();
    child.on('error', error => { processError = error; });
    child.on('close', status => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        ok: status === 0 && !processError, status,
        output: `${outputTruncated ? '[前段日志超过输出预算，已省略]\n' : ''}${Buffer.concat(chunks, outputBytes).toString('utf8')}`,
        outputTruncated, ...(processError ? { error: processError } : {}),
      });
    });
  });
}
