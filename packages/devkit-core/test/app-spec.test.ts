import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  APP_SPEC_LIMITS,
  advisoryAppSpecDiagnostics,
  closeAppSpecChange,
  createAppSpecCapability,
  createAppSpecChange,
  initializeAppSpec,
  inspectAppSpec,
  OpenXiangdaApplicationServices,
} from "../src/index.js";

const devkitManifest = JSON.parse(
  readFileSync(join(import.meta.dirname, "../package.json"), "utf8")
) as { version: string; dependencies: Record<string, string> };

const contract = {
  appCode: "booking-app",
  resourceCodes: ["bookings"],
  actionCodes: ["booking.approve"],
};

function workspace() {
  return mkdtempSync(join(tmpdir(), "openxiangda-appspec-"));
}

test("keeps AppSpec optional and never discovers 1.x openspec or SDD", () => {
  const root = workspace();
  try {
    mkdirSync(join(root, "openspec", "changes"), { recursive: true });
    writeFileSync(join(root, "openspec", "project.md"), "# legacy SDD\n", "utf8");

    const context = inspectAppSpec(root, contract);
    assert.equal(context.enabled, false);
    assert.equal(context.stats.files, 0);
    assert.deepEqual(context.diagnostics, []);

    initializeAppSpec({ root, appCode: contract.appCode, appName: "预约应用" });
    assert.equal(readFileSync(join(root, "openspec", "project.md"), "utf8"), "# legacy SDD\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("creates a compact current spec and selects only related active context", () => {
  const root = workspace();
  try {
    const first = initializeAppSpec({
      root,
      appCode: contract.appCode,
      appName: "预约应用",
    });
    const second = initializeAppSpec({
      root,
      appCode: contract.appCode,
      appName: "预约应用",
    });
    assert.deepEqual(first.created, ["appspec/app.md"]);
    assert.deepEqual(second.existing, ["appspec/app.md"]);

    createAppSpecCapability({
      root,
      appCode: contract.appCode,
      appName: "预约应用",
      id: "CAP-BOOKING",
      title: "预约管理",
      resources: ["bookings"],
      actions: ["booking.approve"],
    });
    const capabilityPath = join(root, "appspec/capabilities/booking.md");
    writeFileSync(
      capabilityPath,
      `${readFileSync(capabilityPath, "utf8")}\n### REQ-BOOKING-001 预约时间\n\n用户只能提交有效时段。\n\n#### AC-BOOKING-001-01 拒绝无效时段\n\n- Given 时段无效\n- When 用户提交\n- Then 返回可解释错误\n`,
      "utf8"
    );
    createAppSpecChange({
      root,
      appCode: contract.appCode,
      appName: "预约应用",
      id: "booking-window",
      title: "限制预约时段",
      capabilities: ["CAP-BOOKING"],
      requirements: ["REQ-BOOKING-001"],
      resources: ["bookings"],
    });

    const index = inspectAppSpec(root, contract);
    assert.equal(index.schemaVersion, "openxiangda.appspec/context/v4");
    assert.deepEqual(index.capabilities, []);
    assert.deepEqual(index.activeChanges, []);
    assert.deepEqual(index.index.capabilities.map(item => item.id), ["CAP-BOOKING"]);
    assert.deepEqual(index.index.activeChanges.map(item => item.id), ["booking-window"]);

    const context = inspectAppSpec(root, contract, "booking-window");
    assert.equal(context.enabled, true);
    assert.equal(context.releaseGate, true);
    assert.deepEqual(context.capabilities.map(item => item.id), ["CAP-BOOKING"]);
    assert.deepEqual(context.activeChanges.map(item => item.id), ["booking-window"]);
    assert.equal(context.stats.requirements, 1);
    assert.equal(context.stats.acceptanceScenarios, 1);
    assert.equal(context.diagnostics.some(item => item.severity === "error"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps ordinary checks advisory while explicit AppSpec diagnostics stay strict", () => {
  const root = workspace();
  try {
    initializeAppSpec({ root, appCode: contract.appCode, appName: "预约应用" });
    createAppSpecChange({
      root,
      appCode: contract.appCode,
      appName: "预约应用",
      id: "unknown-contract",
      title: "引用不存在合同",
      resources: ["missing-resource"],
    });
    const path = join(root, "appspec/changes/active/unknown-contract.md");
    const verified = readFileSync(path, "utf8")
      .replace("status: draft", "status: verified")
      .replace("- 无。", "- [ ] 等待业务负责人确认");
    writeFileSync(path, verified, "utf8");

    const strict = inspectAppSpec(root, contract);
    assert.equal(strict.diagnostics.some(item => item.severity === "error"), true);
    assert.equal(
      strict.diagnostics.some(
        item => item.code === "APPSPEC_VERIFIED_CHANGE_HAS_OPEN_QUESTIONS"
      ),
      true
    );
    assert.equal(
      advisoryAppSpecDiagnostics(strict.diagnostics).some(
        item => item.severity === "error"
      ),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("archives a change without claiming deployment or verification", () => {
  const root = workspace();
  try {
    createAppSpecChange({
      root,
      appCode: contract.appCode,
      appName: "预约应用",
      id: "copy-change",
      title: "调整说明",
    });
    completeHandoff(root, "copy-change");
    const result = closeAppSpecChange({
      root,
      id: "copy-change",
      summary: "已完成代码与测试",
      currentSpec: "not-applicable",
      contract,
    });
    assert.equal(result.converged, true);
    assert.equal(result.status, "archived");
    assert.match(result.archived || "", /^appspec\/changes\/history\/\d{4}\/copy-change\.md$/);
    assert.ok(result.archived);
    const archived = readFileSync(join(root, result.archived), "utf8");
    assert.match(archived, /status: "archived"/);
    assert.match(archived, /currentSpec: "not-applicable"/);
    assert.match(archived, /归档不等于部署或生产验收/);
    const archivedContext = inspectAppSpec(root, contract, "copy-change");
    assert.deepEqual(
      archivedContext.archivedChanges.map(item => item.id),
      ["copy-change"]
    );
    assert.throws(
      () => closeAppSpecChange({ root, id: "copy-change", contract }),
      /APPSPEC_ACTIVE_CHANGE_NOT_FOUND/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps pending or unmerged durable requirements active until current specs converge", () => {
  const root = workspace();
  try {
    createAppSpecCapability({
      root,
      appCode: contract.appCode,
      appName: "预约应用",
      id: "CAP-BOOKING",
      title: "预约管理",
    });
    createAppSpecChange({
      root,
      appCode: contract.appCode,
      appName: "预约应用",
      id: "durable-rule",
      title: "新增长期规则",
      capabilities: ["CAP-BOOKING"],
    });
    const changePath = join(root, "appspec/changes/active/durable-rule.md");
    writeFileSync(
      changePath,
      `${readFileSync(changePath, "utf8")}\n### REQ-BOOKING-002 提前预约\n\n必须提前一天。\n\n#### AC-BOOKING-002-01 拒绝当天预约\n\n- Then 返回明确拒绝原因\n`,
      "utf8"
    );

    const pending = closeAppSpecChange({ root, id: "durable-rule", contract });
    assert.equal(pending.converged, false);
    assert.equal(
      pending.diagnostics.some(item => item.code === "APPSPEC_CURRENT_SPEC_NOT_CONVERGED"),
      true
    );
    assert.equal(exists(join(root, "appspec/changes/active/durable-rule.md")), true);

    const unmerged = closeAppSpecChange({
      root,
      id: "durable-rule",
      currentSpec: "merged",
      contract,
    });
    assert.equal(unmerged.converged, false);
    assert.equal(
      unmerged.diagnostics.some(
        item => item.code === "APPSPEC_CHANGE_REQUIREMENT_NOT_CURRENT"
      ),
      true
    );

    const capabilityPath = join(root, "appspec/capabilities/booking.md");
    writeFileSync(
      capabilityPath,
      `${readFileSync(capabilityPath, "utf8")}\n### REQ-BOOKING-002 提前预约\n\n必须提前一天。\n\n#### AC-BOOKING-002-01 拒绝当天预约\n\n- Then 返回明确拒绝原因\n`,
      "utf8"
    );
    completeHandoff(root, "durable-rule");
    const closed = closeAppSpecChange({
      root,
      id: "durable-rule",
      currentSpec: "merged",
      contract,
    });
    assert.equal(closed.converged, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects untouched L2 and L3 placeholders only in strict AppSpec diagnostics", () => {
  const root = workspace();
  try {
    createAppSpecChange({
      root,
      appCode: contract.appCode,
      appName: "预约应用",
      id: "critical-change",
      title: "高风险变更",
      risk: "L3",
    });
    const path = join(root, "appspec/changes/active/critical-change.md");
    const incomplete = inspectAppSpec(root, contract);
    const riskErrors = incomplete.diagnostics.filter(
      item => item.code === "APPSPEC_RISK_SECTION_INCOMPLETE"
    );
    assert.equal(riskErrors.length, 5);
    assert.equal(riskErrors.every(item => item.severity === "error"), true);
    assert.equal(
      advisoryAppSpecDiagnostics(riskErrors).every(item => item.severity === "warning"),
      true
    );

    const completed = readFileSync(path, "utf8")
      .replace("- [ ] 一个可观察的正向结果", "- [ ] 正向提交成功并返回业务编号")
      .replace("- [ ] 需要时补充拒绝、异常或权限反例", "- [ ] 无权限角色得到 403")
      .replace("- 无，或说明资源、字段、角色和数据范围变化。", "- 预约资源新增受限状态；仅管理员可修改。")
      .replace("- L3 才需要详细维护；其他变化写“无”。", "- 使用 revision 乐观并发；重复请求复用 idempotencyKey。")
      .replace("- 回退声明/代码并保持旧数据可读；如不适用请说明。", "- 回退应用声明，保留新增状态的只读兼容。")
      .replace("- L3 如涉及 ADR，在 front matter 的 decisions 中引用。", "- 不新增 ADR，因为沿用既有并发合同。")
      .replace("- 无。", "- 无未确认问题。");
    writeFileSync(path, completed, "utf8");
    assert.equal(
      inspectAppSpec(root, contract).diagnostics.some(
        item => item.code === "APPSPEC_RISK_SECTION_INCOMPLETE"
      ),
      false
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("separates workspace and selection digests while bounding selected content", () => {
  const root = workspace();
  try {
    for (const id of ["CAP-A", "CAP-B"] as const) {
      createAppSpecCapability({
        root,
        appCode: contract.appCode,
        appName: "预约应用",
        id,
        title: id,
      });
    }
    const capA = join(root, "appspec/capabilities/a.md");
    const capB = join(root, "appspec/capabilities/b.md");
    const first = inspectAppSpec(root, contract, "CAP-A");
    writeFileSync(capB, `${readFileSync(capB, "utf8")}\n无关正文变化\n`, "utf8");
    const second = inspectAppSpec(root, contract, "CAP-A");
    assert.notEqual(first.workspaceDigest, second.workspaceDigest);
    assert.equal(first.selectionDigest, second.selectionDigest);

    writeFileSync(capA, `${readFileSync(capA, "utf8")}\n${"A".repeat(150 * 1024)}\n`, "utf8");
    writeFileSync(capB, `${readFileSync(capB, "utf8")}\n${"B".repeat(150 * 1024)}\n`, "utf8");
    createAppSpecChange({
      root,
      appCode: contract.appCode,
      appName: "预约应用",
      id: "wide-change",
      title: "跨能力变更",
      capabilities: ["CAP-A", "CAP-B"],
    });
    const bounded = inspectAppSpec(root, contract, "wide-change");
    assert.equal(bounded.contextBudget.maximumBytes, APP_SPEC_LIMITS.maximumContextBytes);
    assert.equal(bounded.contextBudget.truncated, true);
    assert.ok(bounded.contextBudget.contentBytes <= APP_SPEC_LIMITS.maximumContextBytes);
    assert.equal(bounded.contextBudget.omitted.length, 1);
    assert.deepEqual(bounded.index.capabilities.map(item => item.id), ["CAP-A", "CAP-B"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function exists(path: string) {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

test("downgrades AppSpec errors in normal application check but not spec check", async () => {
  const root = workspace();
  try {
    mkdirSync(join(root, "apps/web/dist"), { recursive: true });
    mkdirSync(join(root, "apps/server"), { recursive: true });
    mkdirSync(join(root, "platform"), { recursive: true });
    mkdirSync(join(root, "packages/contracts/src"), { recursive: true });
    writeFileSync(join(root, "apps/web/dist/index.html"), "<main>ready</main>", "utf8");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: contract.appCode,
        version: "0.1.0",
        packageManager: "pnpm@10.15.1",
        scripts: {
          check: 'node -e "process.exit(0)"',
          test: 'node -e "process.exit(0)"',
          build: 'node -e "process.exit(0)"',
        },
        devDependencies: {
          "openxiangda-contracts":
            devkitManifest.dependencies["openxiangda-contracts"],
          "openxiangda-devkit-core": devkitManifest.version,
        },
      }),
      "utf8"
    );
    writeFileSync(
      join(root, "openxiangda.config.ts"),
      `export default ${JSON.stringify({
        schemaVersion: 3,
        app: { code: contract.appCode, name: "预约应用" },
        frontend: { root: "apps/web", routes: [] },
        backend: {
          root: "apps/server",
          runtime: "node",
          framework: "nestjs",
          enabled: false,
          isolation: "shared",
          resourceProfile: "light",
          secrets: [],
          operations: [],
        },
        platform: { root: "platform" },
        authz: {
          capabilities: [],
          roles: [],
          scopeDimensions: [],
          scopeSources: [],
          dataPolicies: [],
          authorizationTransitions: [],
        },
        data: { resources: [] },
        events: {
          schemas: [],
          subscriptions: [],
          timers: [],
          dateTriggers: [],
        },
        workflows: {
          definitions: [],
          bindings: [],
          activations: [],
          providers: [],
          editableParameters: [],
        },
      })};\n`,
      "utf8"
    );
    createAppSpecChange({
      root,
      appCode: contract.appCode,
      appName: "预约应用",
      id: "unknown-resource",
      title: "错误引用",
      resources: ["missing-resource"],
    });
    const path = join(root, "appspec/changes/active/unknown-resource.md");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace("status: draft", "status: verified"),
      "utf8"
    );

    const services = new OpenXiangdaApplicationServices();
    const strict = await services.appSpecCheck(root);
    assert.equal(strict.ok, false);
    assert.equal(
      strict.diagnostics.find(item => item.code === "APPSPEC_RESOURCE_UNKNOWN")
        ?.severity,
      "error"
    );

    const normal = await services.check(root);
    assert.equal(normal.ok, true);
    assert.equal(
      normal.diagnostics.find(item => item.code === "APPSPEC_RESOURCE_UNKNOWN")
        ?.severity,
      "warning"
    );
    assert.equal(normal.data?.appSpec.releaseGate, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function completeHandoff(root: string, id: string) {
  const path = join(root, `appspec/changes/active/${id}.md`);
  const content = readFileSync(path, "utf8").replace("## 验证与发布", "## 验证与发布\n\n本次完成文案检查，尚未部署，线上验收不适用。").replace("## 交接", "## 交接\n\n当前规格已经按实际规则更新，后续读取能力记录。");
  writeFileSync(path, content);
}
