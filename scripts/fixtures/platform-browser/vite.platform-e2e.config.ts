import { mergeConfig } from 'vite';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import applicationConfig from './vite.config';

// 只装入发行门禁的临时应用，不分发到用户工作区。
export default mergeConfig(applicationConfig, {
  // Maintainer fixtures use the actual installed router owner, including in a
  // packed candidate. Do not expose this internal owner as an application API.
  resolve: { alias: { '@maintainer/navigation-owner': join(dirname(createRequire(import.meta.url).resolve('openxiangda/package.json')), 'dist/browser/navigation-guard.js') } },
  optimizeDeps: {
    entries: [
      'index.html',
      'data-api-live.e2e.html',
      'field-protocol.e2e.html',
      'mobile-reference.e2e.html',
      'resource-experience.e2e.html',
      'workflow-experience.e2e.html',
      'workflow-delegation.e2e.html',
      'workflow-entry.e2e.html',
      'login-return.e2e.html',
      'session-switch.e2e.html',
      'managed-read-recovery.e2e.html',
      'zoned-time.e2e.html',
      'guard-navigation.e2e.html',
      'user-surface.e2e.html',
      'platform-e2e/client-fixture.ts',
    ],
  },
});
