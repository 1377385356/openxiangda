import { Args, Flags } from '@oclif/core';
import { readFileSync } from 'node:fs';
import { workspaceGuidanceTemplatePath } from 'openxiangda-devkit-core';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  installSkills,
  refreshWorkspaceGuidance,
  resolveDefaultSkillsRoot,
} from 'openxiangda-skill-kit';
import { OpenXiangdaCommand } from '../base.js';

export default class Skill extends OpenXiangdaCommand {
  static summary = '安装或更新与当前 openxiangda 版本完全一致的 AI Skill';
  static args = {
    action: Args.string({ required: true, options: ['install'] }),
  };
  static flags = {
    workspace: Flags.string({ summary: '安装到指定项目的 .agents/skills，并刷新 AGENTS.md 平台区块', helpValue: '<directory>' }),
    destination: Flags.string({
      summary: 'AI Skill 根目录；默认使用 Codex Skill 目录',
      helpValue: '<directory>',
    }),
    force: Flags.boolean({
      default: false,
      summary: '原子替换已安装的同名 Skill',
    }),
  };

  async run() {
    const { args, flags } = await this.parse(Skill);
    if (args.action !== 'install') {
      throw new Error(`OPENXIANGDA_SKILL_ACTION_UNSUPPORTED:${args.action}`);
    }
    const destination = resolve(
      flags.destination ||
        (flags.workspace ? join(resolve(flags.workspace), '.agents/skills') : undefined) ||
        join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'skills')
    );
    const result = await installSkills({
      skillsRoot: resolveDefaultSkillsRoot(),
      destination,
      force: flags.force,
    });
    const guidance = flags.workspace
      ? refreshWorkspaceGuidance(resolve(flags.workspace), readFileSync(workspaceGuidanceTemplatePath(), 'utf8'))
      : undefined;
    return this.present({
      ok: true,
      operation: 'skill install',
      workspace: { appCode: 'global', root: process.cwd() },
      data: { ...result, ...(guidance ? { guidance } : {}) },
      diagnostics: [],
      nextActions: [],
    });
  }
}
