import { cp, mkdir, mkdtemp, open, rename, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface SkillInstallTransactionInput {
  source: string;
  destination: string;
  name: string;
  retiredNames?: string[];
  verify?: (path: string) => Promise<void>;
}

export async function installSkillTransaction(input: SkillInstallTransactionInput) {
  await mkdir(input.destination, { recursive: true });
  const target = resolve(input.destination, input.name);
  const lockPath = resolve(input.destination, `.${input.name}.install.lock`);
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`SKILL_INSTALL_BUSY: ${target}; 核对原安装进程已结束后再恢复`);
    }
    throw error;
  }
  let staging: string;
  try { staging = await mkdtemp(resolve(input.destination, '.openxiangda-v2-install-')); }
  catch (error) { await lock.close(); await rm(lockPath); throw error; }
  const stagedSkill = resolve(staging, input.name);
  const backupRoot = resolve(staging, 'previous');
  const backedUp: Array<{ source: string; backup: string }> = [];
  let installedNewSkill = false;

  try {
    await cp(input.source, stagedSkill, { recursive: true });
    await input.verify?.(stagedSkill);
    await mkdir(backupRoot, { recursive: true });
    for (const name of [
      input.name,
      ...new Set(input.retiredNames || []),
    ]) {
      const source = resolve(input.destination, name);
      if (!(await pathExists(source))) continue;
      const backup = resolve(backupRoot, name);
      await rename(source, backup);
      backedUp.push({ source, backup });
    }
    await rename(stagedSkill, target);
    installedNewSkill = true;
    await input.verify?.(target);
  } catch (error) {
    if (installedNewSkill) {
      await rm(target, { recursive: true, force: true });
    }
    for (const entry of backedUp.reverse()) {
      await rename(entry.backup, entry.source);
    }
    throw error;
  } finally {
    try { await rm(staging, { recursive: true, force: true }); }
    finally { await lock.close(); await rm(lockPath); }
  }

  return target;
}

async function pathExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
