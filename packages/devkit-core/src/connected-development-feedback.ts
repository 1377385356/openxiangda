/** Read-only presentation of a refusal already decided by the platform owner. */
const actions = {
  'test-deployment-required': {
    nextAction: 'review-test-deployment', actionCode: 'dev.review-test-deployment',
    actionLabel: '核对变更并安排 TEST 发布', command: 'openxiangda docs development',
    remediation: '按字段位置核对差异，安排 TEST 正式发布或恢复已发布定义；相同输入直接重跑 dev 无法解决。',
  },
  'restart-development': {
    nextAction: 'restart-development', actionCode: 'dev.restart',
    actionLabel: '核对基线，停止旧进程后重启开发', command: 'openxiangda dev',
    remediation: '核对发布和角色基线，停止旧 dev 进程后重新启动；不要刷新旧会话以改绑版本。',
  },
  'inspect-original-run': {
    nextAction: 'inspect-original-configuration-run', actionCode: 'dev.inspect-original-run',
    actionLabel: '核对原配置运行结果', command: 'openxiangda docs application-operations',
    remediation: '保留原 configurationRunId、requestId 和 causeCode，先核对原运行结果；不要更换随机键或重复创建运行。',
  },
  'fix-configuration': {
    nextAction: 'fix-local-configuration', actionCode: 'dev.fix-configuration',
    actionLabel: '修正声明后检查', command: 'openxiangda check',
    remediation: '按字段位置和原错误原因修正本地声明，再检查；不要重复发送相同输入。',
  },
} as const;
export function connectedDevelopmentFeedback(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (item.schemaVersion !== 'openxiangda.connected-development-feedback/v1' || item.canRetryUnchanged !== false ||
      typeof item.category !== 'string' || !Object.hasOwn(actions, item.category)) return undefined;
  const category = item.category as keyof typeof actions;
  const action = actions[category];
  if (item.nextAction !== action.nextAction) return undefined;
  return { ...action, developmentFeedback: {
    schemaVersion: 'openxiangda.connected-development-feedback/v1', category,
    nextAction: action.nextAction, canRetryUnchanged: false,
  } };
}
export function connectedDevelopmentDetail(value: unknown, maximum = 256): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value)
    ? value : undefined;
}
