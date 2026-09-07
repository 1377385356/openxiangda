// npm publication belongs to the maintainer's frozen-receipt release command.
// Git hosting CI verifies source and must not become a second publisher.
export function assertReleaseCiEntrypoints({ gitlabSource, mirrorSource, githubSource }) {
  for (const [name, source] of [["GitLab", gitlabSource], ["mirror", mirrorSource], ...(githubSource === undefined ? [] : [['GitHub', githubSource]])]) {
    if (/\b(?:verify:release|release:publish|release-publish\.mjs|recover-release\.mjs)\b|\b(?:changesets?|npm|pnpm|yarn)\s+publish\b|NPM_TOKEN|NODE_AUTH_TOKEN|OPENXIANGDA_RELEASE_GIT_PASSWORD/.test(source)) {
      throw new Error(`CI_REGISTRY_PUBLICATION_FORBIDDEN: ${name} only verifies source`);
    }
    if (!/^\s*-\s+(?:run:\s+)?pnpm verify:affected\s*$/m.test(source)) {
      throw new Error(`CI_SOURCE_VERIFICATION_MISSING: ${name}`);
    }
  }
}
