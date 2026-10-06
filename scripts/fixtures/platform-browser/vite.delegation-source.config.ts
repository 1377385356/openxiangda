import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const sdk = createRequire(resolve(root, 'packages/openxiangda/package.json'));

export default {
  root: import.meta.dirname,
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 33331, strictPort: true, fs: { allow: [root] } },
  resolve: {
    alias: {
      react: dirname(sdk.resolve('react/package.json')),
      'react-dom': dirname(sdk.resolve('react-dom/package.json')),
      antd: dirname(sdk.resolve('antd/package.json')),
    },
    dedupe: ['react', 'react-dom', 'antd'],
  },
  optimizeDeps: { entries: ['workflow-delegation.e2e.html'] },
};
