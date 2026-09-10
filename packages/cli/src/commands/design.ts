import { Command } from '@oclif/core';
import { runDesign } from '../design-native.js';

export default class Design extends Command {
  static summary = '打开 OpenDesign 原版并透传完整原生 CLI';
  static strict = false;
  async run() { process.exitCode = await runDesign(this.argv); }
}
