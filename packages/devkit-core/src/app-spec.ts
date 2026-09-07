import { createHash } from "node:crypto";
import {
  existsSync,
  openSync,
  readSync,
  closeSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  SCHEMA_VERSIONS,
  type Diagnostic,
} from "openxiangda-contracts";

export const APP_SPEC_SCHEMAS = {
  app: "openxiangda.appspec/app/v1",
  capability: "openxiangda.appspec/capability/v1",
  change: "openxiangda.appspec/change/v1",
  decision: "openxiangda.appspec/decision/v1",
  design: "openxiangda.appspec/design/v1",
  context: "openxiangda.appspec/context/v4",
} as const;

export const APP_SPEC_LIMITS = {
  maximumFiles: 128,
  maximumFileBytes: 256 * 1024,
  maximumTotalBytes: 2 * 1024 * 1024,
  maximumContextBytes: 256 * 1024,
  maximumDirectoryEntries: 256,
  maximumHistoryDepth: 1,
} as const;

export type AppSpecRisk = "L1" | "L2" | "L3";
export type AppSpecCurrentSpecStatus = "pending" | "merged" | "not-applicable";
export type AppSpecDocumentKind = "app" | "capability" | "change" | "decision" | "design";

type MetadataValue = string | string[] | boolean;

export interface AppSpecContractIndex {
  appCode: string;
  resourceCodes: string[];
  actionCodes: string[];
  configDigest?: string;
  contractDigest?: string;
  aiCatalogDigest?: string;
}

export interface AppSpecDocument {
  kind: AppSpecDocumentKind;
  id: string;
  title: string;
  status: string;
  path: string;
  metadata: Record<string, MetadataValue>;
  requirementIds: string[];
  acceptanceIds: string[];
  references: {
    capabilities: string[];
    requirements: string[];
    resources: string[];
    actions: string[];
    decisions: string[];
    documents: string[];
  };
  content: string;
}

export interface AppSpecDocumentSummary {
  kind: AppSpecDocumentKind;
  id: string;
  title: string;
  status: string;
  path: string;
  risk: AppSpecRisk | null;
  requirementCount: number;
  acceptanceScenarioCount: number;
}

export interface AppSpecContext {
  schemaVersion: typeof APP_SPEC_SCHEMAS.context;
  enabled: boolean;
  mode: "guided";
  releaseGate: true;
  root: "appspec";
  selector: string | null;
  contract: AppSpecContractIndex;
  index: {
    application: AppSpecDocumentSummary | null;
    capabilities: AppSpecDocumentSummary[];
    activeChanges: AppSpecDocumentSummary[];
    decisions: AppSpecDocumentSummary[];
    designs: AppSpecDocumentSummary[];
    history: AppSpecDocumentSummary[];
  };
  application: AppSpecDocument | null;
  capabilities: AppSpecDocument[];
  activeChanges: AppSpecDocument[];
  archivedChanges: AppSpecDocument[];
  decisions: AppSpecDocument[];
  designs: AppSpecDocument[];
  historyPage: { offset: number; limit: number; total: number; nextOffset: number | null };
  contextBudget: {
    maximumBytes: number;
    contentBytes: number;
    truncated: boolean;
    omitted: AppSpecDocumentSummary[];
  };
  stats: {
    files: number;
    bytes: number;
    capabilities: number;
    activeChanges: number;
    historyChanges: number;
    decisions: number;
    designs: number;
    requirements: number;
    acceptanceScenarios: number;
  };
  workspaceDigest: string | null;
  selectionDigest: string | null;
  diagnostics: Diagnostic[];
}

export interface InitializeAppSpecInput {
  root: string;
  appCode: string;
  appName: string;
}

export interface CreateAppSpecCapabilityInput extends InitializeAppSpecInput {
  id: string;
  title: string;
  resources?: string[];
  actions?: string[];
}

export interface CreateAppSpecChangeInput extends InitializeAppSpecInput {
  id: string;
  title: string;
  risk?: AppSpecRisk;
  summary?: string;
  capabilities?: string[];
  requirements?: string[];
  resources?: string[];
  actions?: string[];
}

export interface CloseAppSpecChangeInput {
  root: string;
  id: string;
  summary?: string;
  currentSpec?: Exclude<AppSpecCurrentSpecStatus, "pending">;
  contract: AppSpecContractIndex;
}

