import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('signature canvas emits managed PNG, SHA-256 and business metadata', () => {
  const field = readFileSync(
    new URL('../src/browser/components/platform-fields/SignatureField.tsx', import.meta.url),
    'utf8'
  );
  assert.match(field, /toBlob\(resolve, 'image\/png'\)/);
  assert.match(field, /digest\('SHA-256'/);
  assert.match(field, /signedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(field, /points: points\.current\.slice\(\)/);
  assert.match(field, /file: managedFile\(uploaded\)/);
  assert.doesNotMatch(field, /dataURL|base64/);
});

test('signature has separate desktop/mobile dialogs and serial stays server-owned', () => {
  const signature = readFileSync(
    new URL('../src/browser/components/platform-fields/SignatureField.tsx', import.meta.url),
    'utf8'
  );
  const surface = readFileSync(
    new URL('../src/browser/components/resource/SurfaceFields.tsx', import.meta.url),
    'utf8'
  );
  const form = readFileSync(
    new URL('../src/browser/components/resource/GeneratedResourceForm.tsx', import.meta.url),
    'utf8'
  );
  const helpers = readFileSync(
    new URL('../src/browser/components/resource/resource-page-helpers.ts', import.meta.url),
    'utf8'
  );
  assert.match(signature, /<Popup/);
  assert.match(signature, /<Modal/);
  assert.match(surface, /保存后由系统自动生成/);
  assert.match(
    helpers,
    /field\.widget !== 'readonly' && fieldWriteAuthorized\(field, mode/
  );
  assert.match(form, /canWrite: \(fieldCode, childField, childOperation\) =>\s+fieldWriteAuthorized\(/);
  assert.match(form, /signatureSigner\(identity\.subjectProfile\)/);
});
