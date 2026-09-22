import assert from 'node:assert/strict';
import test from 'node:test';
import { isDirectorySearchKeyword } from '../src/browser/components/platform-fields/directory-keyword';

test('directory search accepts Han surnames and bounded ordinary keywords', () => {
  for (const keyword of ['李', '张', '𠮷', ' 李 ', 'ab', '张老师', 'x'.repeat(64)]) {
    assert.equal(isDirectorySearchKeyword(keyword), true, keyword);
  }
  for (const keyword of ['', ' ', 'a', '%', '_', 'x'.repeat(65)]) {
    assert.equal(isDirectorySearchKeyword(keyword), false, keyword);
  }
});
