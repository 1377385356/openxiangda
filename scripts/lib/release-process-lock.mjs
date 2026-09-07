import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

export function acquireReleaseProcessLock(path) {
  const token = randomUUID();
  let descriptor;
  try { descriptor = openSync(path, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`RELEASE_PROCESS_BUSY: 当前 checkout 已有验证或发布进程持有 ${path}；等待其结束。异常退出时确认锁内进程已退出后再移除锁`);
    throw error;
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