const APP_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CHANGE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CAPABILITY_ID = /^CAP-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const DECISION_ID = /^ADR-[0-9]{4}(?:-[A-Z0-9]+)*$/;
const REQUIREMENT_ID = /^REQ-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const ACCEPTANCE_ID = /^AC-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function initializeAppSpec(input: InitializeAppSpecInput) {
  if (!APP_ID.test(input.appCode)) {
    throw stableError("APPSPEC_APP_CODE_INVALID", input.appCode);
  }
  const paths = appSpecPaths(input.root);
  for (const directory of [
    paths.root,
    paths.capabilities,
    paths.activeChanges,
    paths.history,
    paths.decisions,
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  const created: string[] = [];
  const existing: string[] = [];
  if (existsSync(paths.app)) {
    existing.push(relativePath(input.root, paths.app));
  } else {
    exclusiveWrite(paths.app, renderApplicationSpec(input.appCode, input.appName));
    created.push(relativePath(input.root, paths.app));
  }
  return {
    schemaVersion: APP_SPEC_SCHEMAS.context,
    enabled: true,
    advisory: false,
    releaseGate: true,
    created,
    existing,
  };
}

export function createAppSpecCapability(input: CreateAppSpecCapabilityInput) {
  initializeAppSpec(input);
  if (!CAPABILITY_ID.test(input.id)) {
    throw stableError("APPSPEC_CAPABILITY_ID_INVALID", input.id);
  }
  if (!input.title.trim()) throw stableError("APPSPEC_TITLE_REQUIRED", input.id);
  const path = join(
    appSpecPaths(input.root).capabilities,
    `${fileNameForId(input.id, "CAP-")}.md`
  );
  exclusiveWrite(
    path,
    renderCapabilitySpec({
      id: input.id,
      title: input.title.trim(),
      resources: normalized(input.resources),
      actions: normalized(input.actions),
    })
  );
  return {
    schemaVersion: APP_SPEC_SCHEMAS.context,
    enabled: true,
    advisory: false,
    releaseGate: true,
    created: relativePath(input.root, path),
  };
}

export function createAppSpecChange(input: CreateAppSpecChangeInput) {
  initializeAppSpec(input);
  if (!CHANGE_ID.test(input.id)) {
    throw stableError("APPSPEC_CHANGE_ID_INVALID", input.id);
  }
  if (historyCandidates(input.root, input.id, 0, []).paths.some(path => basename(path) === `${input.id}.md`)) {
    throw stableError('APPSPEC_HISTORY_CHANGE_EXISTS', input.id);
  }
  if (!input.title.trim()) throw stableError("APPSPEC_TITLE_REQUIRED", input.id);
  const risk = input.risk || "L1";
  if (!["L1", "L2", "L3"].includes(risk)) {
    throw stableError("APPSPEC_RISK_INVALID", String(risk));
  }
  const path = join(appSpecPaths(input.root).activeChanges, `${input.id}.md`);
  exclusiveWrite(
    path,
    renderChangeSpec({
      id: input.id,
      title: input.title.trim(),
      risk,
      summary: input.summary?.trim() || "",
      capabilities: normalized(input.capabilities),
      requirements: normalized(input.requirements),
      resources: normalized(input.resources),
      actions: normalized(input.actions),
    })
  );
  return {
    schemaVersion: APP_SPEC_SCHEMAS.context,
    enabled: true,
    advisory: false,
    releaseGate: true,
    created: relativePath(input.root, path),
    risk,
    status: "draft",
  };
}

export function closeAppSpecChange(input: CloseAppSpecChangeInput) {
  if (!CHANGE_ID.test(input.id)) {
    throw stableError("APPSPEC_CHANGE_ID_INVALID", input.id);
  }
  const paths = appSpecPaths(input.root);
  const source = join(paths.activeChanges, `${input.id}.md`);
  if (!existsSync(source)) {
    throw stableError("APPSPEC_ACTIVE_CHANGE_NOT_FOUND", input.id);
  }
  assertRegularFile(source);
  const year = String(new Date().getUTCFullYear());
  const historyDirectory = join(paths.history, year);
  const target = join(historyDirectory, `${input.id}.md`);
  if (existsSync(target)) {
    throw stableError("APPSPEC_HISTORY_CHANGE_EXISTS", relativePath(input.root, target));
  }
  mkdirSync(historyDirectory, { recursive: true });
  const sourceContent = readFileSync(source, "utf8");
  const effectiveContent = input.currentSpec
    ? setFrontMatterValue(sourceContent, "currentSpec", input.currentSpec)
    : sourceContent;
  const diagnostics: Diagnostic[] = [];
  const document = parseAppSpecDocument(
    input.root,
    source,
    "change",
    effectiveContent,
    diagnostics
  );
  if (!document || document.id !== input.id) {
    throw stableError("APPSPEC_ACTIVE_CHANGE_INVALID", input.id);
  }
  const collectionDiagnostics: Diagnostic[] = [];
  const collection = collectDocuments(input.root, collectionDiagnostics);
  const sourcePointer = relativePath(input.root, source);
  const relatedPaths = new Set<string>([sourcePointer]);
  for (const capability of collection.capabilities) {
    if (
      document.references.capabilities.includes(capability.id) ||
      capability.requirementIds.some(id =>
        [...document.references.requirements, ...document.requirementIds].includes(id)
      ) ||
      capability.acceptanceIds.some(id => document.acceptanceIds.includes(id))
    ) {
      relatedPaths.add(capability.path);
    }
  }
  for (const decision of collection.decisions) {
    if (document.references.decisions.includes(decision.id)) {
      relatedPaths.add(decision.path);
    }
  }
  const collectionFatalCodes = new Set([
    "APPSPEC_FILE_LIMIT_EXCEEDED",
    "APPSPEC_FILE_UNREADABLE",
    "APPSPEC_FILE_INVALID",
    "APPSPEC_FILE_SIZE_EXCEEDED",
    "APPSPEC_TOTAL_SIZE_EXCEEDED",
    "APPSPEC_DIRECTORY_INVALID",
    "APPSPEC_DIRECTORY_ENTRY_LIMIT_EXCEEDED",
    "APPSPEC_SYMLINK_FORBIDDEN",
    "APPSPEC_HISTORY_DEPTH_EXCEEDED",
  ]);
  diagnostics.push(
    ...collectionDiagnostics.filter(
      item =>
        item.severity === "error" &&
        item.path !== sourcePointer &&
        (collectionFatalCodes.has(item.code) ||
          (item.path !== undefined && relatedPaths.has(item.path)))
    )
  );
  validateCloseConvergence(document, collection, input.contract, diagnostics);
  if (diagnostics.some(item => item.severity === "error")) {
    return {
      schemaVersion: APP_SPEC_SCHEMAS.context,
      enabled: true,
      advisory: false,
      releaseGate: true,
      archived: null,
      status: document.status,
      converged: false,
      diagnostics,
    };
  }
  renameSync(source, target);
  const closedAt = new Date().toISOString();
  const updated = appendClosure(
    setFrontMatterValue(
      setFrontMatterValue(effectiveContent, "status", "archived"),
      "closedAt",
      closedAt
    ),
    input.summary?.trim() || "变更记录已归档；验收与发布结果以实际证据为准。",
    closedAt
  );
  atomicReplace(target, updated);
  return {
    schemaVersion: APP_SPEC_SCHEMAS.context,
    enabled: true,
    advisory: false,
    releaseGate: true,
    archived: relativePath(input.root, target),
    status: "archived",
    converged: true,
    diagnostics,
  };
}

export function inspectAppSpec(
  root: string,
  contract: AppSpecContractIndex,
  selector?: string,
  historyOffset = 0
): AppSpecContext {
  const paths = appSpecPaths(root);
  if (!existsSync(paths.root)) return emptyContext(contract, selector);
  const diagnostics: Diagnostic[] = [];
  if (!isRegularDirectory(paths.root)) {
    diagnostics.push(
      issue(
        "error",
        "APPSPEC_ROOT_INVALID",
        "appspec 必须是普通目录，不能是符号链接",
        "appspec"
      )
    );
    return emptyContext(contract, selector, diagnostics, true);
  }

  const collection = collectDocuments(root, diagnostics, selector, historyOffset);
  const application = collection.app[0] || null;
  validateDocuments(collection, contract, diagnostics);
  const selected = selectContext(collection, selector, diagnostics);
  const allDocuments = [
    ...collection.app,
    ...collection.capabilities,
    ...collection.activeChanges,
    ...collection.history,
    ...collection.decisions,
    ...collection.designs,
  ];
  const index = summarizeCollection(collection);
  const workspaceDigest = digestDocuments(allDocuments.filter(document => !document.path.startsWith("appspec/changes/history/")), contract);
  const selectionDocuments = selectedDocuments(application, selected);
  const selectionDigest =
    allDocuments.length === 0
      ? null
      : digestDocuments(
          selectionDocuments,
          contract,
          selector ? [`selector:${selector}`] : [`index:${JSON.stringify(index)}`]
        );
  const budgeted = applyContextBudget(application, selected);
  if (budgeted.contextBudget.truncated) {
    diagnostics.push(
      issue(
        "warning",
        "APPSPEC_CONTEXT_BUDGET_EXCEEDED",
        `相关 AppSpec 正文超过 ${APP_SPEC_LIMITS.maximumContextBytes} 字节预算；已省略 ${budgeted.contextBudget.omitted.length} 份低优先级文档，可按稳定 ID 单独读取`,
        "appspec"
      )
    );
  }
  return {
    schemaVersion: APP_SPEC_SCHEMAS.context,
    enabled: true,
    mode: "guided",
    releaseGate: true,
    root: "appspec",
    selector: selector || null,
    contract,
    index,
    application: budgeted.application,
    capabilities: budgeted.capabilities,
    activeChanges: budgeted.activeChanges,
    archivedChanges: budgeted.archivedChanges,
    decisions: budgeted.decisions,
    designs: budgeted.designs,
    historyPage: collection.historyPage,
    contextBudget: budgeted.contextBudget,
    stats: {
      files: allDocuments.length,
      bytes: collection.bytes,
      capabilities: collection.capabilities.length,
      activeChanges: collection.activeChanges.length,
      historyChanges: collection.historyPage.total,
      decisions: collection.decisions.length,
      designs: collection.designs.length,
      requirements: unique(
        [...collection.app, ...collection.capabilities, ...collection.designs].flatMap(document => document.requirementIds)
      ).length,
      acceptanceScenarios: unique(
        [...collection.app, ...collection.capabilities, ...collection.designs].flatMap(document => document.acceptanceIds)
      ).length,
    },
    workspaceDigest,
    selectionDigest,
    diagnostics,
  };
}

export function advisoryAppSpecDiagnostics(diagnostics: Diagnostic[]) {
  return diagnostics.map(diagnostic => ({
    ...diagnostic,
    severity:
      diagnostic.severity === "error" ? ("warning" as const) : diagnostic.severity,
    remediation:
      diagnostic.remediation ||
      "运行 openxiangda spec check 查看文档诊断；普通 check 可以继续，正式发布按阶段核对需求与验收",
  }));
}

export function summarizeAppSpecContext(context: AppSpecContext) {
  return {
    enabled: context.enabled,
    mode: context.mode,
    releaseGate: context.releaseGate,
    workspaceDigest: context.workspaceDigest,
    selectionDigest: context.selectionDigest,
    historyPage: context.historyPage,
    contextBudget: context.contextBudget,
    stats: context.stats,
    diagnostics: {
      errors: context.diagnostics.filter(item => item.severity === "error").length,
      warnings: context.diagnostics.filter(item => item.severity === "warning").length,
      info: context.diagnostics.filter(item => item.severity === "info").length,
    },
    nextCommand: context.enabled
      ? "openxiangda spec context --json"
      : "openxiangda spec init",
  };
}

function emptyContext(
  contract: AppSpecContractIndex,
  selector?: string,
  diagnostics: Diagnostic[] = [],
  enabled = false
): AppSpecContext {
  return {
    schemaVersion: APP_SPEC_SCHEMAS.context,
    enabled,
    mode: "guided",
    releaseGate: true,
    root: "appspec",
    selector: selector || null,
    contract,
    index: {
      application: null,
      capabilities: [],
      activeChanges: [],
      decisions: [],
      designs: [],
      history: [],
    },
    application: null,
    capabilities: [],
    activeChanges: [],
    archivedChanges: [],
    decisions: [],
    designs: [],
    historyPage: { offset: 0, limit: 50, total: 0, nextOffset: null },
    contextBudget: {
      maximumBytes: APP_SPEC_LIMITS.maximumContextBytes,
      contentBytes: 0,
      truncated: false,
      omitted: [],
    },
    stats: {
      files: 0,
      bytes: 0,
      capabilities: 0,
      activeChanges: 0,
      historyChanges: 0,
      decisions: 0,
      designs: 0,
      requirements: 0,
      acceptanceScenarios: 0,
    },
    workspaceDigest: null,
    selectionDigest: null,
    diagnostics,
  };
}

function historyCandidates(root: string, selector: string | undefined, offset: number, diagnostics: Diagnostic[]) {
  if (!Number.isSafeInteger(offset) || offset < 0) throw stableError('APPSPEC_HISTORY_OFFSET_INVALID', String(offset));
  const directory = appSpecPaths(root).history;
  const all: string[] = [];
  let selected: string | undefined;
  const started = Date.now();
  if (existsSync(directory)) {
    if (!isRegularDirectory(directory)) diagnostics.push(issue('error', 'APPSPEC_DIRECTORY_INVALID', '历史目录必须是普通目录', 'appspec/changes/history'));
    else {
      const years = readdirSync(directory, { withFileTypes: true }).sort((a, b) => b.name.localeCompare(a.name));
      for (const year of years.slice(0, 256)) {
        const path = join(directory, year.name);
        if (year.isSymbolicLink()) { diagnostics.push(issue('error', 'APPSPEC_SYMLINK_FORBIDDEN', '历史记录不能使用符号链接', relativePath(root, path))); continue; }
        if (year.isFile() && year.name.endsWith('.md')) all.push(path);
        else if (year.isDirectory()) {
          // 稳定 ID 的读取不依赖当前索引页；正文仍受单文件与上下文预算约束。
          const direct = selector && CHANGE_ID.test(selector) ? join(path, `${selector}.md`) : undefined;
          if (direct && existsSync(direct)) selected = direct;
          if (all.length >= 100_000 || Date.now() - started > 5_000) continue;
          for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (all.length >= 100_000) break;
            const file = join(path, entry.name);
            if (entry.isFile() && entry.name.endsWith('.md')) all.push(file);
            else if (entry.isSymbolicLink() || entry.isDirectory()) diagnostics.push(issue('warning', 'APPSPEC_HISTORY_ENTRY_INVALID', '历史只索引 history/<year>/*.md 普通文件', relativePath(root, file)));
          }
        }
      }
      if (years.length > 256 || all.length >= 100_000 || Date.now() - started > 5_000) diagnostics.push(issue('warning', 'APPSPEC_HISTORY_INDEX_LIMIT', '历史索引达到读取预算；记录仍保留，可用稳定变更 ID 读取正文', 'appspec/changes/history'));
    }
  }
  const paths = all.slice(offset, offset + 50);
  const match = selected || (selector ? all.find(path => basename(path) === `${selector}.md`) : undefined);
  if (match && !paths.includes(match)) paths.push(match);
  return { paths, page: { offset, limit: 50, total: all.length, nextOffset: offset + 50 < all.length ? offset + 50 : null } };
}

function collectDocuments(root: string, diagnostics: Diagnostic[], selector?: string, historyOffset = 0) {
  const paths = appSpecPaths(root);
  const result = {
    app: [] as AppSpecDocument[],
    capabilities: [] as AppSpecDocument[],
    activeChanges: [] as AppSpecDocument[],
    history: [] as AppSpecDocument[],
    decisions: [] as AppSpecDocument[],
    designs: [] as AppSpecDocument[],
    bytes: 0,
    historyPage: { offset: historyOffset, limit: 50, total: 0, nextOffset: null as number | null },
  };
  const candidates: Array<{ path: string; kind: AppSpecDocumentKind; history?: boolean }> = [];
  if (existsSync(paths.app)) candidates.push({ path: paths.app, kind: "app" });
  candidates.push(
    ...markdownFiles(paths.capabilities, false, diagnostics, root).map(path => ({
      path,
      kind: "capability" as const,
    })),
    ...markdownFiles(paths.activeChanges, false, diagnostics, root).map(path => ({
      path,
      kind: "change" as const,
    })),
    ...markdownFiles(paths.decisions, false, diagnostics, root).map(path => ({
      path,
      kind: "decision" as const,
    }))
  );
  for (const directory of ['product', 'experience', 'design', 'reviews']) {
    candidates.push(...markdownFiles(join(paths.root, directory), false, diagnostics, root).map(path => ({ path, kind: 'design' as const })));
  }
  if (candidates.length > APP_SPEC_LIMITS.maximumFiles) {
    diagnostics.push(
      issue(
        "error",
        "APPSPEC_FILE_LIMIT_EXCEEDED",
        `AppSpec 文件数 ${candidates.length} 超过上限 ${APP_SPEC_LIMITS.maximumFiles}`,
        "appspec"
      )
    );
    candidates.splice(APP_SPEC_LIMITS.maximumFiles);
  }
  const history = historyCandidates(root, selector, historyOffset, diagnostics);
  result.historyPage = history.page;
  candidates.push(...history.paths.map(path => ({ path, kind: "change" as const, history: true })));
  let historyBytes = 0;
  for (const candidate of candidates.sort((left, right) => Number(!!left.history) - Number(!!right.history) || left.path.localeCompare(right.path))) {
    let stat;
    try {
      stat = lstatSync(candidate.path);
    } catch {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_FILE_UNREADABLE",
          "AppSpec 文件无法读取",
          relativePath(root, candidate.path)
        )
      );
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_FILE_INVALID",
          "AppSpec 只允许普通 Markdown 文件，不能使用符号链接",
          relativePath(root, candidate.path)
        )
      );
      continue;
    }
    if (stat.size > APP_SPEC_LIMITS.maximumFileBytes) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_FILE_SIZE_EXCEEDED",
          `AppSpec 单文件超过 ${APP_SPEC_LIMITS.maximumFileBytes} 字节上限`,
          relativePath(root, candidate.path)
        )
      );
      continue;
    }
    const indexOnly = candidate.history && basename(candidate.path) !== `${selector}.md`;
    const readBytes = indexOnly ? Math.min(stat.size, 8192) : stat.size;
    if ((candidate.history ? historyBytes : result.bytes) + readBytes > APP_SPEC_LIMITS.maximumTotalBytes) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_TOTAL_SIZE_EXCEEDED",
          `AppSpec 总大小超过 ${APP_SPEC_LIMITS.maximumTotalBytes} 字节上限`,
          "appspec"
        )
      );
      break;
    }
    if (candidate.history) historyBytes += readBytes;
    else result.bytes += readBytes;
    let content: string;
    if (indexOnly) {
      const descriptor = openSync(candidate.path, 'r');
      try {
        const buffer = Buffer.alloc(readBytes);
        const bytes = readSync(descriptor, buffer, 0, readBytes, 0);
        content = buffer.subarray(0, bytes).toString('utf8').match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0] || '';
      } finally { closeSync(descriptor); }
    } else content = readFileSync(candidate.path, "utf8");
    const document = parseAppSpecDocument(
      root,
      candidate.path,
      candidate.kind,
      content,
      diagnostics
    );
    if (!document) continue;
    if (candidate.kind === "app") result.app.push(document);
    else if (candidate.kind === "capability") result.capabilities.push(document);
    else if (candidate.kind === "design") result.designs.push(document);
    else if (candidate.kind === "decision") result.decisions.push(document);
    else if (candidate.history) result.history.push(document);
    else result.activeChanges.push(document);
  }
  return result;
}

