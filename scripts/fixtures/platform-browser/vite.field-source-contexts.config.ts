import base from './vite.delegation-source.config';
export default { ...base, server: { ...base.server, port: 33332 },
  optimizeDeps: { entries: ['field-source-contexts.e2e.html'] } };
