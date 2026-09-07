import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveCompletedRelease } from "../lib/release-history.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "openxiangda-release-history-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const receiptPath = join(root, "active.json");
  const artifactManifestPath = join(root, "manifest.json");
  const manifest = {
    schema: "openxiangda.release-artifacts/v1",
    head: "a".repeat(40),
    registry: "https://registry.npmjs.org",
    packages: [
      {
        name: "openxiangda",
        version: "2.0.0-alpha.1",
        integrity: "sha512-example",
      },
    ],
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(artifactManifestPath, manifestBytes);
  const receipt = {
    schema: "openxiangda.release-receipt/v2",
    head: manifest.head,
    registry: manifest.registry,
    phase: "complete",
    artifactManifestPath,
    artifactManifestSha256: createHash("sha256")
      .update(manifestBytes)
      .digest("hex"),
    candidates: manifest.packages,
  };
  const save = () =>
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  save();
  return {
    root,
    receiptPath,
    artifactManifestPath,
    receipt,
    save,
    input: { receiptPath, historyDirectory: join(root, "history") },
  };
}

test("成功清理临时材料后仍保留原始回执、版本清单与摘要", (t) => {
  const f = fixture(t);
  const original = readFileSync(f.receiptPath);
  const manifest = readFileSync(f.artifactManifestPath);
  const directory = archiveCompletedRelease(f.input);
  rmSync(f.receiptPath);
  rmSync(f.artifactManifestPath);
  assert.deepEqual(readFileSync(join(directory, "receipt.json")), original);
  assert.deepEqual(readFileSync(join(directory, "manifest.json")), manifest);
  const index = JSON.parse(readFileSync(join(directory, "index.json")));
  assert.equal(
    index.receiptSha256,
    createHash("sha256").update(original).digest("hex"),
  );
  assert.equal(index.artifactManifestSha256, f.receipt.artifactManifestSha256);
});

test("同一完成回执重试保持首次归档，不重写历史", (t) => {
  const f = fixture(t);
  const first = archiveCompletedRelease(f.input);
  const before = readFileSync(join(first, "index.json"));
  assert.equal(archiveCompletedRelease(f.input), first);
  assert.deepEqual(readFileSync(join(first, "index.json")), before);
});

test("历史篡改或同一提交出现不同回执时拒绝覆盖并保留活动材料", (t) => {
  const f = fixture(t);
  const directory = archiveCompletedRelease(f.input);
  f.receipt.candidates[0].version = "2.0.0-alpha.2";
  f.save();
  assert.throws(
    () => archiveCompletedRelease(f.input),
    /RELEASE_HISTORY_CONFLICT/,
  );
  assert.ok(existsSync(f.receiptPath));
  f.receipt.candidates[0].version = "2.0.0-alpha.1";
  f.save();
  writeFileSync(join(directory, "manifest.json"), "{}");
  assert.throws(
    () => archiveCompletedRelease(f.input),
    /RELEASE_HISTORY_CONFLICT/,
  );
  assert.ok(existsSync(f.artifactManifestPath));
});

test("未完成发布不能写成功历史，源提交不能构造其他路径", (t) => {
  const f = fixture(t);
  for (const phase of [
    "planned",
    "validated",
    "publishing-packages",
    "packages-published",
    "dist-tags-synchronized",
  ]) {
    f.receipt.phase = phase;
    f.save();
    assert.throws(
      () => archiveCompletedRelease(f.input),
      /COMPLETE_RECEIPT_REQUIRED/,
    );
  }
  f.receipt.phase = "complete";
  f.receipt.head = "../other";
  f.save();
  assert.throws(() => archiveCompletedRelease(f.input), /HEAD_INVALID/);
  assert.ok(!existsSync(f.input.historyDirectory));
});

test("制品清单改变或超出元数据上限时拒绝归档", (t) => {
  const f = fixture(t);
  writeFileSync(f.artifactManifestPath, "{}");
  assert.throws(() => archiveCompletedRelease(f.input), /MANIFEST_MISMATCH/);
  writeFileSync(f.receiptPath, Buffer.alloc(1024 * 1024 + 1));
  assert.throws(() => archiveCompletedRelease(f.input), /SIZE_EXCEEDED/);
});

test("归档目录不可写入时保留活动回执与制品，修复后可重试", (t) => {
  const f = fixture(t);
  writeFileSync(f.input.historyDirectory, "blocked");
  assert.throws(() => archiveCompletedRelease(f.input));
  assert.ok(existsSync(f.receiptPath));
  assert.ok(existsSync(f.artifactManifestPath));
  rmSync(f.input.historyDirectory);
  assert.ok(existsSync(archiveCompletedRelease(f.input)));
});