function validateDocuments(
  collection: ReturnType<typeof collectDocuments>,
  contract: AppSpecContractIndex,
  diagnostics: Diagnostic[]
) {
  if (collection.app.length !== 1) {
    diagnostics.push(
      issue(
        "error",
        "APPSPEC_APPLICATION_REQUIRED",
        "启用 AppSpec 后必须且只能存在一份 appspec/app.md",
        "appspec/app.md"
      )
    );
  }
  const app = collection.app[0];
  if (app && app.id !== contract.appCode) {
    diagnostics.push(
      issue(
        "error",
        "APPSPEC_APP_CODE_MISMATCH",
        `AppSpec app=${app.id} 与工作区 ${contract.appCode} 不一致`,
        app.path
      )
    );
  }
  for (const document of collection.activeChanges) {
    if (["archived", "cancelled"].includes(document.status)) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_ACTIVE_CHANGE_STATUS_INVALID",
          `活跃目录中的 ChangeSpec 不能使用 ${document.status} 状态`,
          document.path
        )
      );
    }
  }
  for (const document of collection.history) {
    if (!["archived", "cancelled"].includes(document.status)) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_HISTORY_CHANGE_STATUS_INVALID",
          `历史目录中的 ChangeSpec 必须是 archived 或 cancelled，当前为 ${document.status}`,
          document.path
        )
      );
    }
  }
  duplicateDiagnostics(
    [...collection.capabilities, ...collection.activeChanges, ...collection.history, ...collection.decisions, ...collection.designs],
    document => document.id,
    "APPSPEC_DOCUMENT_ID_DUPLICATED",
    diagnostics
  );
  duplicateDiagnostics(
    [...collection.app, ...collection.capabilities, ...collection.designs].flatMap(document =>
      document.requirementIds.map(id => ({ ...document, id }))
    ),
    document => document.id,
    "APPSPEC_REQUIREMENT_ID_DUPLICATED",
    diagnostics
  );
  duplicateDiagnostics(
    [...collection.app, ...collection.capabilities, ...collection.designs].flatMap(document =>
      document.acceptanceIds.map(id => ({ ...document, id }))
    ),
    document => document.id,
    "APPSPEC_ACCEPTANCE_ID_DUPLICATED",
    diagnostics
  );

  const capabilityIds = new Set(collection.capabilities.map(document => document.id));
  const requirementIds = new Set(
    [...collection.app, ...collection.capabilities, ...collection.designs].flatMap(document => document.requirementIds)
  );
  const acceptanceIds = new Set(
    [...collection.app, ...collection.capabilities, ...collection.designs].flatMap(document => document.acceptanceIds)
  );
  const resourceCodes = new Set(contract.resourceCodes);
  const actionCodes = new Set(contract.actionCodes);
  const decisionIds = new Set(collection.decisions.map(document => document.id));
  for (const document of collection.capabilities) {
    validateReferences(document, resourceCodes, actionCodes, "error", diagnostics);
    for (const requirement of requirementsWithoutAcceptance(document.content)) {
      diagnostics.push(
        issue(
          "warning",
          "APPSPEC_REQUIREMENT_ACCEPTANCE_RECOMMENDED",
          `需求 ${requirement} 建议至少包含一个 #### AC-* 可证伪场景`,
          document.path
        )
      );
    }
  }
  for (const document of collection.activeChanges) {
    const finalState = ["verified", "released"].includes(document.status);
    const referenceSeverity = finalState ? "error" : "warning";
    for (const id of document.references.capabilities) {
      if (!capabilityIds.has(id)) {
        diagnostics.push(
          issue(
            referenceSeverity,
            "APPSPEC_CHANGE_CAPABILITY_UNKNOWN",
            `ChangeSpec 引用的能力 ${id} 不存在`,
            document.path
          )
        );
      }
    }
    for (const id of document.references.requirements) {
      if (!requirementIds.has(id)) {
        diagnostics.push(
          issue(
            referenceSeverity,
            "APPSPEC_CHANGE_REQUIREMENT_UNKNOWN",
            `ChangeSpec 引用的需求 ${id} 尚未进入当前总纲或能力规格`,
            document.path
          )
        );
      }
    }
    for (const id of document.references.decisions) {
      if (!decisionIds.has(id)) {
        diagnostics.push(
          issue(
            referenceSeverity,
            "APPSPEC_CHANGE_DECISION_UNKNOWN",
            `ChangeSpec 引用的决策 ${id} 不存在`,
            document.path
          )
        );
      }
    }
    validateReferences(
      document,
      resourceCodes,
      actionCodes,
      referenceSeverity,
      diagnostics
    );
    validateEmbeddedCurrentSpecIds(
      document,
      requirementIds,
      acceptanceIds,
      diagnostics
    );
    validateRiskSections(document, diagnostics);
    if (
      finalState &&
      currentSpecStatus(document) === "pending"
    ) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_CURRENT_SPEC_NOT_CONVERGED",
          "verified/released ChangeSpec 必须确认 currentSpec=merged 或 not-applicable",
          document.path
        )
      );
    }
    if (finalState && unresolvedQuestions(document.content).length > 0) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_VERIFIED_CHANGE_HAS_OPEN_QUESTIONS",
          "verified/released ChangeSpec 仍有未勾选问题",
          document.path
        )
      );
    }
  }
  if (collection.activeChanges.length > 10) {
    diagnostics.push(
      issue(
        "warning",
        "APPSPEC_ACTIVE_CHANGE_COUNT_HIGH",
        `当前有 ${collection.activeChanges.length} 个活跃变更；建议关闭已完成记录，避免 AI 上下文膨胀`,
        "appspec/changes/active"
      )
    );
  }
}

