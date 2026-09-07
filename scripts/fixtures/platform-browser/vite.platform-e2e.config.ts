import { mergeConfig } from 'vite';
import applicationConfig from './vite.config';

// 只装入发行门禁的临时应用，不分发到用户工作区。
export default mergeConfig(applicationConfig, {
  optimizeDeps: {
    entries: [
      'index.html',
      'data-api-live.e2e.html',
      'field-protocol.e2e.html',
      'mobile-reference.e2e.html',
      'resource-experience.e2e.html',
      'workflow-experience.e2e.html',
      'workflow-entry.e2e.html',
      'login-return.e2e.html',
    ],
  },
});
