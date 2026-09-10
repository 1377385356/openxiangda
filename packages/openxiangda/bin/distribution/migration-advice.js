// The distribution layer owns guidance for V1 engines; V2 services stay isolated.
export function migrationAdvice(context) {
  if (context.workspace?.generation !== 'v1') return undefined;
  return {
    generation: 'v1',
    message: '建议评估升级到 OpenXiangda 2.0；新应用优先使用 V2，现有应用先核实能力覆盖、迁移成本与验收方案。',
    launcherUpdateCommand: 'openxiangda update install --target launcher',
    nodeRequirement: '>=24',
    assessCommand: 'openxiangda migrate assess --to v2',
    guide: 'https://github.com/1377385356/openxiangda/blob/master/docs/getting-started.md#upgrade',
    workspacePolicy: '更新统一入口后旧项目仍使用 V1；不会自动转换应用、数据或流程。',
  };
}

export function printMigrationAdvice(advice) {
  process.stderr.write(`\n${advice.message}\n更新统一入口（Node.js 24+）：${advice.launcherUpdateCommand}\n迁移评估：${advice.assessCommand}\n${advice.workspacePolicy}\nCLI / Skill / MCP 安装升级说明：${advice.guide}\n`);
}