function validateCloseConvergence(
  document: AppSpecDocument,
  collection: ReturnType<typeof collectDocuments>,
  contract: AppSpecContractIndex,
  diagnostics: Diagnostic[]
) {
  for (const title of ['验证与发布', '交接']) {
    if (!hasMeaningfulSection(document.content, [title], [])) diagnostics.push(issue('error', 'APPSPEC_HANDOFF_INCOMPLETE', `关闭前补齐“${title}”的实际结果；未发布或取消时明确原因`, `${document.path}#${title}`));
  }
  const currentSpec = currentSpecStatus(document);
  if (currentSpec === "pending") {
    diagnostics.push(
      issue(
        "error",
        "APPSPEC_CURRENT_SPEC_NOT_CONVERGED",
        "关闭前必须确认 currentSpec=merged 或 not-applicable；该检查只约束 spec close",
        document.path
      )
    );
  }
  const capabilityIds = new Set(
    collection.capabilities.map(item => item.id)
  );
  const requirementIds = new Set(
    [...collection.app, ...collection.capabilities, ...collection.designs].flatMap(item => item.requirementIds)
  );
  const acceptanceIds = new Set(
    [...collection.app, ...collection.capabilities, ...collection.designs].flatMap(item => item.acceptanceIds)
  );
  const decisionIds = new Set(collection.decisions.map(item => item.id));
  for (const id of document.references.capabilities) {
    const matches = collection.capabilities.filter(item => item.id === id);
    if (!capabilityIds.has(id)) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_CHANGE_CAPABILITY_UNKNOWN",
          `关闭前必须建立当前能力引用 ${id}`,
          document.path
        )
      );
    } else if (matches.length > 1) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_DOCUMENT_ID_DUPLICATED",
          `关闭前必须消除能力 ${id} 的重复定义`,
          document.path
        )
      );
    }
  }
  for (const id of document.references.requirements) {
    const matches = [...collection.app, ...collection.capabilities, ...collection.designs].filter(item =>
      item.requirementIds.includes(id)
    );
    if (!requirementIds.has(id)) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_CHANGE_REQUIREMENT_UNKNOWN",
          `关闭前必须把需求 ${id} 合入当前总纲或能力规格`,
          document.path
        )
      );
    } else if (matches.length > 1) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_REQUIREMENT_ID_DUPLICATED",
          `关闭前必须消除需求 ${id} 的重复定义`,
          document.path
        )
      );
    }
  }
  for (const id of document.references.decisions) {
    const matches = collection.decisions.filter(item => item.id === id);
    if (!decisionIds.has(id)) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_CHANGE_DECISION_UNKNOWN",
          `关闭前必须建立架构决策 ${id}`,
          document.path
        )
      );
    } else if (matches.length > 1) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_DOCUMENT_ID_DUPLICATED",
          `关闭前必须消除决策 ${id} 的重复定义`,
          document.path
        )
      );
    }
  }
  for (const id of document.requirementIds) {
    const matches = [...collection.app, ...collection.capabilities, ...collection.designs].filter(item =>
      item.requirementIds.includes(id)
    );
    if (matches.length > 1) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_REQUIREMENT_ID_DUPLICATED",
          `关闭前必须消除需求 ${id} 的重复定义`,
          document.path
        )
      );
    }
  }
  for (const id of document.acceptanceIds) {
    const matches = [...collection.app, ...collection.capabilities, ...collection.designs].filter(item =>
      item.acceptanceIds.includes(id)
    );
    if (matches.length > 1) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_ACCEPTANCE_ID_DUPLICATED",
          `关闭前必须消除验收场景 ${id} 的重复定义`,
          document.path
        )
      );
    }
  }
  validateEmbeddedCurrentSpecIds(
    document,
    requirementIds,
    acceptanceIds,
    diagnostics
  );
  validateReferences(
    document,
    new Set(contract.resourceCodes),
    new Set(contract.actionCodes),
    "error",
    diagnostics
  );
  validateRiskSections(document, diagnostics);
}

