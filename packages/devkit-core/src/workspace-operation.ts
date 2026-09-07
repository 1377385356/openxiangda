import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** 本机工作区互斥；部署状态仍由平台持有。异常退出的锁由操作者确认进程退出后处理。 */
export async function withWorkspaceOperation<T>(root: string | undefined, operation: string, execute: () => Promise<T>): Promise<T> {
  const directory = resolve(root || process.cwd(), '.openxiangda');
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, 'operation.lock');
  const token = randomUUID();
  let descriptor: number;
  try { descriptor = openSync(path, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`WORKSPACE_OPERATION_BUSY: 工作区已有检查或部署持有 ${path}；等待其完成。异常退出时先确认锁中进程已退出，再移除锁文件`);
    }
    throw error;
  }
  try { writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token, operation, startedAt: new Date().toISOString() })); }
  catch (error) { unlinkSync(path); throw error; }
  finally { closeSync(descriptor); }
  try { return await execute(); }
  finally {
    if (existsSync(path)) {
      let owner: { token?: string } | undefined;
      try { owner = JSON.parse(readFileSync(path, 'utf8')); } catch { /* 无法识别的锁不自动删除。 */ }
      if (owner?.token === token) unlinkSync(path);
    }
  }
}
