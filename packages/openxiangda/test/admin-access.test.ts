import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isAdminAccessAllowed } from '../src/react';

test('evaluates the complete immutable admin access expression', () => {
  const grants = new Set(['admin.read', 'admin.enter']);
  const allowed = (capability: string) => grants.has(capability);

  assert.equal(isAdminAccessAllowed(undefined, allowed), true);
  assert.equal(
    isAdminAccessAllowed(
      { allOf: ['admin.read'], anyOf: ['admin.enter', 'admin.override'] },
      allowed,
    ),
    true,
  );
  assert.equal(
    isAdminAccessAllowed(
      { allOf: ['admin.read', 'admin.write'], anyOf: ['admin.enter'] },
      allowed,
    ),
    false,
  );
  assert.equal(
    isAdminAccessAllowed({ anyOf: ['admin.override'] }, allowed),
    false,
  );
});

test('gates every admin route before the Shell or page content mounts', () => {
  const source = readFileSync(
    new URL('../src/browser/application.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /function AdminAccessBoundary/);
  assert.match(source, /title="无管理后台访问权限"/);
  assert.match(source, />\s*返回门户\s*<\/Button>/);
  assert.match(
    source,
    /<AdminAccessBoundary access=\{props\.adminAccess\} portalRoot=\{props\.portalRoot\}>\s*\{variant === 'desktop' && props\.mode === 'list' \? <Shell>\{content\}<\/Shell> : content\}/,
  );
  assert.match(
    source,
    /<AdminAccessBoundary access=\{adminAccess\} portalRoot=\{portalRoot\}>\s*<Shell>\{content\}<\/Shell>/,
  );
  assert.match(source, /path="\/admin\/\*"/);
  assert.match(source, /path="\/m\/admin\/\*"/);
  assert.doesNotMatch(source, /path="\/admin\/tasks\/:taskId"/);
  assert.doesNotMatch(source, /path="\/admin\/workflows\/:instanceId"/);
});
