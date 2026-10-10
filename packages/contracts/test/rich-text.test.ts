import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as esm from '../src/rich-text.js';
const cjs = createRequire(import.meta.url)('../dist/rich-text.cjs') as typeof esm;
const source = '/service/openxiangda-api/v2/applications/demo/native/data/docs/files/11111111-1111-4111-8111-111111111111/content?disposition=inline';
const target = source.replace('/docs/', '/articles/');
for (const [name, policy] of [['ESM', esm], ['CJS', cjs]] as const) {
  test(`${name}: rich HTML preserves bounded styles, table, tasks and media across repeated saves`, () => {
    const input = `<p style="text-align:center;text-indent:2em;font-size:20px;font-family:Arial;line-height:2;color:red;background-color:yellow">A <span style="color:blue">B</span><sup>2</sup><sub>3</sub>😀</p><hr><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked></label><div><p>Done</p></div></li></ul><table><tbody><tr><td colspan="2" colwidth="100,100" style="background-color:#ffeeaa">Cell</td></tr></tbody></table><video src="${source}" autoplay></video>`;
    const actual = policy.sanitizeRichTextHtml(input);
    for (const format of ['text-align: center', 'text-indent: 2em', 'font-size: 20px', 'line-height: 2', 'font-family: Arial', 'background-color: yellow', '<sup>2</sup>', '<sub>3</sub>', '<hr>', 'data-checked="true"', 'disabled=""', 'colwidth="100,100"', '<video', 'preload="metadata"']) assert.ok(actual.includes(format), format);
    assert.ok(!actual.includes('autoplay'));
    assert.equal(policy.sanitizeRichTextHtml(actual), actual);
    assert.equal(policy.richTextManagedMedia(actual)[0]?.kind, 'video');
    let calls = 0;
    const rewritten = policy.sanitizeRichTextHtml(actual, { rewriteMedia: media => { calls++; assert.equal(media.resourceCode, 'docs'); return target; } });
    assert.equal(calls, 1); assert.ok(rewritten.includes('/articles/'));
    assert.equal(policy.sanitizeRichTextHtml(rewritten), rewritten);
  });
  test(`${name}: unsafe HTML, CSS, foreign media and mutation payloads stay inert`, () => {
    for (const input of [
      '<p onclick="steal()" style="position:fixed;color:expression(alert(1));background:url(https://evil.test)">Safe<script>steal()</script></p>',
      '<svg><foreignObject><img src="x" onerror="steal()"></foreignObject></svg>',
      '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=1 onerror=steal()>">',
      '<a href="jav&#x61;script:steal()">X</a><img src="data:image/svg+xml,bad"><video src="https://evil.test/a.mp4"></video>',
      '<span style="color:var(--secret);font-family:foo;line-height:999;z-index:9">Text</span><iframe src="https://evil.test"></iframe>',
    ]) {
      const actual = policy.sanitizeRichTextHtml(input);
      assert.doesNotMatch(actual, /<(script|iframe|svg|math)|\son\w+=|position:|expression\(|url\(|var\(|src=|href="javascript:/i);
      assert.equal(policy.sanitizeRichTextHtml(actual), actual);
    }
    assert.throws(() => policy.sanitizeRichTextHtml('a'.repeat(policy.RICH_TEXT_POLICY_V2.maxBytes + 1)), /RICH_TEXT_TOO_LARGE/);
    assert.throws(() => policy.sanitizeRichTextHtml('<div>'.repeat(150) + 'x' + '</div>'.repeat(150)), /COMPLEXITY/);
  });
  test(`${name}: public references are rendering only and strict native paths cannot carry tokens`, () => {
    const publicSource = source.replace('/native/data/docs/', '/anonymous-public/').replace('?disposition=inline', '?policyCode=public-docs&environmentKey=production&disposition=inline&resourceCode=docs');
    assert.equal(policy.sanitizeRichTextHtml(`<img src="${publicSource}">`), '');
    assert.match(policy.sanitizeRichTextHtml(`<img src="${publicSource}">`, { display: true }), /anonymous-public/);
    for (const value of [source + '&token=secret', source + '#bad', 'https://other.test' + source, source + '&environmentKey=production', source + '&disposition=inline']) assert.equal(policy.parseRichTextManagedSource(value), null);
  });
}
