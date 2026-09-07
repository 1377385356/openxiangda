import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = join(repositoryRoot, "packages");
const packageRoot = resolve(process.cwd());

if (dirname(packageRoot) !== packagesRoot) {
  throw new Error(
    `PACKAGE_DIST_PRUNE_SCOPE_INVALID: ${packageRoot} is not a direct package workspace`
  );
}

const sourceRoot = join(packageRoot, "src");
const outputRoot = join(packageRoot, "dist");
if (!existsSync(outputRoot)) process.exit(0);

for (const output of files(outputRoot)) {
  const sourceStem = sourceStemForOutput(relative(outputRoot, output));
  if (!sourceStem) continue;
  const hasSource = [".ts", ".tsx", ".mts", ".cts"].some(extension =>
    existsSync(join(sourceRoot, `${sourceStem}${extension}`))
  );
  if (!hasSource) rmSync(output, { force: true });
}

function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
  });
}

function sourceStemForOutput(path) {
  for (const suffix of [
    ".d.ts.map",
    ".d.mts.map",
    ".d.cts.map",
    ".js.map",
    ".mjs.map",
    ".cjs.map",
    ".d.ts",
    ".d.mts",
    ".d.cts",
    ".js",
    ".mjs",
    ".cjs",
  ]) {
    if (path.endsWith(suffix)) return path.slice(0, -suffix.length);
  }
  return undefined;
}
