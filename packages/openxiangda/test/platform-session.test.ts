import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const clientSource = readFileSync(
  new URL('../src/browser/platform-client.ts', import.meta.url),
  'utf8',
);
const runtimeSource = readFileSync(
  new URL('../src/browser/runtime.tsx', import.meta.url),
  'utf8',
);

test('browser runtime refreshes only the authoritative platform session', () => {
  assert.match(clientSource, /\/service\/api\/auth\/refresh/);
  assert.doesNotMatch(
    clientSource,
    /applicationAuthenticationBase\(\)\}\/refresh/,
  );
  assert.doesNotMatch(clientSource, /refreshApplicationSession/);
});

test('logout invalidation follows the platform-provided session scope', () => {
  assert.match(clientSource, /platformSessionCoordination/);
  assert.match(clientSource, /platformSessionKeys/);
  assert.doesNotMatch(clientSource, /openxiangda-platform-auth/);
  assert.match(clientSource, /subscribePlatformSessionInvalidation/);
  assert.match(runtimeSource, /subscribePlatformSessionInvalidation/);
  assert.doesNotMatch(clientSource, /openxiangda-auth:\$\{applicationCode\(\)\}/);
});

test('application login receipts do not expose a second session lifecycle', () => {
  assert.doesNotMatch(clientSource, /ApplicationSessionReceiptV2/);
  assert.doesNotMatch(clientSource, /sessionEpoch/);
  assert.doesNotMatch(clientSource, /recovering-session/);
});
