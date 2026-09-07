#!/usr/bin/env node
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './distribution/launcher.js';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
try {
  if (Number(process.versions.node.split('.')[0]) < 24) throw Object.assign(new Error('统一入口需要 Node.js 24 或更高版本；已有 V1 项目仍可使用其原工具链。'), { code: 'DISTRIBUTION_NODE_VERSION_REQUIRED' });
  await launch(packageRoot);
} catch (error) {
  const result = { schemaVersion: 'openxiangda.distribution/v1', ok: false, error: { code: error.code || 'DISTRIBUTION_COMMAND_FAILED', message: error.message } };
  (process.argv.includes('--json') ? process.stdout : process.stderr).write(`${process.argv.includes('--json') ? JSON.stringify(result) : error.message}\n`);
  process.exitCode = 1;
}
