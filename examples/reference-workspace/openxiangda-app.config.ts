import { SCHEMA_VERSIONS } from 'openxiangda-contracts';
import { defineOpenXiangdaApp } from 'openxiangda-devkit-core';

export default defineOpenXiangdaApp({
  schemaVersion: 3,
  app: {
    code: 'reference-app',
    name: 'OpenXiangda 2.0 Reference App',
  },
  frontend: {
    root: 'apps/web',
  },
  backend: {
    root: 'apps/server',
    runtime: 'node',
    framework: 'nestjs',
    runMode: 'shared',
  },
  platform: {
    root: 'platform',
  },
  data: {
    resources: [
      {
        schemaVersion: SCHEMA_VERSIONS.dataResource,
        appCode: 'reference-app',
        code: 'instruments',
        name: '仪器',
        schema: {
          fields: [
            { code: 'name', type: 'string', nullable: false, indexed: true },
            { code: 'college_id', type: 'uuid', indexed: true },
            { code: 'manager_ids', type: 'json' },
          ],
        },
        capabilities: {
          read: 'app:reference-app:data:instruments:read',
          create: 'app:reference-app:data:instruments:create',
          update: 'app:reference-app:data:instruments:update',
          delete: 'app:reference-app:data:instruments:delete',
        },
        dataPolicyCode: 'instrument_scope',
        fieldPolicies: {},
      },
    ],
  },
});
