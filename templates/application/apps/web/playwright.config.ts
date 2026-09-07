import { defineConfig } from '@playwright/test';

const e2ePort = resolveE2ePort();
const baseURL =
  process.env.OPENXIANGDA_E2E_BASE_URL || `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './e2e',
  // 在 e2e/ 中添加本应用的真实业务验收，测试账户与环境由测试代码明确选择。
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: process.env.OPENXIANGDA_E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: false,
        env: {
          OPENXIANGDA_WEB_PORT: String(e2ePort),
          OPENXIANGDA_ENVIRONMENT_KEY: 'preproduction',
          OPENXIANGDA_DEV_PROXY:
            process.env.OPENXIANGDA_E2E_PLATFORM_URL ||
            'http://127.0.0.1:7001',
        },
      },
});

function resolveE2ePort() {
  const configured = process.env.OPENXIANGDA_E2E_PORT;
  if (configured !== undefined) {
    const port = Number(configured);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      throw new Error(
        'OPENXIANGDA_E2E_PORT 必须是 1024 到 65535 之间的整数'
      );
    }
    return port;
  }

  let hash = 2166136261;
  for (const character of process.cwd()) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return 30_000 + ((hash >>> 0) % 30_000);
}
