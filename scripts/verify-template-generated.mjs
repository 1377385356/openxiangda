import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createWorkspace } from "../packages/cli/dist/create-workspace.js";
import { resolveCliToolchainCapsule } from "../packages/cli/dist/toolchain-capsule.js";
import { OpenXiangdaApplicationServices } from "../packages/devkit-core/dist/index.js";

const templateRoot = resolve(import.meta.dirname, "../templates/application");
const scratchRoot = mkdtempSync(join(tmpdir(), "openxiangda-template-generated-"));
const root = join(scratchRoot, "application");

try {
  await createWorkspace({
    directory: root,
    appCode: "openxiangda-application",
    name: "OpenXiangda 应用",
    templateRoot,
    install: false,
  });
  const result = await new OpenXiangdaApplicationServices({
    toolchainCapsule: resolveCliToolchainCapsule(templateRoot),
  }).generate({
    root,
    check: true,
  });

  if (!result.ok) {
    const codes = result.diagnostics.map(item => item.code).join(",");
    throw new Error(`TEMPLATE_GENERATED_CONTRACTS_INVALID:${codes}`);
  }

  process.stdout.write(
    "Verified source template generated contracts through the CLI-owned capsule.\n"
  );
} finally {
  rmSync(scratchRoot, { recursive: true, force: true });
}
