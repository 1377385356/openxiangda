import type { WorkflowExpression, WorkflowNode } from '../types.js';
import type { WorkflowTaskPage } from './workflow-task-page.js';
import { workflowReturnTargets } from './workflow-return-policy.js';

export const WORKFLOW_PARALLEL_MIN_BRANCHES = 2;
export const WORKFLOW_PARALLEL_MAX_BRANCHES = 8;

export interface WorkflowParallelNode {
  id: string;
  kind: 'parallel';
  title: string;
  join: string;
  branches: Array<{ id: string; title: string; target: string; when?: WorkflowExpression }>;
}
export interface WorkflowJoinNode {
  id: string;
  kind: 'join';
  title: string;
  parallel: string;
  next: string;
}
export interface WorkflowParallelRegion {
  parallelNodeId: string;
  joinNodeId: string;
  branches: Array<{ id: string; target: string; nodeIds: string[]; writableFields: string[] }>;
}
type Definition = {
  startAt: string;
  nodes: Record<string, WorkflowNode>;
  subject?: { factProjection: Record<string, string> };
  taskPages?: Record<string, WorkflowTaskPage>;
};
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const code = (value: unknown) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value);
const overlap = (a: string, b: string) => a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

/** Forward edges only. Return edges are checked separately and never make a fork body larger. */
export function workflowForwardTargets(node: WorkflowNode): string[] {
  if (node.kind === 'approval') return [node.onApprove, node.onReject];
  if (node.kind === 'condition') return [...(Array.isArray(node.branches) ? node.branches : []).map(branch => branch?.target), node.otherwise];
  if (node.kind === 'parallel') return [...(Array.isArray(node.branches) ? node.branches : []).map(branch => branch?.target), node.join];
  return 'next' in node ? [node.next] : [];
}

