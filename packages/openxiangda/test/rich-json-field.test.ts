import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('rich text editor mirrors the platform allowlist and JSON has readonly formatting', () => {
  const richValue = readFileSync(
    new URL('../src/browser/components/platform-fields/rich-text-value.ts', import.meta.url),
    'utf8'
  );
  const richField = readFileSync(
    new URL('../src/browser/components/platform-fields/RichTextField.tsx', import.meta.url),
    'utf8'
  );
  const jsonField = readFileSync(
    new URL('../src/browser/components/platform-fields/JsonField.tsx', import.meta.url),
    'utf8'
  );
  const attachmentList = readFileSync(
    new URL('../src/browser/components/platform-fields/AttachmentFileList.tsx', import.meta.url),
    'utf8'
  );
  assert.match(richValue, /MANAGED_IMAGE/);
  assert.match(richValue, /disposition=inline/);
  assert.match(richValue, /MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE/);
  assert.match(richValue, /richTextHydrationHtml/);
  assert.match(richValue, /noopener noreferrer/);
  assert.match(richField, /contentEditable/);
  assert.match(richField, /dangerouslySetInnerHTML/);
  assert.match(richField, /FileImageOutlined/);
  assert.match(richField, /dataRichTextImageSource/);
  assert.match(richField, /fetchDataFileBlob/);
  assert.match(richField, /editableRichTextValue/);
  assert.match(richField, /10 \* 1024 \* 1024/);
  assert.match(richField, /INLINE_IMAGE_MAX_COUNT = 20/);
  assert.match(attachmentList, /file\.thumbnailUrl/);
  assert.match(attachmentList, /fetchDataFileBlob/);
  assert.match(attachmentList, /'thumbnail'/);
  assert.doesNotMatch(attachmentList, /src=\{file\.thumbnailUrl\}/);
  assert.match(attachmentList, /oxa-file-thumbnail/);
  assert.match(jsonField, /JSON\.stringify\(value, null, 2\)/);
  assert.match(jsonField, /JSON 格式无效/);
});
