import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildNamedResourceViewsFixture } from '../../../scripts/lib/named-resource-views-fixture.mjs';

test('the server named-view corpus matches the current public compiler bytes', () => {
  assert.deepEqual(
    buildNamedResourceViewsFixture(),
    JSON.parse(
      readFileSync(
        new URL(
          '../../contracts/test/fixtures/named-resource-views.json',
          import.meta.url
        ),
        'utf8'
      )
    )
  );
});
