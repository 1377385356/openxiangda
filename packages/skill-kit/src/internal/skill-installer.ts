import { cp, mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface SkillInstallTransactionInput {
  source: string;
  destination: string;
  name: string;
  retiredNames?: string[];
}

export async function installSkillTransaction(input: SkillInstallTransactionInput) {
  await mkdir(input.destination, { recursive: true });
  const target = resolve(input.destination, input.name);
  const staging = await mkdtemp(resolve(input.destination, '.openxiangda-v2-install-'));
  const stagedSkill = resolve(staging, input.name);
  const backupRoot = resolve(staging, 'previous');
  const backedUp: Array<{ source: string; backup: string }> = [];
  let installedNewSkill = false;

  try {
    await cp(input.source, stagedSkill, { recursive: true });
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
  } catch (error) {
    if (installedNewSkill || (await pathExists(target))) {
      await rm(target, { recursive: true, force: true });
    }
    for (const entry of backedUp.reverse()) {
      await rename(entry.backup, entry.source);
    }
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
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
