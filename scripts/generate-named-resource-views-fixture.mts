import { writeFileSync } from 'node:fs';
import { buildNamedResourceViewsFixture } from './lib/named-resource-views-fixture.mjs';

writeFileSync(
  new URL(
    '../packages/contracts/test/fixtures/named-resource-views.json',
    import.meta.url
  ),
  `${JSON.stringify(buildNamedResourceViewsFixture(), null, 2)}\n`
);
