import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const sdk = createRequire(resolve(root, 'packages/openxiangda/package.json'));
const people = [
  { value: 'member-001', label: '陈老师' }, { value: 'member-002', label: '陈老师' },
  { value: 'member-003', label: '林老师' }, { value: 'member-004', label: '赵老师' },
];
let failNext = false, revokeOnConfirm = false;
const reply = (res, status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ code: status, data })); };

export default {
  root: import.meta.dirname,
  esbuild: { jsx: 'automatic' },
  resolve: { alias: [
    { find: /^\.\/mobile-base\.css$/, replacement: resolve(root, 'packages/openxiangda/dist/browser/mobile-base.css') },
    { find: /^openxiangda\/react\/styles\.css$/, replacement: resolve(root, 'packages/openxiangda/src/browser/styles.css') },
    { find: /^openxiangda\/react$/, replacement: resolve(root, 'packages/openxiangda/src/react.ts') },
    { find: /^openxiangda\/field-kit$/, replacement: resolve(root, 'packages/openxiangda/src/field-kit.ts') },
    ...['react', 'react-dom', 'antd', '@ant-design/icons'].map(name => ({ find: name, replacement: dirname(sdk.resolve(`${name}/package.json`)) })),
  ], dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 4326, strictPort: true, fs: { allow: [root] } },
  plugins: [{ name: 'synthetic-user-candidate-transport', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const path = new URL(req.url, 'http://127.0.0.1').pathname;
      if (path !== '/fixture-control' && !path.endsWith('/user-candidates/query')) return next();
      if (req.method !== 'POST') return reply(res, 405, {});
      let text = '';
      for await (const chunk of req) { text += chunk; if (text.length > 16384) return reply(res, 413, {}); }
      let input;
      try { input = JSON.parse(text); } catch { return reply(res, 400, {}); }
      if (path === '/fixture-control') {
        failNext = input.action === 'fail-next'; revokeOnConfirm = input.action === 'revoke-confirm';
        return reply(res, 200, { ready: true });
      }
      if (failNext) { failNext = false; return reply(res, 503, { errorCode: 'FIXTURE_UNAVAILABLE' }); }
      if (input.schemaVersion !== 'openxiangda.user-candidates-query/v2') return reply(res, 400, { errorCode: 'QUERY_INVALID' });
      if (path.includes('/tasks/') && (input.expectedTaskVersion !== 2 || input.expectedRevision !== 7))
        return reply(res, 409, { errorCode: 'WORKFLOW_TASK_FORM_REVISION_CONFLICT' });
      if (input.operation === 'update' && (input.recordId !== 'record-1' || input.expectedRevision !== 7))
        return reply(res, 409, { errorCode: 'DATA_REVISION_CONFLICT' });
      server.ws.send({ type: 'custom', event: 'candidate-query-observed', data: { phase: '请求', keyword: input.keyword || '' } });
      const selected = input.selectedIds || [];
      if (revokeOnConfirm && selected.length && !input.keyword && !input.cursor) revokeOnConfirm = 'revoked';
      const valid = people.filter(item => !(revokeOnConfirm === 'revoked' && item.value === 'member-001'));
      const matches = valid.filter(item => !input.keyword || input.keyword === '缓慢' || item.label.includes(input.keyword));
      const offset = Number(input.cursor || 0), items = matches.slice(offset, offset + 2);
      const data = { schemaVersion: 'openxiangda.user-candidates-page/v2', resourceCode: 'requests', fieldCode: 'leaders',
        environmentHeadRevision: 1, recordRevision: 7, evaluatedAt: new Date().toISOString(), items,
        selected: selected.map(value => { const item = valid.find(item => item.value === value); return item ? { ...item, status: 'valid' } : { value, status: 'invalid' }; }),
        nextCursor: offset + 2 < matches.length ? String(offset + 2) : null };
      if (input.keyword === '缓慢') await new Promise(resolve => setTimeout(resolve, 5000));
      reply(res, 200, data);
      server.ws.send({ type: 'custom', event: 'candidate-query-observed', data: { phase: '响应', keyword: input.keyword || '' } });
    });
  } }],
};
