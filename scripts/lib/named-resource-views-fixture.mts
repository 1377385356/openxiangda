import {
  compileApplicationSources,
  defineOpenXiangdaApp,
  adminResourcePage,
} from '../../packages/devkit-core/src/index.js';

/** Shared CLI/server compatibility evidence generated from public application authoring. */
export function buildNamedResourceViewsFixture() {
  const appCode = 'named-resource-views';
  const compiled = compileApplicationSources(
    defineOpenXiangdaApp({
      app: { code: appCode, name: '同一模型的多套页面' },
      frontend: {
        admin: {
          navigation: [
            {
              code: 'records',
              label: '数据管理',
              items: [
                adminResourcePage('records', { viewCode: 'quick' }),
                adminResourcePage('records', { viewCode: 'complete' }),
              ],
            },
          ],
        },
      },
      modules: [
        {
          code: 'records',
          models: [
            {
              code: 'records',
              name: '记录',
              fields: [
                {
                  code: 'title',
                  label: '名称',
                  type: 'text.short',
                  required: true,
                },
                { code: 'note', label: '说明', type: 'text.long' },
                { code: 'enabled', label: '启用', type: 'boolean' },
                {
                  code: 'internal_key',
                  label: '内部标识',
                  type: 'text.short',
                  hidden: true,
                },
              ],
            },
          ],
          crud: [
            {
              model: 'records',
              code: 'quick',
              name: '简要登记',
              list: { model: 'records', fields: ['title'] },
              form: { model: 'records', fields: ['title'] },
              detail: { model: 'records', fields: ['title'] },
              sections: [{ title: '登记信息', fields: ['title'] }],
              generated: { delete: false },
            },
            {
              model: 'records',
              code: 'complete',
              name: '完整管理',
              list: {
                model: 'records',
                fields: ['enabled', 'title', 'note'],
                filterFields: ['enabled'],
                searchableFields: ['title'],
              },
              sections: [
                { title: '基础信息', fields: ['title', 'note'] },
                { title: '管理设置', fields: ['enabled'] },
              ],
              mobile: { enabled: false },
            },
          ],
        },
      ],
    })
  );
  return {
    appCode,
    configuration: {
      digest: compiled.config.digest,
      canonical: compiled.config.content,
    },
    contract: {
      digest: compiled.contracts.digest,
      canonical: compiled.contracts.content,
    },
  };
}
