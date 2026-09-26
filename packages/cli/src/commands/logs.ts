import { Args, Flags } from '@oclif/core';
import { parseApplicationDiagnosticQuery, type ApplicationDiagnosticQuery } from 'openxiangda-contracts';
import { OpenXiangdaCommand, studioWorkspaceFlags } from '../base.js';

const locators = { 'request-id': 'requestId', 'command-id': 'commandId', 'deployment-run-id': 'deploymentRunId', 'file-id': 'fileId' } as const;
type LogFlags = Partial<Record<keyof typeof locators | 'from' | 'to' | 'environment', string | undefined>>;

export function resolveLogQuery(flags: LogFlags, deploymentId?: string, now = new Date()): ApplicationDiagnosticQuery | null {
  const selected = Object.entries(locators).filter(([flag]) => flags[flag as keyof typeof locators] !== undefined);
  const invalid = () => { throw Object.assign(new Error('诊断定位器必须唯一；request-id 的 from/to 需成对，其他定位器不接受时间窗口'), { code: 'OPENXIANGDA_DIAGNOSTIC_QUERY_INVALID' }); };
  if (selected.length > 1 || selected.length && deploymentId) return invalid();
  if (!selected.length) {
    if (flags.from || flags.to || flags.environment) return invalid();
    return null;
  }
  const [flag, kind] = selected[0]!;
  if (flags.environment !== undefined && !['test', 'production'].includes(flags.environment)) return invalid();
  if (Boolean(flags.from) !== Boolean(flags.to) || kind !== 'requestId' && (flags.from || flags.to)) return invalid();
  return parseApplicationDiagnosticQuery({
    kind, id: flags[flag as keyof typeof locators], environmentKey: flags.environment === 'production' ? 'production' : 'preproduction',
    ...(kind === 'requestId' ? { from: flags.from || new Date(now.getTime() - 3600_000).toISOString(), to: flags.to || now.toISOString() } : {}),
  });
}

export default class Logs extends OpenXiangdaCommand {
  static summary = '查询部署日志或应用原请求/命令/文件事实；默认最近一次部署';
  static args = { deploymentId: Args.string() };
  static flags = {
    ...studioWorkspaceFlags,
    'request-id': Flags.string({ summary: '原请求 ID；默认查询最近一小时' }),
    'command-id': Flags.string({ summary: '原持久命令 ID' }),
    'deployment-run-id': Flags.string({ summary: '原部署 Run ID 的范围诊断' }),
    'file-id': Flags.string({ summary: '受管文件 ID 的引用和作业状态' }),
    environment: Flags.string({ options: ['test', 'production'], summary: '诊断环境；默认 test，不回退到生产' }),
    from: Flags.string({ summary: 'request-id 的起始 UTC 时间，ISO 格式' }),
    to: Flags.string({ summary: 'request-id 的结束 UTC 时间，窗口最多 24 小时' }),
  };
  async run() {
    const { args, flags } = await this.parse(Logs);
    this.beginStudioEvents('logs');
    const query = resolveLogQuery(flags, args.deploymentId);
    return this.present(
      query ? await this.services.applicationDiagnostics(flags.cwd, query) : await this.services.deploymentLogs(flags.cwd, args.deploymentId)
    );
  }
}
