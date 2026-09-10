import { spawn } from 'node:child_process';

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
    const cleanup = () => { clearTimeout(timer); clearTimeout(killTimer); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); };
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
