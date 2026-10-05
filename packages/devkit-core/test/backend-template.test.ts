import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the clean server template only owns platform bootstrap', () => {
  const source = readFileSync(new URL('../templates/backend/src/app.module.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../templates/backend/src/main.ts', import.meta.url), 'utf8');
  assert.match(source, /OpenXiangdaModule\.forApplication/);
  assert.doesNotMatch(source, /OPENXIANGDA_(?:APP_CODE|ENVIRONMENT_ID|OAUTH_CLIENT_ID)/);
  assert.match(source, /eventHandlerManifest/);
  assert.match(source, /eventSigningSecretsFromEnvironment/);
  assert.match(main, /bootstrapOpenXiangdaApplication\(AppModule\)/);
  assert.doesNotMatch(main, /NestFactory|FastifyAdapter/);
  const legacyMarkers = ['oauth' + 'Client', 'Workflow', 'instrument' + '-context'];
  assert.doesNotMatch(source, new RegExp(legacyMarkers.join('|')));
  assert.doesNotMatch(source, /createData|updateData|deleteData|queryData/);
});

test('backend dependency build accepts optional vendored archives without exposing build mounts at runtime', () => {
  const source = readFileSync(new URL('../templates/backend/Dockerfile', import.meta.url), 'utf8');
  const [build, runtime] = source.split(/FROM node:[^\n]+ AS runtime/);
  assert.ok(build.indexOf('target=/source,readonly') < build.indexOf('install --no-frozen-lockfile'));
  assert.match(build, /if \[ -d \/source\/vendor \]; then cp -a \/source\/vendor \/workspace\/vendor; fi/);
  assert.doesNotMatch(runtime, /\/source|--mount/);
  assert.match(runtime, /COPY --from=build --chown=1000:1000 \/output \/app/);
});
