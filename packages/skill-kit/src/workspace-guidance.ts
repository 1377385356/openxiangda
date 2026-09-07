import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BEGIN = '<!-- OPENXIANGDA:BEGIN -->';
const END = '<!-- OPENXIANGDA:END -->';
function managedBlock(text: string) {
  if (text.split(BEGIN).length !== 2 || text.split(END).length !== 2 || text.indexOf(END) < text.indexOf(BEGIN)) {
    throw new Error('WORKSPACE_GUIDANCE_MARKERS_INVALID: 平台约定区块缺失、重复或次序错误');
  }
  return { start: text.indexOf(BEGIN), end: text.indexOf(END) + END.length };
}

/** 仅更新平台托管区块；旧项目没有边界时写候选文件，不猜测用户文字归属。 */
export function refreshWorkspaceGuidance(root: string, template: string) {
  const markers = managedBlock(template);
  const block = template.slice(markers.start, markers.end);
  const directory = resolve(root, '.openxiangda');
  mkdirSync(directory, { recursive: true });
  const lock = resolve(directory, 'guidance.lock');
  let fd: number;
  try { fd = openSync(lock, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('WORKSPACE_GUIDANCE_BUSY: 另一个资料更新正在执行；确认其结束后重试');
    throw error;
  }
  closeSync(fd);
  const target = resolve(root, 'AGENTS.md');
  let temporary: string | undefined;
  try {
    if (existsSync(target) && !lstatSync(target).isFile()) throw new Error('WORKSPACE_GUIDANCE_PATH_INVALID: AGENTS.md 必须是普通文件');
    const previous = existsSync(target) ? readFileSync(target, 'utf8') : undefined;
    if (previous !== undefined && !previous.includes(BEGIN) && !previous.includes(END)) {
      const digest = createHash('sha256').update(block).digest('hex').slice(0, 12);
      const candidate = resolve(directory, `AGENTS.platform-${digest}.md`);
      // 候选本身也可能已由用户编辑，使用独占创建并保留已有内容。
      try { writeFileSync(candidate, `${block}\n`, { flag: 'wx' }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      return { state: 'review-required', path: target, candidate, preserved: true };
    }
    const current = previous === undefined ? undefined : managedBlock(previous);
    const next = current ? previous!.slice(0, current.start) + block + previous!.slice(current.end) : template;
    if (next === previous) return { state: 'unchanged', path: target, preserved: true };
    temporary = resolve(root, `.AGENTS.openxiangda-${randomUUID()}.tmp`);
    writeFileSync(temporary, next, { flag: 'wx' });
    const readback = existsSync(target) ? readFileSync(target, 'utf8') : undefined;
    if (previous !== readback) throw new Error('WORKSPACE_GUIDANCE_CHANGED: AGENTS.md 在准备期间被修改，请重新读取后重试');
    renameSync(temporary, target);
    temporary = undefined;
    return { state: previous === undefined ? 'created' : 'updated', path: target, preserved: true };
  } finally {
    if (temporary && existsSync(temporary)) unlinkSync(temporary);
    unlinkSync(lock);
  }
}
