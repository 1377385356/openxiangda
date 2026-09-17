#!/usr/bin/env node
import { execute } from '@oclif/core';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEVKIT_COMMANDS } from 'openxiangda-devkit-core';

const publicCommands = new Set(DEVKIT_COMMANDS.map(command => command.id));
const args = process.argv.slice(2);

if (args.includes('--mcp-stdio')) {
  const allowed = new Set(['--mcp-stdio', '--cwd']);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--cwd') {
      index += 1;
      if (!args[index]) throw new Error('OPENXIANGDA_MCP_CWD_REQUIRED');
      continue;
    }
    if (!allowed.has(argument)) {
      throw new Error(`OPENXIANGDA_MCP_ARGUMENT_INVALID: ${argument}`);
    }
  }
  const cwdIndex = args.indexOf('--cwd');
  const root = cwdIndex >= 0 ? args[cwdIndex + 1] : undefined;
  const { runStdioServer } = await import('openxiangda-mcp');
  await runStdioServer(root ? { root } : {});
} else {
  const command = args.find(argument => !argument.startsWith('-'));

  if (command && !publicCommands.has(command)) {
    const nextCommand = 'openxiangda --help';
    if (args.includes('--json')) {
      process.stdout.write(`${JSON.stringify({
        schemaVersion: 'openxiangda.cli-result/v2',
        ok: false,
        operation: command,
        workspace: null,
        data: null,
        error: {
          code: 'OPENXIANGDA_COMMAND_NOT_FOUND',
          message: `未知命令: ${command}`,
          retryable: false,
          remediation: `运行 ${nextCommand}`,
          nextCommand,
        },
      })}\n`);
    } else {
      process.stderr.write(`未知命令: ${command}\n运行 ${nextCommand}\n`);
    }
    process.exitCode = 2;
  } else {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const cliManifest = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    );
    const distributionManifest = process.env.OPENXIANGDA_DISTRIBUTION_NAME
      ? {
          ...cliManifest,
          name: process.env.OPENXIANGDA_DISTRIBUTION_NAME,
          version:
            process.env.OPENXIANGDA_DISTRIBUTION_VERSION ||
            cliManifest.version,
        }
      : undefined;
    await execute({
      args,
      loadOptions: {
        root,
        ...(distributionManifest ? { pjson: distributionManifest } : {}),
        ...(process.env.OPENXIANGDA_DISTRIBUTION_NAME
          ? { name: process.env.OPENXIANGDA_DISTRIBUTION_NAME }
          : {}),
        ...(process.env.OPENXIANGDA_DISTRIBUTION_VERSION
          ? { version: process.env.OPENXIANGDA_DISTRIBUTION_VERSION }
          : {}),
        userPlugins: false,
        devPlugins: false,
        jitPlugins: false,
      },
    });
  }
}
