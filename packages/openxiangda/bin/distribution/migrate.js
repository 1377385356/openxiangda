import { readdirSync, lstatSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fail, flagValue } from './workspace.js';

export function assessMigration(context, args) {
  if (args[1] !== 'assess' || flagValue(args, '--to') !== 'v2') fail('DISTRIBUTION_MIGRATION_ARGUMENT_INVALID', '用法：openxiangda migrate assess --to v2');
  if (context.workspace?.generation !== 'v1') fail('DISTRIBUTION_MIGRATION_V1_REQUIRED', '请在 V1 工作区内进行迁移评估');
  const root = context.workspace.root;
  const inventory = { resources: [], workflows: [], permissions: [], pages: [], runtime: [], data: [] };
  let files = 0, bytes = 0, entries = 0;
  const skipped = [];
  const excluded = new Set(['node_modules', '.git', '.codegraph', 'dist', 'build', 'coverage', '.openxiangda', '.agents', '.codex', '.claude', '.qoder', '.cursor', '.env', 'secrets', 'logs']);
  function visit(directory, depth = 0) {
    if (depth > 12) { skipped.push(relative(root, directory)); return; }
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++entries > 20000) fail('DISTRIBUTION_MIGRATION_SCAN_LIMIT', '目录超过 20000 个条目；请按应用拆分评估范围');
      if (excluded.has(entry.name) || entry.name.startsWith('.env')) continue;
      const file = join(directory, entry.name), path = relative(root, file);
      if (entry.isSymbolicLink()) { skipped.push(path); continue; }
      if (entry.isDirectory()) { visit(file, depth + 1); continue; }
      if (!/\.(?:[cm]?[jt]sx?|json|ya?ml|sql)$/.test(entry.name) || /lock\.json$/.test(entry.name)) continue;
      const size = lstatSync(file).size;
      if (++files > 5000 || bytes + size > 20 * 1024 * 1024) fail('DISTRIBUTION_MIGRATION_SCAN_LIMIT', '工作区超过 5000 个文件或 20 MiB；请按应用拆分评估范围');
      if (size > 1024 * 1024) { skipped.push(path); continue; }
      bytes += size;
      const text = readFileSync(file, 'utf8');
      // Return source pointers, never credentials, customer records or executable config values.
      if (/resource|form/i.test(path) || /defineResource|formUuid/.test(text)) inventory.resources.push(path);
      if (/workflow|process|automation/i.test(path) || /JS_CODE|approver/.test(text)) inventory.workflows.push(path);
      if (/permission|authz|role/i.test(path) || /permissionGroup|permissionCode/.test(text)) inventory.permissions.push(path);
      if (/page|route|\.tsx$|\.jsx$/i.test(path)) inventory.pages.push(path);
      if (/function|server|runtime|backend/i.test(path)) inventory.runtime.push(path);
      if (/migration|schema|\.sql$/i.test(path)) inventory.data.push(path);
    }
  }
  visit(root);
  return {
    schemaVersion: 'openxiangda.migration-assessment/v1', from: 'v1', to: 'v2', root, readOnly: true,
    engineVersion: context.engine.version, scanned: { files, bytes }, complete: skipped.length === 0, skipped, inventory,
    recommendation: {
      preferredGeneration: 'v2',
      policy: 'V2 能力满足、项目仍在测试阶段且迁移成本可控时，优先建议采用 V2。',
      decision: '条件待确认；本地源码指针不能证明能力覆盖、上线阶段或迁移成本。',
      criteria: [
        { code: 'capability-fit', status: 'needs-confirmation', question: 'V2 是否覆盖项目需要的模型、页面、权限、流程与外部集成？' },
        { code: 'project-stage', status: 'needs-confirmation', question: '项目是否仍在测试阶段，已有多少真实数据和在途流程？' },
        { code: 'migration-cost', status: 'needs-confirmation', question: '重建、数据映射、测试和切换的成本是否可控？' },
      ],
    },
    assessment: [
      { area: 'resources', pointers: inventory.resources.length, decision: '逐项确认业务模型、字段、关联和服务端约束，再映射到 V2 Data API；V1 表单标识不直接作为 V2 模型。' },
      { area: 'workflows', pointers: inventory.workflows.length, decision: '核对节点、审批人规则、JS_CODE 副作用、通知和在途实例；在途流程须制定独立切换方案。' },
      { area: 'permissions', pointers: inventory.permissions.length, decision: '由项目确认角色并集、数据范围和字段权限，按真实角色回归；不可直接复制旧权限组。' },
      { area: 'data', pointers: inventory.data.length, decision: '此次只检查本地源码。远端数据量、附件、主键映射和历史流程尚未读取，需另行授权盘点、校验和回滚演练。' },
      { area: 'experience', pointers: inventory.pages.length, decision: '先确认 AppSpec 产品、页面和权限设计基线，再逐页重建并验收 PC/移动端。' },
    ],
    nextSteps: ['确认范围与源环境', '完成详细设计和迁移映射', '在测试环境演练并核对数量、摘要和权限', '冻结切换窗口与回滚条件', '逐项目审批实施'],
    migrated: false,
  };
}
