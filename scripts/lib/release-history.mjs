import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const RECEIPT_LIMIT = 1024 * 1024;
const MANIFEST_LIMIT = 4 * 1024 * 1024;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function readBounded(path, limit) {
  if (!lstatSync(path).isFile())
    throw new Error("RELEASE_HISTORY_FILE_REQUIRED");
  const fd = openSync(path, "r");
  try {
    if (!fstatSync(fd).isFile())
      throw new Error("RELEASE_HISTORY_FILE_REQUIRED");
    const buffer = Buffer.alloc(limit + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = readSync(fd, buffer, used, buffer.length - used, null);
      if (!count) break;
      used += count;
    }
    if (used > limit) throw new Error("RELEASE_HISTORY_SIZE_EXCEEDED");
    return buffer.subarray(0, used);
  } finally {
    closeSync(fd);
  }
}

/** 归档已完成发布的原始证据；不会清理活动回执或代替发布状态机。 */
export function archiveCompletedRelease({ receiptPath, historyDirectory }) {
  const receiptBytes = readBounded(receiptPath, RECEIPT_LIMIT);
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  if (
    receipt.schema !== "openxiangda.release-receipt/v2" ||
    receipt.phase !== "complete"
  ) {
    throw new Error("RELEASE_HISTORY_COMPLETE_RECEIPT_REQUIRED");
  }
  if (!/^[0-9a-f]{40}$/.test(receipt.head || ""))
    throw new Error("RELEASE_HISTORY_HEAD_INVALID");
  const manifestBytes = readBounded(
    receipt.artifactManifestPath,
    MANIFEST_LIMIT,
  );
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    digest(manifestBytes) !== receipt.artifactManifestSha256 ||
    manifest.schema !== "openxiangda.release-artifacts/v1" ||
    manifest.head !== receipt.head ||
    manifest.registry !== receipt.registry
  ) {
    throw new Error("RELEASE_HISTORY_MANIFEST_MISMATCH");
  }
  const identity = {
    schema: "openxiangda.release-history/v1",
    head: receipt.head,
    registry: receipt.registry,
    receiptSha256: digest(receiptBytes),
    artifactManifestSha256: digest(manifestBytes),
  };
  const directory = join(historyDirectory, receipt.head);
  const assertExisting = () => {
    if (!lstatSync(directory).isDirectory())
      throw new Error("RELEASE_HISTORY_CONFLICT");
    const index = JSON.parse(
      readBounded(join(directory, "index.json"), RECEIPT_LIMIT).toString(
        "utf8",
      ),
    );
    if (
      Object.entries(identity).some(([key, value]) => index[key] !== value) ||
      digest(readBounded(join(directory, "receipt.json"), RECEIPT_LIMIT)) !==
        identity.receiptSha256 ||
      digest(readBounded(join(directory, "manifest.json"), MANIFEST_LIMIT)) !==
        identity.artifactManifestSha256
    ) {
      throw new Error("RELEASE_HISTORY_CONFLICT");
    }
    return directory;
  };
  if (existsSync(directory)) return assertExisting();
  mkdirSync(historyDirectory, { recursive: true, mode: 0o700 });
  const temporary = mkdtempSync(join(historyDirectory, `.${receipt.head}.`));
  try {
    const files = {
      "receipt.json": receiptBytes,
      "manifest.json": manifestBytes,
      "index.json": `${JSON.stringify({ ...identity, archivedAt: new Date().toISOString() }, null, 2)}\n`,
    };
    for (const [name, bytes] of Object.entries(files)) {
      writeFileSync(join(temporary, name), bytes, { mode: 0o600, flag: "wx" });
    }
    try {
      renameSync(temporary, directory);
    } catch (error) {
      if (!existsSync(directory)) throw error;
      return assertExisting();
    }
    return assertExisting();
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
