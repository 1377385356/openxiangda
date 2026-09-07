import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publicPackages } from "./lib/release-package-state.mjs";
import { assertReleaseCiEntrypoints } from "./lib/release-ci-boundary.mjs";
import {
  PUBLIC_PACKAGE_NAMES,
  PUBLIC_SKILL_NAME,
  RETIRED_PACKAGE_NAMES,
  RETIRED_SKILL_NAMES,
} from "./lib/public-package-policy.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = readJson(resolve(repositoryRoot, "package.json"));
const templatePackage = readJson(
  resolve(repositoryRoot, "templates/application/package.json")
);
const aggregatePackage = templatePackage.name;
const exclusion = `--filter=!${aggregatePackage}`;
const releasePackages = publicPackages(repositoryRoot);
const cliPackage = releasePackages.find(
  item => item.manifest.name === "openxiangda-cli"
);
if (!cliPackage) throw new Error("OPENXIANGDA_CLI_PACKAGE_MISSING");
const rootFacadePackage = releasePackages.find(
  item => item.manifest.name === "openxiangda"
);
if (!rootFacadePackage) throw new Error("OPENXIANGDA_ROOT_PACKAGE_MISSING");
const packageDirectories = readdirSync(resolve(repositoryRoot, "packages"), {
  withFileTypes: true,
})
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();
const expectedPackageDirectories = releasePackages
  .map(item => basename(item.root))
  .sort();
if (
  JSON.stringify(packageDirectories) !== JSON.stringify(expectedPackageDirectories)
) {
  throw new Error(
    `PUBLIC_PACKAGE_DIRECTORY_SET_INVALID: ${packageDirectories.join(", ")}`
  );
}
for (const retired of RETIRED_PACKAGE_NAMES) {
  const directory = resolve(
    repositoryRoot,
    "packages",
    retired.replace(/^openxiangda-/, "")
  );
  if (existsSync(directory)) {
    throw new Error(
      `RETIRED_PUBLIC_PACKAGE_DIRECTORY_EXISTS: ${relative(repositoryRoot, directory)}`
    );
  }
}

const activePackageSurfaces = [
  "package.json",
  "pnpm-lock.yaml",
  "README.md",
  "docs/.vitepress/config.ts",
  "docs/index.md",
  "docs/llms.txt",
  "docs/getting-started.md",
  "docs/concepts.md",
  "docs/frontend.md",
  "docs/public-access.md",
  "docs/field-components.md",
  "docs/backend.md",
  "docs/data-authz.md",
  "docs/delivery.md",
  "docs/reference/cli.md",
  "docs/reference/mcp.md",
  "skills/manifest.json",
  "skills/openxiangda-v2/SKILL.md",
  "skills/openxiangda-v2/references/appspec.md",
  "skills/openxiangda-v2/references/concepts.md",
  "skills/openxiangda-v2/references/backend.md",
  "skills/openxiangda-v2/references/cli.md",
  "skills/openxiangda-v2/references/data-authz.md",
  "skills/openxiangda-v2/references/delivery.md",
  "skills/openxiangda-v2/references/development.md",
  "skills/openxiangda-v2/references/frontend.md",
  "skills/openxiangda-v2/references/public-access.md",
  "skills/openxiangda-v2/references/testing.md",
  "skills/openxiangda-v2/references/workflow-events.md",
  "skills/openxiangda-v2/references/upgrading.md",
  ...releasePackages.map(item => relative(repositoryRoot, join(item.root, "package.json"))),
];
for (const file of activePackageSurfaces) {
  const source = readFileSync(resolve(repositoryRoot, file), "utf8");
  for (const retired of RETIRED_PACKAGE_NAMES) {
    if (source.includes(retired)) {
      throw new Error(`RETIRED_PUBLIC_PACKAGE_ACTIVE: ${file} -> ${retired}`);
    }
  }
  for (const retired of RETIRED_SKILL_NAMES) {
    if (source.includes(retired)) {
      throw new Error(`RETIRED_PUBLIC_SKILL_ACTIVE: ${file} -> ${retired}`);
    }
  }
}