function validateEmbeddedCurrentSpecIds(
  document: AppSpecDocument,
  currentRequirementIds: Set<string>,
  currentAcceptanceIds: Set<string>,
  diagnostics: Diagnostic[]
) {
  for (const id of document.requirementIds) {
    if (!currentRequirementIds.has(id)) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_CHANGE_REQUIREMENT_NOT_CURRENT",
          `ChangeSpec 中的长期需求 ${id} 尚未进入当前总纲或能力规格`,
          document.path
        )
      );
    }
  }
  for (const id of document.acceptanceIds) {
    if (!currentAcceptanceIds.has(id)) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_CHANGE_ACCEPTANCE_NOT_CURRENT",
          `ChangeSpec 中的验收场景 ${id} 尚未进入当前总纲或能力规格`,
          document.path
        )
      );
    }
  }
}

function validateReferences(
  document: AppSpecDocument,
  resourceCodes: Set<string>,
  actionCodes: Set<string>,
  severity: "warning" | "error",
  diagnostics: Diagnostic[]
) {
  for (const code of document.references.resources) {
    if (!resourceCodes.has(code)) {
      diagnostics.push(
        issue(
          severity,
          "APPSPEC_RESOURCE_UNKNOWN",
          `AppSpec 引用的资源 ${code} 不在当前编译声明中`,
          document.path
        )
      );
    }
  }
  for (const code of document.references.actions) {
    if (!actionCodes.has(code)) {
      diagnostics.push(
        issue(
          severity,
          "APPSPEC_ACTION_UNKNOWN",
          `AppSpec 引用的动作 ${code} 不在当前编译声明中`,
          document.path
        )
      );
    }
  }
}

function validateRiskSections(document: AppSpecDocument, diagnostics: Diagnostic[]) {
  const risk = String(document.metadata.risk || "L1");
  if (!["L1", "L2", "L3"].includes(risk)) {
    diagnostics.push(
      issue("error", "APPSPEC_RISK_INVALID", `未知风险档位 ${risk}`, document.path)
    );
    return;
  }
  if (risk === "L1") return;
  const required: Array<{ titles: string[]; placeholders: string[] }> = [
    {
      titles: ["验收", "Acceptance"],
      placeholders: [
        "一个可观察的正向结果",
        "需要时补充拒绝、异常或权限反例",
      ],
    },
    {
      titles: ["数据与权限", "Data and Permissions"],
      placeholders: ["无，或说明资源、字段、角色和数据范围变化。"],
    },
    {
      titles: ["回滚", "Rollback"],
      placeholders: ["回退声明/代码并保持旧数据可读；如不适用请说明。"],
    },
  ];
  if (risk === "L3") {
    required.push(
      {
        titles: ["失败、并发与幂等", "Failure, Concurrency, and Idempotency"],
        placeholders: ["L3 才需要详细维护；其他变化写“无”。"],
      },
      {
        titles: ["架构决策", "Decision Records"],
        placeholders: ["L3 如涉及 ADR，在 front matter 的 decisions 中引用。"],
      }
    );
  }
  for (const section of required) {
    if (!hasMeaningfulSection(document.content, section.titles, section.placeholders)) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_RISK_SECTION_INCOMPLETE",
          `${risk} ChangeSpec 的“${section.titles[0]}”为空或仍是默认占位内容`,
          document.path
        )
      );
    }
  }
}

function selectBaseContext(
  collection: ReturnType<typeof collectDocuments>,
  selector: string | undefined,
  diagnostics: Diagnostic[]
) {
  if (!selector) {
    return {
      primary: collection.app[0] || null,
      capabilities: [],
      activeChanges: [],
      archivedChanges: [],
      decisions: [],
    };
  }
  const design = collection.designs.find(document => document.id === selector);
  if (design) return { primary: design, capabilities: [], activeChanges: [], archivedChanges: [], decisions: [] };
  const change = collection.activeChanges.find(document => document.id === selector);
  if (change) {
    const capabilityIds = new Set(change.references.capabilities);
    const decisionIds = new Set(change.references.decisions);
    return {
      primary: change,
      capabilities: collection.capabilities.filter(document => capabilityIds.has(document.id)),
      activeChanges: [change],
      archivedChanges: [],
      decisions: collection.decisions.filter(document => decisionIds.has(document.id)),
    };
  }
  const archivedChange = collection.history.find(document => document.id === selector);
  if (archivedChange) {
    const capabilityIds = new Set(archivedChange.references.capabilities);
    const decisionIds = new Set(archivedChange.references.decisions);
    return {
      primary: archivedChange,
      capabilities: collection.capabilities.filter(document => capabilityIds.has(document.id)),
      activeChanges: [],
      archivedChanges: [archivedChange],
      decisions: collection.decisions.filter(document => decisionIds.has(document.id)),
    };
  }
  const capability = collection.capabilities.find(document => document.id === selector);
  if (capability) {
    const activeChanges = collection.activeChanges.filter(document =>
      document.references.capabilities.includes(capability.id)
    );
    const decisionIds = new Set(
      activeChanges.flatMap(document => document.references.decisions)
    );
    return {
      primary: capability,
      capabilities: [capability],
      activeChanges,
      archivedChanges: [],
      decisions: collection.decisions.filter(document => decisionIds.has(document.id)),
    };
  }
  const decision = collection.decisions.find(document => document.id === selector);
  if (decision) {
    return {
      primary: decision,
      capabilities: [],
      activeChanges: [],
      archivedChanges: [],
      decisions: [decision],
    };
  }
  diagnostics.push(
    issue(
      "warning",
      "APPSPEC_SELECTOR_NOT_FOUND",
      `未找到 AppSpec selector ${selector}，已返回应用总纲和空的相关上下文`,
      "appspec"
    )
  );
  return {
    primary: null,
    capabilities: [],
    activeChanges: [],
    archivedChanges: [],
    decisions: [],
  };
}

function selectContext(collection: ReturnType<typeof collectDocuments>, selector: string | undefined, diagnostics: Diagnostic[]) {
  const base = selectBaseContext(collection, selector, diagnostics);
  const designs: AppSpecDocument[] = [];
  const selected = { ...base, capabilities: [...base.capabilities] as AppSpecDocument[], decisions: [...base.decisions] as AppSpecDocument[], designs };
  if (!selector) return selected;
  const available = [...collection.app, ...collection.capabilities, ...collection.decisions, ...collection.designs];
  const queue = [base.primary, ...base.capabilities, ...base.decisions].filter((item): item is AppSpecDocument => !!item);
  const seen = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const document = queue[index]!;
    if (seen.has(document.id)) continue;
    seen.add(document.id);
    if (document.kind === 'design') designs.push(document);
    if (document.kind === 'capability' && !selected.capabilities.includes(document)) selected.capabilities.push(document);
    if (document.kind === 'decision' && !selected.decisions.includes(document)) selected.decisions.push(document);
    for (const id of document.references.documents) {
      const target = available.find(item => item.id === id);
      if (!target) diagnostics.push(issue('error', 'APPSPEC_DESIGN_REFERENCE_UNKNOWN', `设计引用 ${id} 不存在；先恢复资料或修正引用`, document.path));
      else if (!seen.has(id)) queue.push(target);
    }
  }
  return selected;
}

