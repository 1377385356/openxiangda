import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  collectWorkspaceToolchainDependencies,
  dependencyInstallDiagnostic,
  isOpenXiangdaPackageName,
  OpenXiangdaApplicationServices,
  toolchainCapsuleDiagnostic,
} from "openxiangda-devkit-core";
import {
  WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION,
  type Diagnostic,
  type WorkspaceTemplateBinding,
} from "openxiangda-contracts";
import {
  resolveCliToolchainCapsule,
  resolveDefaultTemplate,
} from "./toolchain-capsule.js";

export interface CreateWorkspaceInput {
  directory: string;
  appCode: string;
  name: string;
  install?: boolean;
  installOutput?: WorkspaceInstallOutput;
  templateRoot?: string;
  templateRef?: string;
  templateDigest?: string;
  localSdkRoot?: string;
}

export type WorkspaceInstallOutput = "inherit" | "capture";

export interface PrepareWorkspaceOptions {
  installOutput?: WorkspaceInstallOutput;
  toolchainCapsule?: ReturnType<typeof resolveCliToolchainCapsule>;
}

const TEMPLATE_MAX_FILES = 2_000;
const TEMPLATE_MAX_BYTES = 20 * 1024 * 1024;
const TEMPLATE_BINDING_PATH = join(".openxiangda", "template.json");

export async function createWorkspace(input: CreateWorkspaceInput) {
  const target = resolve(input.directory);
  const template = resolveWorkspaceTemplate({
    ...(input.templateRoot ? { templateRoot: input.templateRoot } : {}),
    ...(input.templateRef ? { templateRef: input.templateRef } : {}),
    ...(input.templateDigest ? { templateDigest: input.templateDigest } : {}),
  });
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(input.appCode)) {
    throw new Error("APP_CODE_INVALID: appCode 必须是 kebab-case");
  }
  if (!input.name.trim()) throw new Error("APP_NAME_REQUIRED");
  if (existsSync(target) && readdirSync(target).length > 0 && !isSessionOnlyWorkspace(target)) {
    throw new Error(`TARGET_DIRECTORY_NOT_EMPTY: ${target}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(template.root, target, {
    recursive: true,
    errorOnExist: false,
    filter: source => includeTemplatePath(template.root, source),
  });
  const packedGitignore = join(target, "_gitignore");
  if (existsSync(packedGitignore))
    renameSync(packedGitignore, join(target, ".gitignore"));
  replaceText(target, [
    ["instrument-center", input.appCode],
    ["仪器资源管理", input.name],
    ["openxiangda-application", input.appCode],
    ["OpenXiangda 应用", input.name],
  ]);
  writeWorkspaceTemplateBinding(target, template.binding);
  const toolchainCapsule = resolveCliToolchainCapsule(template.root);
  normalizePublishedDependencies(
    target,
    new Map(Object.entries(toolchainCapsule.packages))
  );
  const localSdkRoot = input.localSdkRoot
    ? configureLocalSdk(target, input.localSdkRoot)
    : undefined;
  const install = input.install !== false;
  if (install) {
    await prepareWorkspace(
      target,
      {
        ...(input.installOutput ? { installOutput: input.installOutput } : {}),
        toolchainCapsule,
      }
    );
  }
  return {
    root: target,
    appCode: input.appCode,
    name: input.name,
    installed: install,
    generated: install,
    generationDeferred: !install,
    template: template.binding,
    ...(localSdkRoot ? { localSdkRoot } : {}),
  };
}

export function isSessionOnlyWorkspace(root: string) {
  if (!existsSync(root) || !lstatSync(root).isDirectory()) return false;
  const entries = readdirSync(root);
  if (entries.length !== 1 || entries[0] !== '.openxiangda') return false;
  const directory = join(root, '.openxiangda');
  if (!lstatSync(directory).isDirectory()) return false;
  const files = readdirSync(directory);
  return files.includes('session.json') && files.every(file => ['session.json', '.gitignore'].includes(file) && lstatSync(join(directory, file)).isFile());
}

export function resolveWorkspaceTemplate(input: {
  templateRoot?: string;
  templateRef?: string;
  templateDigest?: string;
}) {
  const requestedRef = String(input.templateRef || "").trim();
  let root: string;
  let ref: string;
  if (input.templateRoot) {
    root = resolve(input.templateRoot);
    ref = requestedRef || pathToFileURL(root).href;
  } else if (!requestedRef || requestedRef === "builtin:application") {
    root = resolveDefaultTemplate();
    ref = "builtin:application";
  } else if (requestedRef.startsWith("file:")) {
    try {
      root = resolve(fileURLToPath(requestedRef));
    } catch {
      throw new Error(`TEMPLATE_REF_INVALID: ${requestedRef}`);
    }
    ref = pathToFileURL(root).href;
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(requestedRef)) {
    throw new Error(
      `TEMPLATE_REF_UNSUPPORTED: CLI 只接受 builtin:application 或本地 file 引用`
    );
  } else {
    root = resolve(requestedRef);
    ref = pathToFileURL(root).href;
  }
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`TEMPLATE_NOT_FOUND: ${root}`);
  }
  const digest = calculateTemplateDigest(root);
  if (input.templateDigest) {
    const expected = normalizeTemplateDigest(input.templateDigest);
    if (expected !== digest) {
      throw Object.assign(
        new Error(
          `TEMPLATE_DIGEST_MISMATCH: 期望 ${expected}，实际 ${digest}`
        ),
        {
          code: "TEMPLATE_DIGEST_MISMATCH",
          retryable: false,
          data: { expected, actual: digest },
        }
      );
    }
  }
  return {
    root,
    binding: {
      schemaVersion: WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION,
      ref,
      digest,
    } satisfies WorkspaceTemplateBinding,
  };
}

export function calculateTemplateDigest(templateRoot: string) {
  const root = resolve(templateRoot);
  const hash = createHash("sha256");
  let fileCount = 0;
  let totalBytes = 0;
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name)
    )) {
      const path = join(directory, entry.name);
      if (!includeTemplatePath(root, path)) continue;
      const relativePath = relative(root, path).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) {
        throw new Error(`TEMPLATE_SYMLINK_FORBIDDEN: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      fileCount += 1;
      const size = statSync(path).size;
      totalBytes += size;
      if (fileCount > TEMPLATE_MAX_FILES) {
        throw new Error(
          `TEMPLATE_FILE_LIMIT_EXCEEDED: 模板最多 ${TEMPLATE_MAX_FILES} 个文件`
        );
      }
      if (totalBytes > TEMPLATE_MAX_BYTES) {
        throw new Error(
          `TEMPLATE_BYTES_LIMIT_EXCEEDED: 模板最多 ${TEMPLATE_MAX_BYTES} 字节`
        );
      }
      hash.update(`file\0${relativePath}\0${size}\0`, "utf8");
      hash.update(readFileSync(path));
      hash.update("\0", "utf8");
    }
  };
  visit(root);
  return `sha256:${hash.digest("hex")}` as const;
}

