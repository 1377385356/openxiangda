import { spawn } from 'node:child_process';

// 失败遏制：跟踪本进程派生的全部子进程组。主进程退出或任一门禁失败时
// 必须杀死整棵树——否则孤儿进程（vite/esbuild/playwright webserver）持有
// stdout 管道，会让 CI 步骤在主进程死亡后静默挂起数分钟，掩盖真实死因
// （2026-09-13 三次 CI 无声死亡：主进程瞬时死亡后 7-13 分钟孤儿持管道静默）。
const liveCommands = new Set();

export function stopAllReleaseCommands() {
  for (const terminate of [...liveCommands]) {
    try { terminate('SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  if (!liveCommands.size) return;
  const escalate = setTimeout(() => {
    for (const terminate of [...liveCommands]) {
      try { terminate('SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }, 5000);
  escalate.unref();
}

process.once('exit', () => {
  for (const terminate of [...liveCommands]) {
    try { terminate('SIGKILL'); } catch { /* ESRCH: already gone */ }
  }
});

export function runReleaseCommand(command, args, { cwd, env = process.env, timeoutMs, report = console.log }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('RELEASE_VERIFICATION_BUDGET_EXCEEDED');
  const started = Date.now();
  report(`\n> ${command} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== 'win32';
    const child = spawn(command, args, { cwd, env, detached: grouped, stdio: 'inherit' });
    let interrupted = false, killTimer;
    const kill = signal => {
      if (!child.pid) return;
      try { if (grouped) process.kill(-child.pid, signal); else child.kill(signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    };
    liveCommands.add(kill);
    const stop = () => {
      interrupted = true;
      kill('SIGTERM');
      // Give temporary registry owners time to remove their Docker resources.
      killTimer = setTimeout(() => kill('SIGKILL'), 5000);
      killTimer.unref();
    };
    const timer = setTimeout(stop, timeoutMs);
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    const cleanup = () => {
      liveCommands.delete(kill);
      clearTimeout(timer);
      clearTimeout(killTimer);
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (status, signal) => {
      if (interrupted) kill('SIGKILL');
      cleanup();
      const elapsedMs = Date.now() - started;
      report(`[release-step] ${command} ${args[0] || ''}: ${Math.round(elapsedMs / 1000)}s${interrupted ? ' (timeout/interrupted)' : ''}`);
      if (interrupted || status !== 0) reject(new Error(`RELEASE_STEP_FAILED: ${command} (${interrupted ? 'timeout/interrupted' : signal || status})`));
      else resolve({ elapsedMs });
    });
  });
}
