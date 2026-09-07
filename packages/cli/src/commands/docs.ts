import { Args, Flags } from '@oclif/core';
import { documentationIndex, readDocumentation } from 'openxiangda-devkit-core';
import { OpenXiangdaCommand } from '../base.js';

export default class Docs extends OpenXiangdaCommand {
  static summary = '读取当前版本的中文使用资料；不传主题时显示目录';
  static args = { topic: Args.string({ summary: '文档目录中的稳定主题 ID' }) };
  static flags = { section: Flags.string({ summary: '主题目录中的章节 ID；按需读取长文档' }) };
  async run() {
    const { args, flags } = await this.parse(Docs);
    if (flags.section && !args.topic) throw new Error('DOCUMENTATION_TOPIC_REQUIRED: 读取章节时必须指定主题');
    const data = args.topic ? readDocumentation(args.topic, flags.section) : documentationIndex();
    if (!this.jsonEnabled()) {
      this.log('content' in data ? data.content : data.topics.map(topic => `${topic.id}  ${topic.title}`).join('\n'));
      return;
    }
    return this.present({ ok: true, operation: 'docs', workspace: { appCode: 'global', root: process.cwd() }, data, diagnostics: [], nextActions: [] });
  }
}
