import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const sdk = createRequire(resolve(root, 'packages/openxiangda/package.json'));
export default {
  root: resolve(import.meta.dirname, 'appspec/design/prototypes/workbench'),
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      react: dirname(sdk.resolve('react/package.json')),
      'react-dom': dirname(sdk.resolve('react-dom/package.json')),
      antd: dirname(sdk.resolve('antd/package.json')),
      '@ant-design/icons': dirname(sdk.resolve('@ant-design/icons/package.json')),
      'openxiangda/react': resolve(root, 'packages/openxiangda/src/react.ts'),
      'openxiangda/field-kit': resolve(root, 'packages/openxiangda/src/field-kit.ts'),
      'openxiangda/mobile': resolve(root, 'packages/openxiangda/src/mobile.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: { host: '127.0.0.1', port: 4318, strictPort: true, fs: { allow: [root] } },
  build: { outDir: resolve(root, '.cache/design-workbench'), emptyOutDir: true },
};