/** Pure topology and cross-branch authority validation; no expressions are evaluated. */
export function inspectWorkflowParallel(definition: Definition): { regions: WorkflowParallelRegion[]; errors: string[] } {
  const errors: string[] = [];
  const regions: WorkflowParallelRegion[] = [];
  if (!record(definition?.nodes)) return { regions, errors: ['WORKFLOW_PARALLEL_DOCUMENT_INVALID'] };
  const nodes = definition.nodes;
  if (!Object.values(nodes).some(node => node?.kind === 'parallel' || node?.kind === 'join')) return { regions, errors };
  if (Object.keys(nodes).length > 200) return { regions, errors: ['WORKFLOW_PARALLEL_NODE_LIMIT'] };
  const ownership = new Map<string, { parallel: string; branch: string }>();
  const joins = new Set<string>();
  for (const fork of Object.values(nodes)) {
    if (fork?.kind !== 'parallel') continue;
    const join = nodes[fork.join];
    if (join?.kind !== 'join' || join.parallel !== fork.id || joins.has(fork.join)) {
      errors.push(`WORKFLOW_PARALLEL_PAIR_INVALID:${fork.id}`);
      continue;
    }
    joins.add(join.id);
    if (!nodes[join.next]) errors.push(`WORKFLOW_PARALLEL_TARGET_MISSING:${join.id}`);
    if (!Array.isArray(fork.branches) || fork.branches.length < WORKFLOW_PARALLEL_MIN_BRANCHES || fork.branches.length > WORKFLOW_PARALLEL_MAX_BRANCHES) {
      errors.push(`WORKFLOW_PARALLEL_BRANCH_LIMIT:${fork.id}`);
      continue;
    }
    const region: WorkflowParallelRegion = { parallelNodeId: fork.id, joinNodeId: join.id, branches: [] };
    const branchIds = new Set<string>();
    const rejectedEnds = new Set<string>();
    for (const branch of fork.branches) {
      if (!record(branch) || !code(branch.id) || typeof branch.title !== 'string' || !branch.title.trim() || branchIds.has(branch.id)) {
        errors.push(`WORKFLOW_PARALLEL_BRANCH_INVALID:${fork.id}`);
        continue;
      }
      branchIds.add(branch.id);
      const body = new Set<string>(), visiting = new Set<string>(), done = new Set<string>();
      const walk = (id: string): void => {
        if (id === join.id) return;
        const node = nodes[id];
        if (!node) { errors.push(`WORKFLOW_PARALLEL_TARGET_MISSING:${fork.id}:${id}`); return; }
        if (node.kind === 'end') {
          if (node.outcome !== 'rejected') errors.push(`WORKFLOW_PARALLEL_BRANCH_END_INVALID:${fork.id}:${branch.id}:${id}`);
          else rejectedEnds.add(id);
          return;
        }
        if (node.kind === 'parallel' || node.kind === 'join') { errors.push(`WORKFLOW_PARALLEL_NESTING_FORBIDDEN:${fork.id}:${id}`); return; }
        if (visiting.has(id)) { errors.push(`WORKFLOW_PARALLEL_CYCLE:${fork.id}:${id}`); return; }
        if (done.has(id)) return;
        body.add(id);
        visiting.add(id);
        const targets = workflowForwardTargets(node);
        if (!targets.length) errors.push(`WORKFLOW_PARALLEL_BRANCH_DANGLING:${fork.id}:${id}`);
        for (const target of targets) walk(target);
        visiting.delete(id); done.add(id);
      };
      // Empty branches are legitimate and arrive immediately at their paired join.
      walk(branch.target);
      const writableFields = new Set<string>();
      for (const id of body) {
        const other = ownership.get(id);
        if (other) errors.push(`WORKFLOW_PARALLEL_BODY_OVERLAP:${fork.id}:${branch.id}:${id}`);
        else ownership.set(id, { parallel: fork.id, branch: branch.id });
        const node = nodes[id]!;
        if (node.kind === 'approval' || node.kind === 'handle') {
          for (const field of definition.taskPages?.[node.taskPageCode || '']?.fields || []) {
            const policy = node.fieldPolicy?.fields?.[field.code] || node.fieldPolicy?.default || 'readonly';
            if (field.readonly !== true && (policy === 'edit' || policy === 'edit_required')) writableFields.add(field.code);
          }
        }
      }
      region.branches.push({ id: branch.id, target: branch.target, nodeIds: [...body].sort(), writableFields: [...writableFields].sort() });
    }
    if (rejectedEnds.size > 1) errors.push(`WORKFLOW_PARALLEL_REJECT_END_NOT_SHARED:${fork.id}`);
    regions.push(region);
  }
  for (const node of Object.values(nodes)) {
    if (node?.kind === 'join' && !joins.has(node.id)) errors.push(`WORKFLOW_PARALLEL_JOIN_ORPHAN:${node.id}`);
  }
  if (ownership.has(definition.startAt)) errors.push(`WORKFLOW_PARALLEL_EXTERNAL_ENTRY:${definition.startAt}`);
  for (const [from, node] of Object.entries(nodes)) {
    if (!record(node)) continue;
    for (const target of workflowForwardTargets(node)) {
      const owner = ownership.get(target), source = ownership.get(from);
      const fork = owner && nodes[owner.parallel];
      const entry = fork?.kind === 'parallel' && from === fork.id && fork.branches.some(branch => branch.id === owner!.branch && branch.target === target);
      if (owner && !entry && (!source || source.parallel !== owner.parallel || source.branch !== owner.branch)) errors.push(`WORKFLOW_PARALLEL_EXTERNAL_ENTRY:${from}:${target}`);
      if (nodes[target]?.kind === 'join' && node.kind !== 'parallel') {
        const join = nodes[target] as WorkflowJoinNode;
        if (!source || source.parallel !== join.parallel) errors.push(`WORKFLOW_PARALLEL_EXTERNAL_JOIN:${from}:${target}`);
      }
    }
    if (node.kind === 'approval' || node.kind === 'handle') {
      const source = ownership.get(from);
      for (const target of workflowReturnTargets(node)) {
        const owner = ownership.get(target);
        if (source && (!owner || owner.parallel !== source.parallel || owner.branch !== source.branch)) errors.push(`WORKFLOW_PARALLEL_RETURN_CROSSES_BRANCH:${from}:${target}`);
        if (!source && owner) errors.push(`WORKFLOW_PARALLEL_RETURN_ENTERS_BRANCH:${from}:${target}`);
      }
    }
  }
  for (const region of regions) for (const branch of region.branches) {
    const siblings = region.branches.filter(other => other.id !== branch.id);
    for (const field of branch.writableFields) if (siblings.some(other => other.writableFields.includes(field))) errors.push(`WORKFLOW_PARALLEL_SHARED_WRITABLE_FIELD:${region.parallelNodeId}:${field}`);
    const forbiddenFacts = siblings.flatMap(other => [
      ...Object.entries(definition.subject?.factProjection || {}).filter(([, field]) => other.writableFields.some(root => overlap(root, field))).map(([fact]) => fact),
      ...other.nodeIds.filter(id => nodes[id]?.kind === 'action').map(id => `steps.${id}`),
    ]);
    for (const id of branch.nodeIds) {
      const node = nodes[id]!;
      if (node.kind !== 'action') continue;
      for (const input of Object.values(node.inputs || {})) if (input.source === 'fact' && forbiddenFacts.some(path => overlap(path, input.path))) errors.push(`WORKFLOW_PARALLEL_SIBLING_INPUT:${id}:${input.path}`);
    }
  }
  return { regions, errors: [...new Set(errors)] };
}
export function validateWorkflowParallel(definition: Definition): string[] { return inspectWorkflowParallel(definition).errors; }

export interface WorkflowParallelPosition {
  forkVisitId: string;
  parallelNodeId: string;
  branchId: string;
  activation: string[];
  arrived: string[];
  status: 'active' | 'joined' | 'rejected' | 'cancelled';
}
/** Same predicate as app_private.workflow_position_active_v2; current token presence is mandatory in a branch. */
export function workflowPositionActive(input: {
  status: string;
  currentNodeId: string | null;
  nodeId: string;
  forkVisitId?: string | null;
  branchId?: string | null;
  fork?: WorkflowParallelPosition | null;
  activeToken: boolean;
}): boolean {
  if (!['running', 'returned'].includes(input.status)) return false;
  if (!input.forkVisitId && !input.branchId) return input.currentNodeId === input.nodeId;
  const fork = input.fork;
  return !!fork && input.forkVisitId === fork.forkVisitId && input.branchId === fork.branchId && fork.status === 'active' &&
    input.currentNodeId === fork.parallelNodeId && fork.activation.includes(input.branchId!) && !fork.arrived.includes(input.branchId!) && input.activeToken;
}
