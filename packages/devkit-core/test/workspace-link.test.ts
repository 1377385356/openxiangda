import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  OpenXiangdaApplicationServices,
  saveSession,
  workspaceSessionPath,
  type OpenXiangdaAppDeclaration,
} from "../src/index.js";

const devkitPackageManifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8")
) as {
  version: string;
  dependencies: Record<string, string>;
};

// 会话文件缺失时 loadSession 会回退到 CI 环境凭据；测试必须只面对文件状态。
delete process.env.OPENXIANGDA_BASE_URL;
delete process.env.OPENXIANGDA_TOKEN;

function configDeclaration(): OpenXiangdaAppDeclaration {
  return {
    schemaVersion: 3,
    app: { code: "reference-app", name: "Reference App" },
    frontend: { root: "apps/web" },
    platform: { root: "platform" },
    data: {
      resources: [
        {
          code: "instruments",
          name: "仪器",
          fields: [
            { code: "name", type: "text.short", label: "仪器名称", required: true },
          ],
        },
      ],
    },
  };
}

async function createWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "oxa-link-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "reference-app",
      version: "0.1.0",
      packageManager: "pnpm@10.15.1",
      devDependencies: {
        "openxiangda-contracts":
          devkitPackageManifest.dependencies["openxiangda-contracts"],
        "openxiangda-devkit-core": devkitPackageManifest.version,
      },
    })
  );
  writeFileSync(
    join(root, "openxiangda.config.ts"),
    `export default ${JSON.stringify(configDeclaration())};\n`
  );
  return root;
}

function linkPath(root: string) {
  return join(root, ".openxiangda", "link.json");
}

function writeLink(root: string, value: Record<string, unknown>) {
  mkdirSync(join(root, ".openxiangda"), { recursive: true });
  writeFileSync(linkPath(root), JSON.stringify(value));
}

test("link status reports the missing binding and rebind writes a fresh link", async () => {
  const root = await createWorkspace();
  const services = new OpenXiangdaApplicationServices();
  try {
    const unbound = await services.linkStatus(root);
    assert.equal(unbound.ok, false);
    assert.equal(
      unbound.diagnostics[0].code,
      "OPENXIANGDA_CONNECTED_LINK_REQUIRED"
    );

    const rebind = await services.rebindLink(root, {
      baseUrl: "https://platform-b.example.com",
    });
    assert.equal(rebind.ok, true);
    assert.equal(rebind.data?.changed, true);
    assert.equal(rebind.data?.previousBaseUrl, null);
    const persisted = JSON.parse(readFileSync(linkPath(root), "utf8"));
    assert.equal(persisted.schemaVersion, 2);
    assert.equal(persisted.appCode, "reference-app");
    assert.equal(persisted.baseUrl, "https://platform-b.example.com/service");
    assert.deepEqual(persisted.environments, []);

    const status = await services.linkStatus(root);
    assert.equal(status.ok, true);
    assert.equal(status.data?.baseUrl, "https://platform-b.example.com/service");
    assert.equal(status.data?.session.state, "missing");
    assert.equal(
      status.diagnostics.find(item =>
        item.code.startsWith("OPENXIANGDA_CONNECTED_LOGIN_REQUIRED")
      ) !== undefined,
      true
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebind is idempotent for the same platform and rejects foreign app links", async () => {
  const root = await createWorkspace();
  const services = new OpenXiangdaApplicationServices();
  try {
    await services.rebindLink(root, { baseUrl: "https://platform-b.example.com" });
    const before = readFileSync(linkPath(root), "utf8");
    const again = await services.rebindLink(root, {
      baseUrl: "https://platform-b.example.com/service/",
    });
    assert.equal(again.data?.changed, false);
    assert.equal(readFileSync(linkPath(root), "utf8"), before);

    writeLink(root, {
      schemaVersion: 2,
      appCode: "another-app",
      baseUrl: "https://platform-a.example.com/service",
      environments: [],
    });
    await assert.rejects(
      services.rebindLink(root, { baseUrl: "https://platform-b.example.com" }),
      /OPENXIANGDA_LINK_APP_CODE_CONFLICT/
    );
    await assert.rejects(
      services.rebindLink(root, { baseUrl: "not a url" }),
      (error: Error & { code?: string }) =>
        error.code === "OPENXIANGDA_PLATFORM_URL_INVALID"
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebind clears stale environments and warns about foreign sessions and origins", async () => {
  const root = await createWorkspace();
  const services = new OpenXiangdaApplicationServices();
  try {
    writeLink(root, {
      schemaVersion: 2,
      appCode: "reference-app",
      baseUrl: "https://platform-a.example.com/service",
      environments: [
        { id: "env-1", name: "test", kind: "preproduction" },
      ],
    });
    await saveSession(
      { baseUrl: "https://platform-a.example.com/service", accessToken: "token-a" },
      workspaceSessionPath(root)
    );
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "remote", "add", "origin", "https://git-a.example.com/owner/reference-app.git"]);

    const rebind = await services.rebindLink(root, {
      baseUrl: "https://platform-b.example.com",
    });
    assert.equal(rebind.ok, true);
    assert.equal(rebind.data?.previousBaseUrl, "https://platform-a.example.com/service");
    const codes = rebind.diagnostics.map(item => item.code);
    assert.equal(
      codes.includes("OPENXIANGDA_LINK_SESSION_STALE"),
      true,
      JSON.stringify(codes)
    );
    assert.equal(
      codes.includes("OPENXIANGDA_LINK_ORIGIN_FOREIGN"),
      true,
      JSON.stringify(codes)
    );
    assert.deepEqual(
      JSON.parse(readFileSync(linkPath(root), "utf8")).environments,
      []
    );
    const commands = rebind.nextActions.map(action => action.command);
    assert.equal(
      commands.includes("openxiangda login --base-url https://platform-b.example.com/service"),
      true
    );

    const status = await services.linkStatus(root);
    assert.equal(status.ok, true);
    assert.equal(status.data?.session.state, "file");
    assert.equal(
      status.diagnostics.some(item =>
        item.code === "OPENXIANGDA_PLATFORM_SESSION_MISMATCH"
      ),
      true
    );
    assert.equal(existsSync(workspaceSessionPath(root)), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
