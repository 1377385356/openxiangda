import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

export function acquireReleaseProcessLock(path) {
  const token = randomUUID();
  let descriptor;
  try { descriptor = openSync(path, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') {
      // 持有者进程已死（如被 SIGKILL 的 runner/终端）时锁是残留物：
      // 探活后自动回收，避免人工核对 pid 再手动删锁。
      let stale = false;
      try {
        const owner = JSON.parse(readFileSync(path, 'utf8'));
        stale = typeof owner?.pid === 'number' && !processAlive(owner.pid);
      } catch {
        stale = true; // 损坏的锁文件同样按残留处理
      }
      if (stale) {
        unlinkSync(path);
        try { descriptor = openSync(path, 'wx', 0o600); }
        catch (retryError) {
          if (retryError.code === 'EEXIST') throw new Error(`RELEASE_PROCESS_BUSY: 当前 checkout 已有验证或发布进程持有 ${path}；等待其结束。`);
          throw retryError;
        }
      } else {
        throw new Error(`RELEASE_PROCESS_BUSY: 当前 checkout 已有验证或发布进程持有 ${path}；等待其结束。异常退出时确认锁内进程已退出后再移除锁`);
      }
    } else {
      throw error;
    }
  }
  try { writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() })); }
  catch (error) { unlinkSync(path); throw error; }
  finally { closeSync(descriptor); }
  return () => {
    if (!existsSync(path)) return;
    let owner;
    try { owner = JSON.parse(readFileSync(path, 'utf8')); } catch { return; }
    if (owner.token === token) unlinkSync(path);
  };
}