function summarizeCollection(collection: ReturnType<typeof collectDocuments>) {
  return {
    application: collection.app[0] ? summarize(collection.app[0]) : null,
    capabilities: collection.capabilities.map(summarize),
    activeChanges: collection.activeChanges.map(summarize),
    decisions: collection.decisions.map(summarize),
    designs: collection.designs.map(summarize),
    history: collection.history.map(summarize),
  };
}

function selectedDocuments(
  application: AppSpecDocument | null,
  selected: ReturnType<typeof selectContext>
) {
  return uniqueDocuments([
    selected.primary,
    application,
    ...selected.capabilities,
    ...selected.activeChanges,
    ...selected.archivedChanges,
    ...selected.decisions,
    ...selected.designs,
  ]);
}

function applyContextBudget(
  application: AppSpecDocument | null,
  selected: ReturnType<typeof selectContext>
) {
  const prioritized = selectedDocuments(application, selected);
  const included = new Set<string>();
  const omitted: AppSpecDocument[] = [];
  let contentBytes = 0;
  for (const document of prioritized) {
    const bytes = Buffer.byteLength(document.content, "utf8");
    if (contentBytes + bytes > APP_SPEC_LIMITS.maximumContextBytes) {
      omitted.push(document);
      continue;
    }
    included.add(document.path);
    contentBytes += bytes;
  }
  const keep = (documents: AppSpecDocument[]) =>
    documents.filter(document => included.has(document.path));
  return {
    application:
      application && included.has(application.path) ? application : null,
    capabilities: keep(selected.capabilities),
    activeChanges: keep(selected.activeChanges),
    archivedChanges: keep(selected.archivedChanges),
    decisions: keep(selected.decisions),
    designs: keep(selected.designs),
    contextBudget: {
      maximumBytes: APP_SPEC_LIMITS.maximumContextBytes,
      contentBytes,
      truncated: omitted.length > 0,
      omitted: omitted.map(summarize),
    },
  };
}

function uniqueDocuments(
  documents: Array<AppSpecDocument | null | undefined>
) {
  const paths = new Set<string>();
  return documents.filter((document): document is AppSpecDocument => {
    if (!document || paths.has(document.path)) return false;
    paths.add(document.path);
    return true;
  });
}

function digestDocuments(
  documents: AppSpecDocument[],
  contract: AppSpecContractIndex,
  extra: string[] = []
) {
  if (documents.length === 0 && extra.length === 0) return null;
  const contractIdentity = {
    appCode: contract.appCode,
    resourceCodes: unique(contract.resourceCodes),
    actionCodes: unique(contract.actionCodes),
    configDigest: contract.configDigest || null,
    contractDigest: contract.contractDigest || null,
    aiCatalogDigest: contract.aiCatalogDigest || null,
  };
  return createHash("sha256")
    .update(
      [
        ...[...documents]
          .sort((left, right) => left.path.localeCompare(right.path))
          .map(document => `${document.path}\n${document.content}`),
        ...extra,
        `contract:${JSON.stringify(contractIdentity)}`,
      ].join("\n---\n")
    )
    .digest("hex");
}

function parseAppSpecDocument(
  root: string,
  path: string,
  kind: AppSpecDocumentKind,
  content: string,
  diagnostics: Diagnostic[]
): AppSpecDocument | null {
  const pointer = relativePath(root, path);
  const frontMatter = parseFrontMatter(content, pointer, diagnostics);
  if (!frontMatter) return null;
  validateMetadata(kind, frontMatter.metadata, pointer, diagnostics);
  const expectedSchema = APP_SPEC_SCHEMAS[kind];
  if (frontMatter.metadata.schema !== expectedSchema) {
    diagnostics.push(
      issue(
        "error",
        "APPSPEC_SCHEMA_INVALID",
        `期望 schema=${expectedSchema}`,
        pointer
      )
    );
  }
  const id = String(
    kind === "app" ? frontMatter.metadata.app || "" : frontMatter.metadata.id || ""
  );
  const pattern =
    kind === "app"
      ? APP_ID
      : kind === "capability"
        ? CAPABILITY_ID
        : kind === "decision"
          ? DECISION_ID
          : kind === "design" ? /^DES-[A-Z0-9]+(?:-[A-Z0-9]+)*$/ : CHANGE_ID;
  if (!pattern.test(id)) {
    diagnostics.push(
      issue("error", "APPSPEC_DOCUMENT_ID_INVALID", `无效 ${kind} id: ${id}${kind === 'decision' ? '；请使用 ADR- 加四位数字，可选大写字母/数字后缀，例如 ADR-0001 或 ADR-0001-DATA-OWNER，参见 docs appspec' : ''}`, pointer)
    );
  }
  const status = String(frontMatter.metadata.status || "draft");
  const validStatuses: Record<AppSpecDocumentKind, string[]> = {
    app: ["active", "retired"],
    capability: ["draft", "active", "retired"],
    change: ["draft", "confirmed", "implementing", "verified", "released", "archived", "cancelled"],
    design: ["draft", "confirmed", "superseded", "rejected"],
    decision: ["proposed", "accepted", "superseded", "rejected"],
  };
  if (!validStatuses[kind].includes(status)) {
    diagnostics.push(
      issue(
        "error",
        "APPSPEC_STATUS_INVALID",
        `${kind} status=${status} 不受支持`,
        pointer
      )
    );
  }
  if (kind === 'design' && !['sources', 'product', 'journey', 'page', 'visual', 'permissions', 'architecture', 'review'].includes(String(frontMatter.metadata.type))) {
    diagnostics.push(issue('error', 'APPSPEC_DESIGN_TYPE_INVALID', '设计资料需要明确 type，参见 docs product-design', pointer));
  }
  if (kind === "change") {
    const currentSpec = String(frontMatter.metadata.currentSpec || "pending");
    if (!(["pending", "merged", "not-applicable"] as string[]).includes(currentSpec)) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_CURRENT_SPEC_STATUS_INVALID",
          `change currentSpec=${currentSpec} 不受支持`,
          pointer
        )
      );
    }
  }
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
  const title = String(frontMatter.metadata.title || h1 || id);
  const requirementIds = extractIds(content, /^###\s+(REQ-[A-Z0-9-]+)\b/gm, REQUIREMENT_ID);
  const acceptanceIds = extractIds(content, /^####\s+(AC-[A-Z0-9-]+)\b/gm, ACCEPTANCE_ID);
  return {
    kind,
    id,
    title,
    status,
    path: pointer,
    metadata: frontMatter.metadata,
    requirementIds,
    acceptanceIds,
    references: {
      capabilities: metadataStrings(frontMatter.metadata, "capabilities"),
      requirements: metadataStrings(frontMatter.metadata, "requirements"),
      resources: metadataStrings(frontMatter.metadata, "resources"),
      actions: metadataStrings(frontMatter.metadata, "actions"),
      decisions: metadataStrings(frontMatter.metadata, "decisions"),
      documents: metadataStrings(frontMatter.metadata, "documents"),
    },
    content,
  };
}

function parseFrontMatter(
  content: string,
  pointer: string,
  diagnostics: Diagnostic[]
) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    diagnostics.push(
      issue(
        "error",
        "APPSPEC_FRONT_MATTER_REQUIRED",
        "AppSpec Markdown 必须以受限 YAML front matter 开头",
        pointer
      )
    );
    return null;
  }
  const metadata: Record<string, MetadataValue> = {};
  const lines = (match[1] || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] || "";
    if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
    const entry = raw.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (!entry) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_FRONT_MATTER_INVALID",
          `不支持的 front matter 行: ${raw.trim()}`,
          pointer
        )
      );
      continue;
    }
    const key = entry[1] || "";
    const rawValue = entry[2] || "";
    if (rawValue.trim()) {
      metadata[key] = parseMetadataValue(rawValue.trim());
      continue;
    }
    const values: string[] = [];
    while (index + 1 < lines.length) {
      const next = lines[index + 1] || "";
      const item = next.match(/^\s{2,}-\s+(.+)$/);
      if (!item) break;
      values.push(String(parseMetadataValue(item[1] || "")));
      index += 1;
    }
    metadata[key] = values;
  }
  return { metadata };
}

