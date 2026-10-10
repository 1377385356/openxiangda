import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJsonEditorValue } from '../src/browser/components/platform-fields/JsonField';
import {
  managedRichTextImageFileId,
  richTextPlainText,
  sanitizeRichText,
} from '../src/browser/components/platform-fields/rich-text-value';

test('JSON editor submits structured values and rejects invalid text', () => {
  assert.deepEqual(parseJsonEditorValue('{"enabled":true,"items":[1,2]}'), {
    enabled: true,
    items: [1, 2],
  });
  assert.equal(parseJsonEditorValue('  '), undefined);
  assert.throws(() => parseJsonEditorValue('{broken'), SyntaxError);
});

test('rich text plain fallback does not expose markup in compact contexts', () => {
  assert.equal(
    richTextPlainText('<h2>Heading</h2><p>Body <strong>text</strong></p>'),
    'Heading Body text'
  );
});

test('rich text recognizes perspective-bound and anonymous public image routes', () => {
  const fileId = '11111111-1111-4111-8111-111111111111';
  assert.equal(
    managedRichTextImageFileId(
      `/service/openxiangda-api/v2/applications/demo/native/data/docs/files/${fileId}/content?disposition=inline&perspective=regional-catalog`,
    ),
    fileId,
  );
  const publicImage =
    `/service/openxiangda-api/v2/applications/demo/anonymous-public/files/${fileId}/content?policyCode=catalog-public&environmentKey=production&disposition=inline&resourceCode=docs`;
  const sanitized = sanitizeRichText(`<p><img src="${publicImage}"></p>`);
  assert.match(sanitized, new RegExp(fileId));
});

test('rich HTML is sanitized even without a browser DOM', () => {
  assert.equal(sanitizeRichText('<p style="text-align:center">Safe<script>bad()</script><sup>2</sup></p>'), '<p style="text-align: center">Safe<sup>2</sup></p>');
  assert.equal(sanitizeRichText('<img src="https://evil.test/a.png">'), '');
});
