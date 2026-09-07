import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateApplicationUiContract, validateApplicationUiSource } from '../src/application-ui-contract.js';

test('requires library fields only for actual application input declarations', () => {
  const valid = "import { SurfaceFieldControl } from 'openxiangda/field-kit'; import { Input } from 'antd'; const hint = '<input>'; const page = <div contentEditable={false}><Input/><SurfaceFieldControl /></div>;";
  assert.deepEqual(validateApplicationUiSource(valid, 'Page.tsx'), []);
  const errors = validateApplicationUiSource("import React, { createElement as h } from 'react'; const page = <><input/><select/><textarea/><div contentEditable /></>; h('input'); React.createElement('textarea');", 'Page.tsx');
  assert.equal(errors.length, 6);
  assert.ok(errors.every(error => error.code === 'OPENXIANGDA_PLATFORM_FIELD_REQUIRED' && error.path?.startsWith('Page.tsx:1:')));
});

test('recognizes aliased desktop imports and type-only mobile imports', () => {
  assert.equal(validateApplicationUiSource("import { DatePicker as DateField } from 'antd';", 'MobileForm.tsx')[0]?.code, 'OPENXIANGDA_MOBILE_FIELD_REQUIRED');
  assert.deepEqual(validateApplicationUiSource("import * as Antd from 'antd'; import 'antd/dist/reset.css'; const b = <Antd.Button/>;", 'MobileForm.tsx'), []);
  assert.equal(validateApplicationUiSource("import * as Antd from 'antd'; const b = <Antd.Input/>;", 'MobileForm.tsx').length, 1);
  assert.deepEqual(validateApplicationUiSource("import type { InputProps } from 'antd'; import { Button, Form } from 'antd'; import { Input } from 'openxiangda/mobile';", 'MobileForm.tsx'), []);
  assert.equal(validateApplicationUiSource("export { Select as Choice } from 'antd';", 'mobile/controls.tsx').length, 1);
});

test('guides runtime mobile root imports to the scoped platform entry without blocking types', () => {
  assert.equal(validateApplicationUiSource("import { Input } from 'antd-mobile';", 'Page.tsx')[0]?.code, 'OPENXIANGDA_MOBILE_SCOPED_IMPORT_REQUIRED');
  assert.deepEqual(validateApplicationUiSource("import type { InputProps } from 'antd-mobile'; export { type PopupProps } from 'antd-mobile';", 'Page.tsx'), []);
});

test('checks mobile dependency graph and keeps generated/vendor code outside app policy', () => {
  const root = mkdtempSync(join(tmpdir(), 'oxa-ui-contract-'));
  try {
    const src = join(root, 'apps/web/src');
    mkdirSync(join(src, 'mobile'), { recursive: true });
    mkdirSync(join(src, 'generated'));
    writeFileSync(join(src, 'mobile/Page.tsx'), "import { Field } from '../Shared'; export const Page = () => <Field/>;");
    writeFileSync(join(src, 'Shared.tsx'), "import { Input } from 'antd'; export const Field = () => <Input/>;");
    writeFileSync(join(src, 'generated/Untouched.tsx'), 'export const field = <input/>;');
    const errors = validateApplicationUiContract(root);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 'OPENXIANGDA_MOBILE_FIELD_REQUIRED');
    assert.match(errors[0].path || '', /Shared.tsx:1:1$/);
    writeFileSync(join(src, 'mobile/Page.tsx'), "import { type Field } from '../Shared'; export const Page = () => <div/>;");
    assert.deepEqual(validateApplicationUiContract(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