const skillManifest = readJson(resolve(repositoryRoot, "skills/manifest.json"));
if (
  skillManifest.skills?.length !== 1 ||
  skillManifest.skills[0]?.name !== PUBLIC_SKILL_NAME
) {
  throw new Error(`PUBLIC_SKILL_SET_INVALID: expected only ${PUBLIC_SKILL_NAME}`);
}
for (const retired of RETIRED_SKILL_NAMES) {
  if (existsSync(resolve(repositoryRoot, "skills", retired))) {
    throw new Error(`RETIRED_PUBLIC_SKILL_DIRECTORY_EXISTS: ${retired}`);
  }
}
if (releasePackages.length !== PUBLIC_PACKAGE_NAMES.length) {
  throw new Error("PUBLIC_PACKAGE_COUNT_DRIFTED");
}
const templateAgentContract = readFileSync(resolve(repositoryRoot, "templates/application/AGENTS.md"), "utf8");
const publicSkillContract = readFileSync(resolve(repositoryRoot, "skills/openxiangda-v2/SKILL.md"), "utf8");
for (const marker of ["<!-- OPENXIANGDA:BEGIN -->", "<!-- OPENXIANGDA:END -->"]) {
  if (templateAgentContract.split(marker).length !== 2) throw new Error(`TEMPLATE_AGENT_MARKER_INVALID: ${marker}`);
}
if (!publicSkillContract.includes("openxiangda@__OPENXIANGDA_VERSION__")) throw new Error("CLI_BOOTSTRAP_VERSION_DRIFTED");
for (const file of ["skills/openxiangda-v2/SKILL.md", "templates/application/README.md"]) {
  if (/openxiangda(?:-cli)?@latest/.test(readFileSync(resolve(repositoryRoot, file), "utf8"))) throw new Error(`MOVING_CLI_BOOTSTRAP_TAG_FORBIDDEN: ${file}`);
}
// 正文一致性由主题生成器检查；这里验证结构，不锁定自然语言句子。
const { DOCUMENTATION_TOPICS, documentationReferenceFile } = await import("../packages/devkit-core/src/documentation.ts");
for (const topic of DOCUMENTATION_TOPICS) {
  if (!publicSkillContract.includes(`references/${documentationReferenceFile(topic.id)}`)) throw new Error(`SKILL_TOPIC_ROUTE_MISSING: ${topic.id}`);
}
const { execFileSync } = await import("node:child_process");
execFileSync(process.execPath, [resolve(repositoryRoot, "scripts/sync-developer-guidance.mjs"), "--check"], { stdio: "inherit" });
if (templatePackage.scripts?.openxiangda !== "openxiangda") {
  throw new Error("WORKSPACE_PINNED_CLI_SCRIPT_MISSING");
}
if (rootPackage.packageManager !== "pnpm@10.15.1") {
  throw new Error("PACKAGE_MANAGER_VERSION_DRIFTED");
}
const workspaceConfig = readFileSync(
  resolve(repositoryRoot, "pnpm-workspace.yaml"),
  "utf8"
);
if (!/^linkWorkspacePackages:\s*true$/m.test(workspaceConfig)) {
  throw new Error("EXACT_WORKSPACE_LINKING_REQUIRED");
}
const releaseVersions = new Map(
  releasePackages.map(item => [item.manifest.name, item.manifest.version])
);
for (const item of releasePackages) {
  for (const [dependency, version] of Object.entries(
    item.manifest.dependencies || {}
  )) {
    if (!releaseVersions.has(dependency)) continue;
    if (version !== releaseVersions.get(dependency)) {
      throw new Error(
        `PUBLIC_INTERNAL_DEPENDENCY_NOT_EXACT: ${item.manifest.name} -> ${dependency}@${version}`
      );
    }
  }
}

const releaseScripts = {
  "verify:release": "node scripts/release-publish.mjs --validate-only",
  "verify:release:full":
    "node scripts/release-publish.mjs --validate-only --full",
  "release:publish": "node scripts/release-publish.mjs",
  "release:publish:full": "node scripts/release-publish.mjs --full",
  "release:sync-reference":
    "node scripts/sync-published-reference-lock.mjs --write",
};
for (const [scriptName, expected] of Object.entries(releaseScripts)) {
  const actual = String(rootPackage.scripts?.[scriptName] || "");
  if (actual !== expected) {
    throw new Error(
      `RELEASE_COMMAND_BOUNDARY_INVALID: ${scriptName} must be ${expected}`
    );
  }
}

assertReleaseCiEntrypoints({
  gitlabSource: readFileSync(resolve(repositoryRoot, ".gitlab-ci.yml"), "utf8"),
  mirrorSource: readFileSync(resolve(repositoryRoot, ".gitea/workflows/release.yml"), "utf8"),
  githubSource: readFileSync(resolve(repositoryRoot, '.github/workflows/source-checks.yml'), 'utf8'),
});

const releasePublisherSource = readFileSync(
  resolve(repositoryRoot, "scripts", "release-publish.mjs"),
  "utf8"
);
if (releasePublisherSource.includes("sync-published-reference-lock.mjs")) {
  throw new Error(
    "RELEASE_REFERENCE_OWNER_INVALID: npm publication must not mutate the independent reference repository"
  );
}
if (!releasePublisherSource.includes("releaseInvocationAction")) {
  throw new Error(
    "RELEASE_RECEIPT_GATE_MISSING: publication must require the validated receipt state machine"
  );
}

for (const scriptName of ["build", "check", "test", "verify", "verify:affected"]) {
  const command = String(rootPackage.scripts?.[scriptName] || "");
  if (!command.includes(exclusion)) {
    throw new Error(
      `WORKSPACE_AGGREGATE_FILTER_MISSING: ${scriptName} must exclude ${aggregatePackage}`
    );
  }
}

for (const scriptName of ["build", "check", "test"]) {
  const command = String(templatePackage.scripts?.[scriptName] || "");
  if (!command.includes("pnpm --recursive")) {
    throw new Error(
      `TEMPLATE_AGGREGATE_SCRIPT_MISSING: ${scriptName} must remain usable after scaffolding`
    );
  }
}

const packagesRoot = resolve(repositoryRoot, "packages");
for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = join(packagesRoot, entry.name, "package.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = readJson(manifestPath);
  if (manifest.private === true) continue;
  const releaseBuild = String(manifest.scripts?.["build:release"] || "");
  if (
    releaseBuild !==
    "node ../../scripts/prune-package-dist.mjs && pnpm build"
  ) {
    throw new Error(
      `PACKAGE_RELEASE_BUILD_MISSING: ${manifest.name} must prune orphan output before release build`
    );
  }
  const prepack = String(manifest.scripts?.prepack || "");
  if (!prepack.includes("pnpm build:release")) {
    throw new Error(
      `PACKAGE_PREPACK_RELEASE_BUILD_MISSING: ${manifest.name} must prune orphan output before pack`
    );
  }
}

process.stdout.write(
  `Verified single-owner workspace/release orchestration, orphan-free prepack outputs, and ${aggregatePackage} as scaffold-only.\n`
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
