const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

export function referenceRegistryConfiguration(candidatePackageNames = []) {
  const candidates = [...new Set(candidatePackageNames)].sort();
  for (const name of candidates) {
    if (!PACKAGE_NAME_PATTERN.test(name)) {
      throw new Error(`INVALID_REFERENCE_CANDIDATE_PACKAGE: ${name}`);
    }
  }
  const candidateRules = candidates
    .map(
      name => `  '${name}':
    access: $all
    publish: $all`
    )
    .join("\n");

  return `storage: /verdaccio/storage/data
max_body_size: 100mb
web:
  enabled: false
auth:
  htpasswd:
    file: /verdaccio/storage/htpasswd
    max_users: 1
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
${candidateRules ? `${candidateRules}\n` : ""}  # Exact candidate rules are local-only; every other package may use npmjs.
  '**':
    access: $all
    publish: $authenticated
    proxy: npmjs
server:
  keepAliveTimeout: 60
middlewares:
  audit:
    enabled: true
log:
  type: stdout
  format: pretty
  level: warn
`;
}