export function readWorkspaceTemplateBinding(
  workspaceRoot: string
): WorkspaceTemplateBinding | null {
  const path = join(resolve(workspaceRoot), TEMPLATE_BINDING_PATH);
  if (!existsSync(path)) return null;
  let value: Partial<WorkspaceTemplateBinding>;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`WORKSPACE_TEMPLATE_BINDING_INVALID: ${path}`);
  }
  if (
    value.schemaVersion !== WORKSPACE_TEMPLATE_BINDING_SCHEMA_VERSION ||
    typeof value.ref !== "string" ||
    !value.ref ||
    typeof value.digest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(value.digest)
  ) {
    throw new Error(`WORKSPACE_TEMPLATE_BINDING_INVALID: ${path}`);
  }
  return value as WorkspaceTemplateBinding;
}

function writeWorkspaceTemplateBinding(
  workspaceRoot: string,
  binding: WorkspaceTemplateBinding
) {
  const path = join(workspaceRoot, TEMPLATE_BINDING_PATH);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(binding, null, 2)}\n`, "utf8");
}

function normalizeTemplateDigest(value: string) {
  const digest = String(value || "").trim().toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error(
      "TEMPLATE_DIGEST_INVALID: templateDigest 必须是 sha256:<64位小写十六进制>"
    );
  }
  return digest as `sha256:${string}`;
}

export async function prepareWorkspace(
  directory: string,
  options: PrepareWorkspaceOptions = {}
) {
  const root = resolve(directory);
  const toolchainCapsule =
    options.toolchainCapsule || resolveCliToolchainCapsule();
  const capsuleDiagnostic = toolchainCapsuleDiagnostic(
    collectWorkspaceToolchainDependencies(root),
    toolchainCapsule
  );
  if (capsuleDiagnostic) throw workspaceCapsuleError(capsuleDiagnostic);
  const result = spawnSync(
    "pnpm",
    ["install"],
    options.installOutput === "capture"
      ? { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }
      : { cwd: root, encoding: "utf8", stdio: "inherit", timeout: 180_000 }
  );
  if (result.error || result.status !== 0) throw workspaceInstallError(result);
  const generated = await new OpenXiangdaApplicationServices({
    toolchainCapsule,
  }).generate({ root });
  if (!generated.ok) {
    throw new Error(
      `WORKSPACE_GENERATE_FAILED: ${generated.diagnostics
        .map((item) => item.message)
        .join("; ")}`
    );
  }
  return generated.data;
}

function workspaceCapsuleError(diagnostic: Diagnostic) {
  return Object.assign(
    new Error(`${diagnostic.code}: ${diagnostic.message}`),
    {
      code: diagnostic.code,
      data: diagnostic,
      retryable: false,
    }
  );
}

function workspaceInstallError(result: Parameters<typeof dependencyInstallDiagnostic>[0]) {
  return Object.assign(
    new Error(
      `WORKSPACE_INSTALL_FAILED: 工作区源码已保留，${dependencyInstallDiagnostic(result)}`
    ),
    { code: "WORKSPACE_INSTALL_FAILED", retryable: true }
  );
}

function includeTemplatePath(templateRoot: string, source: string) {
  const path = relative(templateRoot, source).replaceAll("\\", "/");
  if (!path) return true;
  return !/(?:^|\/)(?:node_modules|dist|coverage|playwright-report|test-results|\.openxiangda|\.turbo|\.turbopack|\.umi|\.umi-production)(?:\/|$)/.test(
    path
  );
}

function configureLocalSdk(workspaceRoot: string, inputRoot: string) {
  const sdkRoot = resolve(inputRoot);
  const packagesRoot = join(sdkRoot, "packages");
  if (!existsSync(packagesRoot)) {
    throw new Error(`LOCAL_SDK_ROOT_INVALID: ${sdkRoot}`);
  }
  const overrides: Record<string, string> = {};
  const localPackages = new Map<
    string,
    { root: string; manifest: Record<string, unknown> }
  >();
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageRoot = join(packagesRoot, entry.name);
    const packageJsonPath = join(packageRoot, "package.json");
    if (!existsSync(packageJsonPath)) continue;
    const manifest = JSON.parse(
      readFileSync(packageJsonPath, "utf8")
    ) as Record<string, unknown>;
    const name = typeof manifest.name === "string" ? manifest.name : "";
    if (isOpenXiangdaPackageName(name)) {
      localPackages.set(name, { root: packageRoot, manifest });
    }
  }
  const required = workspaceSdkDependencies(workspaceRoot, localPackages);
  const artifactsRoot = join(
    workspaceRoot,
    ".openxiangda",
    "local-sdk-artifacts"
  );
  mkdirSync(artifactsRoot, { recursive: true });
  for (const name of [...required].sort()) {
    const localPackage = localPackages.get(name);
    if (!localPackage) throw new Error(`LOCAL_SDK_PACKAGE_NOT_FOUND: ${name}`);
    const packageRoot = localPackage.root;
    const built = spawnSync("pnpm", ["run", "build"], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    if (built.status !== 0) {
      throw new Error(
        `LOCAL_SDK_BUILD_FAILED: ${name}\n${String(
          built.stdout || ""
        )}${String(built.stderr || "")}`
      );
    }
    const packed = spawnSync(
      "pnpm",
      ["pack", "--pack-destination", artifactsRoot],
      { cwd: packageRoot, encoding: "utf8" }
    );
    if (packed.status !== 0) {
      throw new Error(
        `LOCAL_SDK_PACK_FAILED: ${name}\n${String(
          packed.stdout || ""
        )}${String(packed.stderr || "")}`
      );
    }
    const tarball = String(packed.stdout || "")
      .trim()
      .split(/\r?\n/)
      .at(-1);
    if (!tarball || !existsSync(tarball)) {
      throw new Error(`LOCAL_SDK_TARBALL_NOT_FOUND: ${name}`);
    }
    overrides[name] = `file:${tarball}`;
  }
  if (Object.keys(overrides).length === 0) {
    throw new Error(`LOCAL_SDK_PACKAGES_NOT_FOUND: ${packagesRoot}`);
  }
  const rootPackagePath = join(workspaceRoot, "package.json");
  const rootPackage = JSON.parse(
    readFileSync(rootPackagePath, "utf8")
  ) as Record<string, unknown>;
  const existingPnpm =
    rootPackage.pnpm && typeof rootPackage.pnpm === "object"
      ? (rootPackage.pnpm as Record<string, unknown>)
      : {};
  rootPackage.pnpm = {
    ...existingPnpm,
    overrides: {
      ...(existingPnpm.overrides && typeof existingPnpm.overrides === "object"
        ? (existingPnpm.overrides as Record<string, string>)
        : {}),
      ...overrides,
    },
  };
  writeFileSync(
    rootPackagePath,
    `${JSON.stringify(rootPackage, null, 2)}\n`,
    "utf8"
  );
  return sdkRoot;
}

function workspaceSdkDependencies(
  workspaceRoot: string,
  localPackages: ReadonlyMap<
    string,
    { root: string; manifest: Record<string, unknown> }
  >
) {
  const required = new Set<string>();
  const queue: string[] = [];
  const addDependencies = (
    manifest: Record<string, unknown>,
    sections: string[]
  ) => {
    for (const section of sections) {
      const dependencies = manifest[section];
      if (!dependencies || typeof dependencies !== "object") continue;
      for (const name of Object.keys(dependencies)) {
        if (!localPackages.has(name) || required.has(name)) continue;
        required.add(name);
        queue.push(name);
      }
    }
  };
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git", ".openxiangda"].includes(entry.name))
        continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name === "package.json") {
        addDependencies(
          JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>,
          ["dependencies", "devDependencies", "optionalDependencies"]
        );
      }
    }
  };
  visit(workspaceRoot);
  for (let index = 0; index < queue.length; index += 1) {
    const localPackage = localPackages.get(queue[index]!);
    if (localPackage) {
      addDependencies(localPackage.manifest, [
        "dependencies",
        "optionalDependencies",
      ]);
    }
  }
  return required;
}

function normalizePublishedDependencies(
  root: string,
  dependencyVersions: ReadonlyMap<string, string>
) {
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git", ".openxiangda"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.isFile() || entry.name !== "package.json") continue;
      const packageJson = JSON.parse(readFileSync(path, "utf8")) as Record<
        string,
        unknown
      >;
      let changed = false;
      for (const section of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ]) {
        const dependencies = packageJson[section];
        if (!dependencies || typeof dependencies !== "object") continue;
        for (const [name, version] of Object.entries(dependencies)) {
          if (!isOpenXiangdaPackageName(name) || typeof version !== "string")
            continue;
          if (!version.startsWith("workspace:")) continue;
          const declaredVersion = version.slice("workspace:".length);
          const publishedVersion = dependencyVersions.get(name);
          if (!publishedVersion && declaredVersion === "*") {
            throw new Error(`TEMPLATE_DEPENDENCY_VERSION_UNRESOLVED: ${name}`);
          }
          (dependencies as Record<string, string>)[name] =
            publishedVersion || declaredVersion;
          changed = true;
        }
      }
      if (changed)
        writeFileSync(
          path,
          `${JSON.stringify(packageJson, null, 2)}\n`,
          "utf8"
        );
    }
  };
  visit(root);
}

function replaceText(
  root: string,
  replacements: Array<[search: string, replacement: string]>
) {
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".git", ".openxiangda"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && isText(path)) {
        let content = readFileSync(path, "utf8");
        for (const [search, replacement] of replacements) {
          content = content.replaceAll(search, replacement);
        }
        writeFileSync(path, content, "utf8");
      }
    }
  };
  visit(root);
}

function isText(path: string) {
  if (statSync(path).size > 2_000_000) return false;
  return (
    /\.(?:json|ts|tsx|js|mjs|css|html|md|ya?ml|txt)$/.test(path) ||
    /(?:Dockerfile|\.gitignore|pnpm-workspace\.yaml)$/.test(path)
  );
}