function parseMetadataValue(value: string): MetadataValue {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "[]") return [];
  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map(item => String(item));
    } catch {
      return value
        .slice(1, -1)
        .split(",")
        .map(item => unquote(item.trim()))
        .filter(Boolean);
    }
  }
  return unquote(value);
}

function unquote(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    if (value.startsWith('"')) {
      try {
        return String(JSON.parse(value));
      } catch {
        return value.slice(1, -1);
      }
    }
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function metadataStrings(metadata: Record<string, MetadataValue>, key: string) {
  const value = metadata[key];
  if (Array.isArray(value)) return normalized(value);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function requirementsWithoutAcceptance(content: string) {
  const source = withoutHtmlComments(content);
  const matches = [...source.matchAll(/^###\s+(REQ-[A-Z0-9-]+)\b/gm)];
  const missing: string[] = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index]?.index || 0;
    const end = matches[index + 1]?.index ?? source.length;
    const block = source.slice(start, end);
    if (!/^####\s+AC-[A-Z0-9-]+\b/m.test(block)) {
      const id = matches[index]?.[1];
      if (id) missing.push(id);
    }
  }
  return missing;
}

function unresolvedQuestions(content: string) {
  const source = withoutHtmlComments(content);
  const heading = source.match(
    /^##\s+(?:未确认问题|Unresolved Questions)\s*$/m
  );
  if (heading?.index === undefined) return [];
  const tail = source.slice(heading.index + heading[0].length);
  const nextHeading = tail.search(/^##\s+/m);
  const section = nextHeading >= 0 ? tail.slice(0, nextHeading) : tail;
  return section ? [...section.matchAll(/^- \[ \]\s+(.+)$/gm)].map(match => match[1]) : [];
}

function hasMeaningfulSection(
  content: string,
  alternatives: string[],
  placeholders: string[]
) {
  const source = withoutHtmlComments(content);
  for (const title of alternatives) {
    const heading = new RegExp(`^##\\s+${escapeRegExp(title)}\\s*$`, "m").exec(source);
    if (heading?.index === undefined) continue;
    const tail = source.slice(heading.index + heading[0].length);
    const nextHeading = tail.search(/^##\s+/m);
    const body = nextHeading >= 0 ? tail.slice(0, nextHeading) : tail;
    const meaningfulLines = body
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !/^[-*](?:\s+\[[ xX]\])?\s*$/.test(line))
      .filter(line => !placeholders.some(placeholder => line.includes(placeholder)));
    if (meaningfulLines.length > 0) return true;
  }
  return false;
}

function currentSpecStatus(document: AppSpecDocument): AppSpecCurrentSpecStatus {
  const value = String(document.metadata.currentSpec || "pending");
  return (["merged", "not-applicable"] as string[]).includes(value)
    ? (value as AppSpecCurrentSpecStatus)
    : "pending";
}

function duplicateDiagnostics<T extends { path: string }>(
  values: T[],
  id: (value: T) => string,
  code: string,
  diagnostics: Diagnostic[]
) {
  const seen = new Map<string, string>();
  for (const value of values) {
    const key = id(value);
    if (!key) continue;
    const previous = seen.get(key);
    if (previous) {
      diagnostics.push(
        issue("error", code, `稳定 ID ${key} 重复，首次出现在 ${previous}`, value.path)
      );
    } else {
      seen.set(key, value.path);
    }
  }
}

function markdownFiles(
  directory: string,
  recursive: boolean,
  diagnostics: Diagnostic[],
  root: string,
  depth = 0
) {
  if (!existsSync(directory)) return [];
  if (!isRegularDirectory(directory)) {
    diagnostics.push(
      issue(
        "error",
        "APPSPEC_DIRECTORY_INVALID",
        "AppSpec 子目录必须是普通目录，不能是符号链接",
        relativePath(root, directory)
      )
    );
    return [];
  }
  const files: string[] = [];
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  if (entries.length > APP_SPEC_LIMITS.maximumDirectoryEntries) {
    diagnostics.push(
      issue(
        "error",
        "APPSPEC_DIRECTORY_ENTRY_LIMIT_EXCEEDED",
        `AppSpec 单目录条目数超过 ${APP_SPEC_LIMITS.maximumDirectoryEntries} 上限`,
        relativePath(root, directory)
      )
    );
    entries.splice(APP_SPEC_LIMITS.maximumDirectoryEntries);
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_SYMLINK_FORBIDDEN",
          "AppSpec 不读取符号链接",
          relativePath(root, path)
        )
      );
      continue;
    }
    if (entry.isDirectory() && recursive) {
      if (depth >= APP_SPEC_LIMITS.maximumHistoryDepth) {
        diagnostics.push(
          issue(
            "error",
            "APPSPEC_HISTORY_DEPTH_EXCEEDED",
            "AppSpec 历史目录只允许 history/<year>/*.md",
            relativePath(root, path)
          )
        );
      } else {
        files.push(...markdownFiles(path, true, diagnostics, root, depth + 1));
      }
    }
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
    else if (!entry.name.startsWith(".")) {
      diagnostics.push(
        issue(
          "warning",
          "APPSPEC_UNKNOWN_ENTRY_IGNORED",
          "AppSpec 只读取约定目录中的 Markdown 文件",
          relativePath(root, path)
        )
      );
    }
  }
  return files;
}

function appSpecPaths(root: string) {
  const workspace = resolve(root);
  const appSpecRoot = resolve(workspace, "appspec");
  assertInside(workspace, appSpecRoot);
  return {
    root: appSpecRoot,
    app: join(appSpecRoot, "app.md"),
    capabilities: join(appSpecRoot, "capabilities"),
    activeChanges: join(appSpecRoot, "changes", "active"),
    history: join(appSpecRoot, "changes", "history"),
    decisions: join(appSpecRoot, "decisions"),
  };
}

function renderApplicationSpec(appCode: string, appName: string) {
  return `---
schema: ${APP_SPEC_SCHEMAS.app}
app: ${JSON.stringify(appCode)}
title: ${JSON.stringify(appName)}
status: active
---
# ${appName}

本文件是当前有效设计的总纲与目录。新应用先完成产品发现、详细设计与实际确认，形成评审基线后再制定实施计划；按 docs product-design 在 AppSpec 中建立相关材料。正式变更关联 ChangeSpec；测试发布前核对设计与验收计划，生产晋级前核对实际验收。资源、字段、权限和动作的实现以
\`openxiangda.config.ts\` 与实时编译合同为准。

## 业务目标

<!-- 用业务语言说明应用解决的问题和可观察结果。 -->

## 角色

<!-- 只记录业务角色及其目标；稳定 role code 在能力规格中引用。 -->

## 范围

### 包含

### 不包含

## 设计资料目录

<!-- 引用产品、旅程、页面、视觉、权限、架构与评审的稳定 ID；详细规则各有唯一归属。 -->

## 能力目录

<!-- 复杂业务再在 capabilities/ 下增加 CAP-*；简单应用的稳定规则直接写在本文件。 -->

## 术语

## 跨能力约束

## 架构与数据关系

<!-- 写明领域边界、核心模型关系、平台能力与自定义动作的归属、状态转换与不变量。 -->

## 业务任务与页面

<!-- 按用户任务规划管理端、PC、移动入口与数据关系；辅助表不必有页面。 -->

## 权限矩阵与确认

<!-- 记录角色、页面、操作、行范围、字段和多角色组合；写明需求依据与未明确的边界。 -->

## 性能与容量预算

<!-- 记录数据量及增长、并发、分页与索引、请求次数、延迟目标和测量口径；区分估算、目标与实测。 -->

## 未确认问题

- 无。
`;
}

