import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadAppConfig } from '../src/index.js';

test('loads Native read-policy helpers from openxiangda/config', async () => {
  const root = mkdtempSync(join(tmpdir(), 'openxiangda-read-policy-helper-'));
  try {
    const configPath = join(root, 'openxiangda.config.ts');
    writeFileSync(
      configPath,
      `import { dataPolicyExpression, resourceReadPolicy } from "openxiangda/config";
const policy = resourceReadPolicy({
  code: "published-items",
  name: "Published items",
  resourceCode: "items",
  writeBoundary: "capability_only",
  expression: dataPolicyExpression.anyOf(
    dataPolicyExpression.currentUser({ field: "owner" }),
    dataPolicyExpression.databaseNow({ field: "publishAt", operator: "lte" }),
  ),
});
if (policy.writeBoundary !== "capability_only" || policy.readExpression.anyOf.length !== 2) {
  throw new Error("read-policy helper unavailable");
}
export default {
  schemaVersion: 3,
  app: { code: "reference-app", name: "Reference App" },
  frontend: { root: "apps/web" },
  backend: {
    root: "apps/server",
    runtime: "node",
    framework: "nestjs",
    enabled: true,
    isolation: "shared",
    resourceProfile: "light",
  },
  platform: { root: "platform" },
  data: {
    resources: [{
      code: "items",
      name: "Items",
      fields: [{ code: "name", type: "text.short", label: "Name", required: true }],
    }],
  },
};
`
    );

    const loaded = await loadAppConfig(configPath);
    assert.equal(loaded.app.code, 'reference-app');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('loads canonical App Operation schema helpers from openxiangda/config', async () => {
  const root = mkdtempSync(join(tmpdir(), 'openxiangda-schema-helper-'));
  try {
    const configPath = join(root, 'openxiangda.config.ts');
    writeFileSync(
      configPath,
      `import { composeAppOperationSchemas, resourceRecordSchema, schemaRef } from "openxiangda/config";
const items = {
  code: "items",
  name: "Items",
  fields: [{ code: "name", type: "text.short", label: "Name", required: true }],
};
const schemas = composeAppOperationSchemas({
  request: resourceRecordSchema(items, { fields: ["name"] }),
  response: schemaRef("ItemRecord"),
  definitions: { ItemRecord: resourceRecordSchema(items) },
});
if (schemas.requestSchema.$defs.ItemRecord.properties.name.type !== "string") {
  throw new Error("operation schema helper unavailable");
}
export default {
  schemaVersion: 3,
  app: { code: "reference-app", name: "Reference App" },
  frontend: { root: "apps/web" },
  backend: {
    root: "apps/server",
    runtime: "node",
    framework: "nestjs",
    enabled: true,
    isolation: "shared",
    resourceProfile: "light",
    operations: [{
      code: "item.create",
      method: "POST",
      path: "/api/items",
      capability: "app:reference-app:item:create",
      ...schemas,
    }],
  },
  platform: { root: "platform" },
  data: { resources: [items] },
  authz: {
    roles: [],
    capabilities: [{
      code: "app:reference-app:item:create",
      name: "Create item",
      kind: "backend",
    }],
  },
};
`
    );

    const loaded = await loadAppConfig(configPath);
    assert.equal(
      loaded.backend.operations?.[0]?.responseSchema.$ref,
      '#/$defs/ItemRecord'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
