import { defineConfig } from '@playwright/test';

const e2ePort = resolveE2ePort();
const baseURL =
  process.env.OPENXIANGDA_E2E_BASE_URL || `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './platform-e2e',
  // The development server owns one mutable dependency-optimizer generation.
  // Serial browser entrypoints prevent a second HTML graph from invalidating
  // an in-flight transformed module during release acceptance.
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: process.env.OPENXIANGDA_E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm exec vite --config vite.platform-e2e.config.ts',
        url: baseURL,
        reuseExistingServer: false,
        env: {
          OPENXIANGDA_WEB_PORT: String(e2ePort),
          OPENXIANGDA_ENVIRONMENT_KEY: 'production',
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
        'OPENXIANGDA_E2E_PORT must be an integer between 1024 and 65535'
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