function renderCapabilitySpec(input: {
  id: string;
  title: string;
  resources: string[];
  actions: string[];
}) {
  return `---
schema: ${APP_SPEC_SCHEMAS.capability}
id: ${input.id}
title: ${JSON.stringify(input.title)}
status: draft
resources: ${JSON.stringify(input.resources)}
actions: ${JSON.stringify(input.actions)}
---
# ${input.title}

## 目标与边界

<!-- 描述用户可观察的业务能力，不复制字段物理 Schema 或页面实现。 -->

## 角色与权限

## 当前有效需求

<!--
### REQ-DOMAIN-001 规则名称

当发生某个业务条件时，系统必须产生可观察结果。

#### AC-DOMAIN-001-01 正向或反向场景

- 前置：已知条件
- 操作：用户或系统执行动作
- 预期：观察到明确结果
-->

## 状态与异常

## 非目标
`;
}

function renderChangeSpec(input: {
  id: string;
  title: string;
  risk: AppSpecRisk;
  summary: string;
  capabilities: string[];
  requirements: string[];
  resources: string[];
  actions: string[];
}) {
  const createdAt = new Date().toISOString();
  return `---
schema: ${APP_SPEC_SCHEMAS.change}
id: ${input.id}
title: ${JSON.stringify(input.title)}
status: draft
currentSpec: pending
risk: ${input.risk}
createdAt: ${JSON.stringify(createdAt)}
capabilities: ${JSON.stringify(input.capabilities)}
requirements: ${JSON.stringify(input.requirements)}
resources: ${JSON.stringify(input.resources)}
actions: ${JSON.stringify(input.actions)}
decisions: []
---
# ${input.title}

## 为什么

${input.summary || "<!-- 一两句话说明问题、证据和期望结果。 -->"}

## 需求依据

<!-- 记录用户原始需求或当前规格引用、已明确规则与假设；不代替用户编造确认。 -->

## 方案与影响

<!-- 说明能力所有者、模型/页面/权限/状态影响，引用已有架构决定。 -->

## 任务与实现

<!-- 用稳定需求 ID 关联实施任务、源码/声明路径与验收场景；实施后更新实际结果。 -->

## 性能与容量预算

<!-- 引用总纲默认预算，或记录本次数据规模、查询/分页/批量/超时/并发和延迟目标。 -->

## 变更

- ADDED：
- MODIFIED：
- REMOVED：
- 非目标：

## 验收

- [ ] 一个可观察的正向结果
- [ ] 需要时补充拒绝、异常或权限反例

<!-- 使用 #### AC-领域-编号 给场景稳定 ID；写明角色、前置、操作、预期和拒绝路径。测试部署后再记录实际观察。 -->

## 数据与权限

- 无，或说明资源、字段、角色和数据范围变化。

## 失败、并发与幂等

- L3 才需要详细维护；其他变化写“无”。

## 回滚

- 回退声明/代码并保持旧数据可读；如不适用请说明。

## 架构决策

- L3 如涉及 ADR，在 front matter 的 decisions 中引用。

## 验证与发布

<!-- 记录检查结果、源码提交、测试/生产运行 ID、包摘要、验收报告路径、未覆盖项和恢复入口。区分本地通过、部署成功与业务验收。 -->

## 交接

<!-- 写明持续有效规则已更新的位置、剩余问题与下一步；无需复制当前规格全文。 -->

## 未确认问题

- 无。
`;
}

function appendClosure(content: string, summary: string, closedAt: string) {
  return `${content.trimEnd()}\n\n## 关闭记录\n\n- 时间：${closedAt}\n- 摘要：${summary}\n- 说明：归档不等于部署或生产验收；以实际 Verification/Deployment 证据为准。\n`;
}

function setFrontMatterValue(content: string, key: string, value: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw stableError("APPSPEC_FRONT_MATTER_REQUIRED", key);
  const encoded = JSON.stringify(value);
  const body = match[1] || "";
  const pattern = new RegExp(`^${escapeRegExp(key)}:.*$`, "m");
  const nextBody = pattern.test(body)
    ? body.replace(pattern, `${key}: ${encoded}`)
    : `${body.trimEnd()}\n${key}: ${encoded}`;
  return content.replace(match[0], `---\n${nextBody}\n---`);
}

function exclusiveWrite(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as { code?: string }).code === "EEXIST") {
      throw stableError("APPSPEC_DOCUMENT_EXISTS", path);
    }
    throw error;
  }
}

function atomicReplace(path: string, content: string) {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now()}.tmp`
  );
  exclusiveWrite(temporary, content);
  renameSync(temporary, path);
}

function assertRegularFile(path: string) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw stableError("APPSPEC_FILE_INVALID", path);
  }
}

function isRegularDirectory(path: string) {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function assertInside(root: string, path: string) {
  const base = `${resolve(root)}/`;
  const target = `${resolve(path)}/`;
  if (!target.startsWith(base)) throw stableError("APPSPEC_PATH_OUTSIDE_WORKSPACE", path);
}

function stableError(code: string, detail: string) {
  return Object.assign(new Error(`${code}: ${detail}`), { code, retryable: false });
}

function issue(
  severity: "info" | "warning" | "error",
  code: string,
  message: string,
  path: string
): Diagnostic {
  return {
    schemaVersion: SCHEMA_VERSIONS.diagnostic,
    code,
    severity,
    message,
    path,
    retryable: false,
    remediation:
      severity === "error"
        ? "修正记录后运行 openxiangda spec check；普通 check 可继续，正式发布按阶段核对"
        : "按实际变化范围补充；确定性缺口会在相应发布阶段核对",
  };
}

function summarize(document: AppSpecDocument): AppSpecDocumentSummary {
  return {
    kind: document.kind,
    id: document.id,
    title: document.title,
    status: document.status,
    path: document.path,
    risk:
      document.kind === "change" && ["L1", "L2", "L3"].includes(String(document.metadata.risk))
        ? (String(document.metadata.risk) as AppSpecRisk)
        : null,
    requirementCount: document.requirementIds.length,
    acceptanceScenarioCount: document.acceptanceIds.length,
  };
}

function extractIds(content: string, pattern: RegExp, validation: RegExp) {
  return unique(
    [...withoutHtmlComments(content).matchAll(pattern)]
      .map(match => match[1] || "")
      .filter(value => validation.test(value))
  );
}

function withoutHtmlComments(content: string) {
  return content.replace(/<!--[\s\S]*?-->/g, "");
}

function validateMetadata(
  kind: AppSpecDocumentKind,
  metadata: Record<string, MetadataValue>,
  pointer: string,
  diagnostics: Diagnostic[]
) {
  const allowed: Record<AppSpecDocumentKind, ReadonlySet<string>> = {
    app: new Set(["schema", "app", "title", "status", "documents"]),
    design: new Set(["schema", "id", "title", "status", "type", "documents", "scope", "baselineDigest", "confirmedBy", "confirmedAt", "confirmationSource", "capabilities", "requirements", "resources", "actions", "decisions"]),
    capability: new Set([
      "schema",
      "documents",
      "id",
      "title",
      "status",
      "resources",
      "actions",
    ]),
    change: new Set([
      "schema",
      "documents",
      "id",
      "title",
      "status",
      "currentSpec",
      "risk",
      "createdAt",
      "closedAt",
      "capabilities",
      "requirements",
      "resources",
      "actions",
      "decisions",
    ]),
    decision: new Set([
      "schema",
      "documents",
      "id",
      "title",
      "status",
      "date",
      "deciders",
      "supersedes",
    ]),
  };
  const identifierKey = kind === "app" ? "app" : "id";
  for (const required of ["schema", identifierKey, "status"]) {
    if (!(required in metadata)) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_METADATA_REQUIRED",
          `${kind} front matter 缺少 ${required}`,
          pointer
        )
      );
    }
  }
  for (const key of Object.keys(metadata)) {
    if (!allowed[kind].has(key)) {
      diagnostics.push(
        issue(
          "error",
          "APPSPEC_METADATA_UNKNOWN",
          `${kind} front matter 不支持 ${key}`,
          pointer
        )
      );
    }
  }
}

function normalized(values: string[] | undefined) {
  return unique((values || []).map(value => String(value).trim()).filter(Boolean));
}

function unique(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function fileNameForId(id: string, prefix: string) {
  return id.slice(prefix.length).toLowerCase();
}

function relativePath(root: string, path: string) {
  return relative(resolve(root), resolve(path)).replaceAll("\\", "/");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
