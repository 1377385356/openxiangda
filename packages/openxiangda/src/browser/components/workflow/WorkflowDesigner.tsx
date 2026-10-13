import { workflowDesignerAllowedActions, isWorkflowDesignerAuthorityLoss, isWorkflowDesignerAuthorityBusy } from './workflow-designer-authority';
import type { WorkflowDesignerPublishedView, NativeWorkflowManagementAction } from 'openxiangda-contracts/browser';
import { workflowAssignmentLeaves, workflowAuthoringCatalog, workflowCanvasBindingKey, createWorkflowHumanNode, pruneWorkflowCanvasBindings, validateWorkflowBusinessSteps, type WorkflowBinding } from 'openxiangda-contracts/browser';
import { WorkflowBusinessStepEditor } from './WorkflowBusinessStepEditor';
import { WorkflowParallelConfigurationEditor } from './WorkflowParallelConfigurationEditor.js';
import { WorkflowReminderEditor } from './WorkflowReminderEditor.js';
import { WorkflowNotificationEditor } from './WorkflowNotificationEditor.js';
import { WorkflowReturnPolicyEditor } from './WorkflowReturnPolicyEditor.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Collapse, Drawer, Empty, Input, Modal, Popconfirm, Radio, Segmented, Select, Skeleton, Space, Spin, Table, Tag, Tooltip } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, CloseOutlined, HistoryOutlined, MenuFoldOutlined, MenuUnfoldOutlined, RedoOutlined, RobotOutlined, SafetyOutlined, UndoOutlined, UserOutlined, FormOutlined, CodeOutlined, CopyOutlined, BranchesOutlined, BellOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { workflowReturnTargets, formatWorkflowSupervisorChain, type WorkflowSupervisorChainParameters, isWorkflowPlatformNotify, WORKFLOW_PLATFORM_NOTIFY_HANDLER, WORKFLOW_PLATFORM_NOTIFY_INPUT_SCHEMA, WORKFLOW_PLATFORM_NOTIFY_OUTPUT_SCHEMA, editWorkflowDesignerDefinition, projectWorkflowGraph, validateWorkflowDesignerDocument, workflowDesignerVariables, type WorkflowDefinition, type WorkflowDesignerDraft, type WorkflowDesignerSave, type WorkflowDesignerPublish, type WorkflowNode, type WorkflowNodeConfigurations, type WorkflowPublicationPreview, type WorkflowPublicationReceipt } from 'openxiangda-contracts/browser';
import { OpenXiangdaPlatformRequestError, loadWorkflowDesignerRead, loadWorkflowDesignerOriginalOutcome, loadWorkflowNodeConfigurations, loadApplicationAdministrationContext, saveWorkflowDesignerDraft, previewWorkflowDesignerPublication, publishWorkflowDesigner, loadWorkflowDesignerPublication, listWorkflowDesignerPublications, restoreWorkflowDesignerVersion, controlWorkflowDesignerPublication, searchWorkflowDesignerHoldCandidates } from '../../platform-client';
import { createBrowserUuid } from '../../uuid';
import { WorkflowDiagram } from './WorkflowDiagram';
import { workflowDesignerDisplayGraph, workflowDesignerOutlineRows, workflowDesignerStartId } from './workflow-designer-presentation';
import { WorkflowDraftHandlingEditor } from './WorkflowDraftHandlingEditor';
import { WorkflowNodeConfigurationEditor, type RetainedWorkflowNodeInput } from './WorkflowNodeConfigurationEditor';
import { WorkflowDesignerAssistant } from './WorkflowDesignerAssistant';
import { defaultWorkflowCondition } from './WorkflowConditionEditor';
import { WorkflowConditionConfigurationEditor } from './WorkflowConditionConfigurationEditor';
const kinds: Record<string,string> = { handle: '办理节点', approval: '审批节点', condition: '条件分支', parallel: '并行分支', join: '汇合', cc: '抄送', action: '已发布业务步骤', correction: '补正', end: '结束' };
const id = () => `node_${createBrowserUuid().replaceAll('-','').slice(0,12)}`;
const outcomeLabels: Record<string,string> = { eligible: '可更新', migrated: '已更新', deferred: '等待步骤完成', excepted: '需单独处理', held: '保留原版本', failed: '更新失败', completed: '已结束', superseded: '已替代' };
const refused = (error: unknown) => error instanceof OpenXiangdaPlatformRequestError && error.status >= 400 && error.status < 500;
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (left: unknown,right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

/** Canonical authoring. The graph is a projection; coordinates never become executable state. */
export function WorkflowDesigner({ workflowCode, onPublished, onDirtyChange, onStateChange, onBack }: { workflowCode: string; onBack?: () => void; onPublished?: (receipt: WorkflowPublicationReceipt) => void; onDirtyChange?: (dirty: boolean) => void; onStateChange?: (state: { dirty: boolean; busy: boolean; unknown: boolean }) => void }) {
  const { message } = App.useApp();
  const [authorityActions,setAuthorityActions] = useState<NativeWorkflowManagementAction[]>([]);
  const [publishedOnly,setPublishedOnly] = useState<WorkflowDesignerPublishedView>();
  const [authorityNotice,setAuthorityNotice] = useState('');
  const [retainedPrompt,setRetainedPrompt] = useState('');
  const [retainedInput,setRetainedInput] = useState<{definition: WorkflowDefinition; binding: WorkflowBinding}>();
  const [retainedNodeInput,setRetainedNodeInput] = useState<RetainedWorkflowNodeInput>();
  const definiteBusy = useRef(new Set<string>());
  const checkedOutcomes = useRef(new Set<string>());
  const authorityStopped = useRef(false);
  const canEdit = authorityActions.includes('draft.edit');
  const canPublish = authorityActions.includes('publication.publish');
  const canHandle = authorityActions.includes('handling.configure');
  const [draft,setDraft] = useState<WorkflowDesignerDraft>();
  const [definition,setDefinition] = useState<WorkflowDefinition>();
  const [stepInputInvalid,setStepInputInvalid] = useState(false);
  const [reminderDirty,setReminderDirty] = useState(false);
  const [binding,setBinding] = useState<WorkflowBinding>();
  const [nativeHeadRevision,setNativeHeadRevision] = useState<number>();
  const [configurations,setConfigurations] = useState<WorkflowNodeConfigurations>();
  const [selected,setSelected] = useState('');
  const [selectedEdge,setSelectedEdge] = useState<string>();
  const [publishedView,setPublishedView] = useState(false);
  const [outline,setOutline] = useState(true);
  const [detailInspector,setDetailInspector] = useState(true);
  const [inspector,setInspector] = useState(true);
  const [narrow,setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 899px)').matches);
  const inspectorElement = useRef<HTMLElement>(null);
  useEffect(() => { const media = matchMedia('(max-width: 899px)');const update = () => setNarrow(media.matches); media.addEventListener('change',update);return () => media.removeEventListener('change',update); }, []);
  const [liveState,setLiveState] = useState({ dirty: false, busy: false, unknown: false });
  const leaveHandling = useRef<((next: () => void) => void) | undefined>(undefined);
  const handlingGuardChanged = useCallback((guard: ((next: () => void) => void) | undefined) => { leaveHandling.current = guard; }, []);
  const handlingStateChanged = useCallback((state: typeof liveState) => setLiveState(state), []);
  const [outlineKeyword,setOutlineKeyword] = useState('');
  const [checksOpen,setChecksOpen] = useState(false);
  const [structureKeys,setStructureKeys] = useState<string[]>([]);
  const attemptedAutosave = useRef<string | undefined>(undefined);
  const [error,setError] = useState<string>();
  const [busy,setBusy] = useState(false);
  const [history,setHistory] = useState<Array<{definition:WorkflowDefinition;binding:WorkflowBinding}>>([]);
  const [future,setFuture] = useState<Array<{definition:WorkflowDefinition;binding:WorkflowBinding}>>([]);
  const [insert,setInsert] = useState<string>();
  const [template,setTemplate] = useState('condition');
  const [nodeTitle,setNodeTitle] = useState('');
  const [assistantContext,setAssistantContext] = useState('');
  const [assistantOpen,setAssistantOpen] = useState(false);
  const [assistantState,setAssistantState] = useState({ busy: false,unknown: false });
  const [versionsOpen,setVersionsOpen] = useState(false);
  const [versions,setVersions] = useState<Array<WorkflowPublicationReceipt & { reason: string; createdAt: string }>>([]);
  const [publication,setPublication] = useState(false);
  const [holdCandidates,setHoldCandidates] = useState<Array<{ instanceId: string; businessKey: string; nodeTitle: string }>>([]);
  const [preview,setPreview] = useState<WorkflowPublicationPreview>();
  const [scope,setScope] = useState<'running_and_new'|'new_only'>('running_and_new');
  const [releaseIds,setReleaseIds] = useState<string[]>([]);
  const [releaseReason,setReleaseReason] = useState('');
  const [reason,setReason] = useState('');
  const [holdNodeIds,setHoldNodeIds] = useState<string[]>([]);
  const [holdIds,setHoldIds] = useState<string[]>([]);
  const [holdReason,setHoldReason] = useState('');
  const [acknowledge,setAcknowledge] = useState(false);
  const [receipt,setReceipt] = useState<WorkflowPublicationReceipt & { items?: Array<{ instanceId: string; outcome: string; reason?: string; business_key: string }> }>();
  const heldExternalOperation = useRef<string | undefined>(undefined);
  const frozenSave = useRef<WorkflowDesignerSave | undefined>(undefined);
  const frozenPublish = useRef<WorkflowDesignerPublish | undefined>(undefined);
  const frozenAuxOperation = useRef<string | undefined>(undefined);
  const frozenAux = useRef<(() => Promise<void>) | undefined>(undefined);
  const alive = useRef(true);
  const acceptRead = (value: Awaited<ReturnType<typeof loadWorkflowDesignerRead>>, nativeSuperAdmin: boolean) => {
    const allowed = workflowDesignerAllowedActions(value,nativeSuperAdmin);
    setAuthorityActions(allowed.actions);
    setAuthorityNotice(allowed.legacy && !nativeSuperAdmin ? '当前平台版本尚不支持细粒度流程管理，已切换为只读。' : '');
    if (!allowed.actions.length) throw new Error('当前账号没有可用的流程查看权限');
    if ('view' in value && value.view === 'published') {
      setPublishedOnly(value);setDraft(undefined);setDefinition(value.definition);setBinding(value.binding);setPublishedView(false);
    } else {
      const next = value as WorkflowDesignerDraft;
      setPublishedOnly(undefined);setDraft(next);setDefinition(next.definition);setBinding(next.binding);
    }
    setSelected(value.definition.startAt);setHistory([]);setFuture([]);
  };
  const load = useCallback(async () => {
    const [value,configuration,context] = await Promise.all([loadWorkflowDesignerRead(workflowCode),loadWorkflowNodeConfigurations(workflowCode),loadApplicationAdministrationContext()]);
    if (context.headRevision == null) throw new Error('当前应用没有可用的办理配置版本');
    if (!alive.current) return;
    acceptRead(value,context.authorization === 'application_super_admin');
    authorityStopped.current = false;setConfigurations(configuration);setNativeHeadRevision(context.headRevision);setError(undefined);
  },[workflowCode]);
  useEffect(() => { alive.current = true; void load().catch(error => setError(String(error.message))); return () => { alive.current = false; }; },[load]);
  const refreshHandling = async () => {
    const [configuration,context] = await Promise.all([loadWorkflowNodeConfigurations(workflowCode),loadApplicationAdministrationContext()]);
    if (context.headRevision == null) throw new Error('当前应用没有可用的办理配置版本');
    setConfigurations(configuration);setNativeHeadRevision(context.headRevision);
  };
  const dirty = !!retainedInput || !!retainedNodeInput || !!retainedPrompt || !!draft && !!definition && (!same(draft.definition,definition) || !same(draft.binding,binding) || stepInputInvalid || reminderDirty);
  const unknown = !!heldExternalOperation.current || [frozenSave.current?.operationId,frozenPublish.current?.operationId,frozenAuxOperation.current].some(operation => !!operation && !definiteBusy.current.has(operation)) || assistantState.unknown || liveState.unknown;
  useEffect(() => {onDirtyChange?.(dirty || liveState.dirty || unknown);onStateChange?.({ dirty: dirty || liveState.dirty,busy: busy || assistantState.busy || liveState.busy,unknown }); },[dirty,busy,unknown,assistantState,liveState,onDirtyChange,onStateChange]);
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (dirty || unknown || busy) { event.preventDefault(); event.returnValue = ''; } }; addEventListener('beforeunload',guard);return () => removeEventListener('beforeunload',guard); },[dirty,unknown,busy]);
  useEffect(() => {
    if (!receipt || receipt.status !== 'running' || publication) return;
    let active = true;
    const poll = setInterval(() => { void loadWorkflowDesignerPublication(workflowCode,receipt.publicationId).then(value => { if (active) setReceipt(value); },() => {}); },3000);
    return () => { active = false;clearInterval(poll); };
  },[workflowCode,receipt?.publicationId,receipt?.status,publication]);
  const shown = publishedView ? draft?.publishedDefinition : definition;
  const graph = useMemo(() => shown ? projectWorkflowGraph(shown,'draft') : undefined,[shown]);
  const displayGraph = useMemo(() => {
    const activeReturn = structureKeys.includes('return') ? shown?.nodes[selected] : undefined;
    return graph ? workflowDesignerDisplayGraph(graph, activeReturn?.id, activeReturn && ['approval','handle'].includes(activeReturn.kind) ? workflowReturnTargets(activeReturn as Extract<WorkflowNode,{kind:'approval'|'handle'}>) : []) : undefined;
  }, [graph, structureKeys, selected, shown]);
  const outlineNodes = useMemo(() => displayGraph ? workflowDesignerOutlineRows(displayGraph) : [], [displayGraph]);
  useEffect(() => { if (shown && selected !== workflowDesignerStartId && !shown.nodes[selected]) setSelected(shown.startAt); }, [shown, selected]);
  const catalog = useMemo(() => canEdit ? draft?.capabilities || (draft ? workflowAuthoringCatalog(draft.publishedDefinition,draft.publishedBinding) : undefined) : { appVersionId: '',digest: '',taskPages: {},steps: [],peopleSources: {} },[draft,canEdit]);
  const variables = useMemo(() => definition ? workflowDesignerVariables(definition) : [],[definition]);
  const errors = useMemo(() => definition ? [...validateWorkflowDesignerDocument(definition),...validateWorkflowBusinessSteps(definition),...Object.values(definition.nodes).flatMap(node => {
    if (!('binding' in node)) return [];
    const entry=binding?.bindings[node.binding];
    return !entry || entry.provider==='fixed_users'&&!entry.users?.length || entry.provider==='app_role'&&!entry.roleCode&&!entry.roleCodes?.length ? [`WORKFLOW_DESIGNER_PEOPLE_REQUIRED:${node.id}`] : [];
  })] : [],[definition,binding]);
  const node = shown?.nodes[selected];
  const liveNode = configurations?.nodes.find(item => item.nodeId === selected);
  const disabled = !canEdit || authorityStopped.current || busy || assistantState.busy || assistantState.unknown || publishedView || !!frozenSave.current || !!frozenPublish.current || !!frozenAux.current;
  const mutate = (next: WorkflowDefinition, nextBinding = binding) => {
    if (!definition || !binding || !nextBinding || disabled) return;
    setHistory(current => {
      const bounded = [...current,{definition,binding}].slice(-25);
      while (bounded.length > 1 && bounded.reduce((bytes,item) => bytes + JSON.stringify(item).length,0) > 4 * 1024 * 1024) bounded.shift();
      return bounded;
    });setFuture([]);setDefinition(next);setBinding(pruneWorkflowCanvasBindings(next,nextBinding,draft!.publishedBinding));setError(undefined);
  };
  const patch = (patch: Record<string,unknown>) => { if (definition && node) mutate(editWorkflowDesignerDefinition(definition,{ type: 'node',nodeId: node.id,patch })); };
  const loseAuthority = async (failure: unknown, assistantOperation?: string, assistantPrompt?: string, nodeInput?: RetainedWorkflowNodeInput) => {
    if (!isWorkflowDesignerAuthorityLoss(failure)) return false;
    if (nodeInput) setRetainedNodeInput(nodeInput);
    if (assistantPrompt) setRetainedPrompt(assistantPrompt);
    if (assistantOperation) heldExternalOperation.current = assistantOperation;
    authorityStopped.current = true;setAuthorityActions([]);
    if (definition && binding && draft && (!same(draft.definition,definition) || !same(draft.binding,binding))) setRetainedInput(structuredClone({definition,binding}));setAssistantOpen(false);setPublication(false);
    const operation = assistantOperation || frozenSave.current?.operationId || frozenPublish.current?.operationId || frozenAuxOperation.current;
    let notice = '流程管理权限已改变，当前输入已保留且尚未保存。';
    if (operation && !checkedOutcomes.current.has(operation)) {
      checkedOutcomes.current.add(operation);
      try {
        const result = await loadWorkflowDesignerOriginalOutcome(workflowCode,operation);
        notice = result.state === 'committed' ? '原操作已提交；权限已改变，当前输入保留供核对。' : result.state === 'not_committed' ? '原操作未提交，当前输入已保留且尚未保存。' : '原操作结果仍待确认，请联系应用管理员核对。';
        if (result.state !== 'undetermined') { heldExternalOperation.current = undefined;frozenSave.current = undefined;frozenPublish.current = undefined;frozenAux.current = undefined;frozenAuxOperation.current = undefined; }
      } catch { notice = '原操作结果暂时无法确认，请联系应用管理员核对。当前输入已保留。'; }
    }
    try {
      const value = await loadWorkflowDesignerRead(workflowCode);
      acceptRead(value,false);
    } catch { setDraft(undefined);setPublishedOnly(undefined); }
    setAssistantState({busy:false,unknown:false});setAuthorityNotice(notice);setError(notice);return true;
  };
  const save = async (quiet = false) => {
    if (!canEdit || authorityStopped.current || !draft || !definition) return undefined;
    if (reminderDirty && !frozenSave.current) { message.warning('请先确定或取消办理提醒的修改。');return undefined; }
    if (stepInputInvalid && !frozenSave.current) { setError('业务步骤固定值不是有效 JSON，请修正后再保存。');return undefined; }
    setBusy(true);
    try {
      frozenSave.current ||= { expectedRevision: draft.revision,expectedHeadRevision: draft.baseHeadRevision,operationId: createBrowserUuid(),definition,binding: binding! };
      definiteBusy.current.delete(frozenSave.current.operationId);
      const saved = await saveWorkflowDesignerDraft(workflowCode,frozenSave.current);
      frozenSave.current = undefined;setDraft(saved);setDefinition(saved.definition);setBinding(saved.binding);setError(undefined);if (!quiet) message.success('流程草稿已保存');return saved;
    } catch (error) { if (await loseAuthority(error)) return undefined; if (isWorkflowDesignerAuthorityBusy(error)) { if (frozenSave.current) definiteBusy.current.add(frozenSave.current.operationId);setError('权限正在变更，本次未写入；请稍后重试原保存请求。');return undefined; } if (refused(error)) frozenSave.current = undefined;setError(`${String((error as Error).message)}${refused(error) ? '。修改已保留，可修正后再次保存。' : '。结果待确认，请重试原保存请求。'}`);return undefined; }
    finally { setBusy(false); }
  };
  const autosave = useRef(save); autosave.current = save;
  useEffect(() => {
    if (!canEdit || authorityStopped.current || !dirty || !definition || stepInputInvalid || reminderDirty || busy || publishedView || frozenSave.current || frozenPublish.current || frozenAux.current || attemptedAutosave.current === JSON.stringify({definition,binding})) return;
    let timer: ReturnType<typeof setTimeout>;
    const persist = () => {
      if (inspectorElement.current?.querySelector('[role="combobox"][aria-expanded="true"]')) {
        timer = setTimeout(persist,300);return;
      }
      attemptedAutosave.current = JSON.stringify({definition,binding});void autosave.current(true);
    };
    timer = setTimeout(persist,900);
    return () => clearTimeout(timer);
  }, [dirty, definition, binding, busy, publishedView, stepInputInvalid, reminderDirty, canEdit]);
  const inspectorReady = () => {
    if (stepInputInvalid) { message.warning('业务步骤固定值不是有效 JSON，请先修正，或切换此输入来源以放弃该值。');return false; }
    if (reminderDirty) { message.warning('请先确定或取消办理提醒的修改。');return false; }
    return true;
  };
  const closeInspector = () => { if (!inspectorReady()) return; const close = () => setInspector(false);if (leaveHandling.current) leaveHandling.current(close); else close(); };
  const selectNode = (value: string,edgeId?: string) => {
    if (value !== selected && !inspectorReady()) return;
    const next = () => { setSelected(value);setSelectedEdge(edgeId); if (value !== selected) setStructureKeys([]); setInspector(value !== workflowDesignerStartId); };
    if (value !== selected && leaveHandling.current) leaveHandling.current(next); else next();
  };
  const selectEdge = (value: string) => {
    const edge=displayGraph?.edges.find(edge => edge.id === value);
    if (edge && ['branch','default'].includes(edge.kind)) selectNode(edge.from,value);
    else setSelectedEdge(value);
  };
  useEffect(() => {
    if (!narrow || !inspector) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = inspectorElement.current;
    const keydown = (event: KeyboardEvent) => {
      if (!element || !element.contains(event.target as Node) || event.defaultPrevented) return;
      if (event.key === 'Escape' && ![...element.querySelectorAll('[aria-expanded="true"]')].some(item => item.getClientRects().length)) {
        event.preventDefault();closeInspector();
      }
      if (event.key === 'Tab') {
        const focusable = [...element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(item => item.getClientRects().length);
        const target = event.shiftKey && document.activeElement === focusable[0] ? focusable.at(-1) : !event.shiftKey && document.activeElement === focusable.at(-1) ? focusable[0] : undefined;
        if (target) { event.preventDefault();target.focus(); }
      }
    };
    element?.querySelector<HTMLElement>('button')?.focus();document.addEventListener('keydown',keydown);
    return () => { document.removeEventListener('keydown',keydown); previous?.focus({preventScroll:true}); };
  }, [narrow, inspector, stepInputInvalid, reminderDirty]);
  const switchVersion = (value: string | number) => {
    if (!inspectorReady()) return;
    const next = () => { setPublishedView(value === 'published'); };
    if (leaveHandling.current) leaveHandling.current(next); else next();
  };
  const goBack = () => {
    if (unknown || busy || assistantState.busy || liveState.busy || !inspectorReady()) return;
    const next = () => { if (dirty && canEdit && !authorityStopped.current) { void save(true).then(saved => { if (saved) { if (onBack) onBack(); else { const url = new URL(location.href);url.searchParams.delete('design');location.assign(url.href); } } });return; } if (onBack) onBack(); else { const url = new URL(location.href); url.searchParams.delete('design'); location.assign(url.href); } };
    if (leaveHandling.current) leaveHandling.current(next); else next();
  };
  const holds = () => holdIds.length || holdNodeIds.length ? [{ instanceIds: holdIds,nodeIds: holdNodeIds,reason: holdReason.trim() }] : [];
  const check = async (value: WorkflowDesignerDraft = draft!, selectedHolds = holds()) => {
    if (!canPublish || authorityStopped.current || !value) return;
    setBusy(true);setPreview(undefined);
    try { const result = await previewWorkflowDesignerPublication(workflowCode,{ expectedRevision: value.revision,holds: selectedHolds });setPreview(result);setHoldCandidates(result.items);setError(undefined); }
    catch (error) { setError(String((error as Error).message)); } finally { setBusy(false); }
  };
  const openPublication = async () => {
    if (!canPublish || authorityStopped.current) return;
    const saved = dirty || frozenSave.current ? await save() : draft;
    if (!saved) return;setScope('running_and_new');setHoldIds([]);setHoldNodeIds([]);setHoldReason('');setReason('');setAcknowledge(false);setPublication(true);setPreview(undefined);
    await check(saved,[]);
  };
  const publish = async () => {
    if (!canPublish || authorityStopped.current || !draft || !reason.trim() || scope === 'running_and_new' && (holdIds.length || holdNodeIds.length) && !holdReason.trim()) return;
    setBusy(true);
    try {
      frozenPublish.current ||= { expectedRevision: draft.revision,expectedHeadRevision: draft.baseHeadRevision,operationId: createBrowserUuid(),reason: reason.trim(),scope,holds: scope === 'running_and_new' ? holds() : [],acknowledgeExceptions: acknowledge };
      definiteBusy.current.delete(frozenPublish.current.operationId);
      const result = await publishWorkflowDesigner(workflowCode,frozenPublish.current);
      frozenPublish.current = undefined;setReceipt(result);setPublication(false);await load();onPublished?.(result);message.success('流程版本已发布并启用');
    } catch (error) { if (await loseAuthority(error)) return; if (isWorkflowDesignerAuthorityBusy(error)) { if (frozenPublish.current) definiteBusy.current.add(frozenPublish.current.operationId);setError('权限正在变更，本次未写入；请稍后重试原发布请求。');return; } if (refused(error)) frozenPublish.current = undefined;setError(`${String((error as Error).message)}${refused(error) ? '。草稿已保留。' : '。结果待确认，重试将使用原发布请求。'}`); } finally { setBusy(false); }
  };
  const openAssistant = async () => {
    if (disabled || !inspectorReady()) return;
    if (dirty || frozenSave.current) { const saved = await save();if (!saved) return; }
    setInspector(true);setAssistantOpen(true);
  };
  const showVersions = async () => {
    setVersionsOpen(true);setBusy(true);
    try { setVersions(await listWorkflowDesignerPublications(workflowCode)); } catch (error) { setError(String((error as Error).message)); } finally { setBusy(false); }
  };
  const retryAux = async () => {
    if (authorityStopped.current || !frozenAux.current) return;setBusy(true);
    try { if (frozenAuxOperation.current) definiteBusy.current.delete(frozenAuxOperation.current);await frozenAux.current();frozenAux.current = undefined;frozenAuxOperation.current = undefined;setError(undefined); }
    catch (error) { if (await loseAuthority(error)) return; if (isWorkflowDesignerAuthorityBusy(error)) { if (frozenAuxOperation.current) definiteBusy.current.add(frozenAuxOperation.current);setError('权限正在变更，本次未写入；请稍后重试原操作。');return; } if (refused(error)) { frozenAux.current = undefined;frozenAuxOperation.current = undefined; }setError(`${String((error as Error).message)}${refused(error) ? '。输入已保留。' : '。结果待确认，请重试原操作。'}`); }
    finally { setBusy(false); }
  };
  const restore = async (version: number) => {
    if (!canEdit || authorityStopped.current || !draft || frozenAux.current) return;
    const input = { version,expectedRevision: draft.revision,expectedHeadRevision: draft.baseHeadRevision,operationId: createBrowserUuid() };
    frozenAuxOperation.current = input.operationId;
    frozenAux.current = async () => {
      const restored = await restoreWorkflowDesignerVersion(workflowCode,input);
      setDraft(restored);setDefinition(restored.definition);setBinding(restored.binding);setHistory([]);setFuture([]);setVersionsOpen(false);message.success('历史版本已恢复到草稿，检查后可发布');
    };await retryAux();
  };
  const control = async (action: 'pause'|'resume'|'retry_failed') => {
    if (!canPublish || authorityStopped.current || !receipt || !draft || frozenAux.current) return;
    const publicationId = receipt.publicationId;
    const input = { expectedHeadRevision: draft.baseHeadRevision,operationId: createBrowserUuid(),action,reason: action === 'pause' ? '管理员暂停更新' : action === 'retry_failed' ? '管理员重试更新失败的申请' : '管理员继续更新' };
    frozenAuxOperation.current = input.operationId;
    frozenAux.current = async () => { setReceipt(await controlWorkflowDesignerPublication(workflowCode,publicationId,input)); };await retryAux();
  };
  const searchHolds = async (keyword: string) => {
    try { setHoldCandidates(await searchWorkflowDesignerHoldCandidates(workflowCode,keyword)); }
    catch (error) { setError(String((error as Error).message)); }
  };
  const releaseHolds = async () => {
    if (!canPublish || authorityStopped.current || !receipt || !draft || !releaseIds.length || !releaseReason.trim() || frozenAux.current) return;
    const publicationId = receipt.publicationId;
    const input = { expectedHeadRevision: draft.baseHeadRevision,operationId: createBrowserUuid(),action: 'release_holds' as const,instanceIds: releaseIds,reason: releaseReason.trim() };
    frozenAuxOperation.current = input.operationId;
    frozenAux.current = async () => { setReceipt(await controlWorkflowDesignerPublication(workflowCode,publicationId,input));setReleaseIds([]);setReleaseReason(''); };await retryAux();
  };
  const insertNode = (chosenTemplate = template, chosenTitle = nodeTitle, edgeId = insert) => {
    const edge = displayGraph?.edges.find(item => item.id === edgeId);
    if (!edge || !definition || !chosenTitle.trim()) return;
    const nodeId = id();
    if (chosenTemplate === 'parallel') {
      const joinId = id(), branches = [{ id: 'branch_1',title: '分支 1' },{ id: 'branch_2',title: '分支 2' }];
      try {
        const next = edge.from === workflowDesignerStartId ? { ...definition,startAt: nodeId,nodes: { ...definition.nodes,
          [nodeId]: { id: nodeId,kind: 'parallel' as const,title: chosenTitle.trim(),join: joinId,branches: branches.map(branch => ({ ...branch,target: joinId })) },
          [joinId]: { id: joinId,kind: 'join' as const,title: '全部完成后继续',parallel: nodeId,next: edge.to } } } :
          editWorkflowDesignerDefinition(definition,{ type: 'insert_parallel',from: edge.from,target: edge.to,id: nodeId,joinId,title: chosenTitle.trim(),branches,edge: edge.kind === 'branch' ? (edge.priority || 1)-1 : edge.kind === 'default' ? 'default' : edge.kind as 'approve'|'reject'|'next' });
        mutate(next);setSelected(nodeId);setInspector(true);setStructureKeys([]);setInsert(undefined);
      } catch (failure) { message.error(failure instanceof Error ? failure.message : '并行分支添加失败'); }
      return;
    }
    let next: WorkflowNode;
    let nextBinding = binding!;
    let insertionDefinition = definition;
    if (chosenTemplate === 'condition') next = { id: nodeId,kind: 'condition',title: chosenTitle.trim(),branches: [{ label: '条件 1',when: defaultWorkflowCondition(variables),target: edge.to }],otherwise: edge.to };
    else if (chosenTemplate === 'platform_notify') next = { id: nodeId, kind: 'action', title: chosenTitle.trim(), next: edge.to,
      handler: { code: WORKFLOW_PLATFORM_NOTIFY_HANDLER, version: 1, mode: 'reconciled-effect' },
      inputSchema: structuredClone(WORKFLOW_PLATFORM_NOTIFY_INPUT_SCHEMA), outputSchema: structuredClone(WORKFLOW_PLATFORM_NOTIFY_OUTPUT_SCHEMA),
      inputs: { text: { source: 'literal', value: '请关注此申请的最新进展。' } }, notification: { template: 'workflow_message', recipients: { provider: 'initiator' } } };
    else if (['approval','handle','cc'].includes(chosenTemplate)) {
      let reject = Object.values(definition.nodes).find(node => node.kind==='end' && node.outcome==='rejected')?.id;
      if (chosenTemplate==='approval' && !reject) { reject=id();insertionDefinition={...definition,nodes:{...definition.nodes,[reject]:{id:reject,kind:'end',title:'申请已拒绝',outcome:'rejected'}}}; }
      next=createWorkflowHumanNode(nodeId,chosenTemplate as 'approval'|'handle'|'cc',chosenTitle.trim(),edge.to,undefined,catalog?.taskPages,reject);
      nextBinding={...binding!,bindings:{...binding!.bindings,[workflowCanvasBindingKey(nodeId)]:{provider:'fixed_users',users:[]}}};
    } else if (chosenTemplate==='action') {
      const step=catalog?.steps[0];
      if(!step){message.info('应用还没有发布可选业务步骤，请通过 AI 助手准备新能力。');setAssistantContext('当前应用没有可选业务步骤。请提出需要由应用开发新增并发布的步骤能力方案，不要假设未发布代码已经可以执行。');setAssistantOpen(true);setInspector(true);return;}
      next={...structuredClone(step),id:nodeId,kind:'action',next:edge.to,inputs:{}};
    } else {
      const source = draft?.publishedDefinition.nodes[chosenTemplate];
      if (!source || !['approval','handle','cc','action'].includes(source.kind)) return;
      if(source.kind==='approval'||source.kind==='handle'||source.kind==='cc') {
        next=createWorkflowHumanNode(nodeId,source.kind,chosenTitle.trim(),edge.to,'taskPageCode' in source?source.taskPageCode:undefined,catalog!.taskPages,source.kind==='approval'?source.onReject:undefined);
        if(next.kind==='approval'||next.kind==='handle')next.mode=source.kind==='approval'||source.kind==='handle'?source.mode:'single';
        nextBinding={...binding!,bindings:{...binding!.bindings,[workflowCanvasBindingKey(nodeId)]:structuredClone(draft!.publishedBinding.bindings[source.binding]!)}};
      }else if(source.kind==='action')next={...structuredClone(source),id:nodeId,title:chosenTitle.trim(),next:edge.to};
      else return;
    }
    try {
      mutate(edge.from === workflowDesignerStartId ? { ...insertionDefinition, startAt: next.id, nodes: { ...insertionDefinition.nodes, [next.id]: next } } : editWorkflowDesignerDefinition(insertionDefinition,{ type: 'insert',from: edge.from,target: edge.to,node: next,edge: edge.kind === 'branch' ? (edge.priority || 1) - 1 : edge.kind === 'default' ? 'default' : edge.kind as 'approve'|'reject'|'next' }),nextBinding);
      setSelected(nodeId);setInspector(true);setStructureKeys([]);setInsert(undefined);
    } catch (error) { setError(String((error as Error).message)); }
  };
  const retained = <>
    {retainedPrompt && <Alert type="warning" title="保留的助手输入" description={retainedPrompt} action={<Button onClick={() => setRetainedPrompt('')}>放弃助手输入</Button>} />}
    {retainedInput && <details open><summary>查看保留的未保存输入</summary>
      <WorkflowDiagram graph={projectWorkflowGraph(retainedInput.definition,'draft')} selectedNodeId={retainedInput.definition.startAt} onSelectNode={() => {}} />
      <Input.TextArea aria-label="保留的流程与人员规则" readOnly rows={8} value={JSON.stringify(retainedInput,null,2)} />
      <Button onClick={() => setRetainedInput(undefined)}>放弃保留输入</Button></details>}
    {retainedNodeInput && <Alert type="warning" title={`保留的办理设置：${retainedNodeInput.nodeId}`} description={<Input.TextArea aria-label="保留的办理设置输入" readOnly rows={8} value={JSON.stringify(retainedNodeInput.values,null,2)} />} action={<Button onClick={() => setRetainedNodeInput(undefined)}>放弃办理设置输入</Button>} />}
  </>;
  if (publishedOnly && configurations && nativeHeadRevision != null) return <section className="oxa-workflow-designer">
    <Space wrap><Button onClick={goBack}>返回</Button><h2>{publishedOnly.definition.title}</h2><Tag>已发布 v{publishedOnly.definitionVersion}</Tag><Button onClick={() => void showVersions()}>版本记录</Button></Space>
    {authorityNotice && <Alert type="warning" title={authorityNotice} />}{retained}
    <WorkflowDiagram graph={projectWorkflowGraph(publishedOnly.definition,'draft')} selectedNodeId={selected} onSelectNode={selectNode} />
    {liveNode && <WorkflowNodeConfigurationEditor key={liveNode.nodeId} workflowCode={workflowCode} node={liveNode} principals={configurations.principals} conditionalAssignment={configurations.conditionalAssignment}
      expectedHeadRevision={nativeHeadRevision} presentation="inline" readOnly={!canHandle || authorityStopped.current} onClose={() => setSelected('')}
      onStateChange={handlingStateChanged} onLeaveGuardChange={handlingGuardChanged} onAuthorityLoss={loseAuthority} onSaved={() => void refreshHandling().catch(failure=>setError(String(failure.message)))} />}
    <Drawer open={versionsOpen} title="流程版本记录" onClose={()=>setVersionsOpen(false)}><Table rowKey="publicationId" dataSource={versions} pagination={{pageSize:10}} columns={[{title:'版本',dataIndex:'definitionVersion'},{title:'说明',dataIndex:'reason'}]} /></Drawer>
    {error && <Alert type="error" title={error} />}
  </section>;
  if (authorityStopped.current && !draft && !publishedOnly) return <section><Alert type="warning" title={authorityNotice || error} />{retained}<Button onClick={goBack}>返回</Button></section>;
  if (!draft || !definition || !graph || nativeHeadRevision == null) return error ? <Alert type="error" title="流程设计未能载入" description={error} action={<Button onClick={() => void load().catch(error => setError(String(error.message)))}>重新载入</Button>} /> : <Skeleton active />;
  const targets = Object.values(definition.nodes).filter(item => item.id !== selected).map(item => ({ value: item.id,label: item.title || item.id }));
  const typeIcons = { approval: UserOutlined, handle: FormOutlined, condition: BranchesOutlined, parallel: BranchesOutlined, join: CheckCircleOutlined, action: CodeOutlined, cc: CopyOutlined, correction: FormOutlined, end: CheckCircleOutlined, start: PlayCircleOutlined };
  const NodeIcon = isWorkflowPlatformNotify(node) ? BellOutlined : typeIcons[node?.kind as keyof typeof typeIcons] || CodeOutlined;
  const summaries = Object.fromEntries((configurations?.nodes || []).map(item => {
    const binding = item.effective.binding;
    const source = binding?.provider === 'fixed_users' ? `指定成员：${(binding.users || []).map(user => configurations?.principals.users.find(person => person.value === user)?.label || '成员').join('、')}` : ['app_role','app_role_in_scope'].includes(binding?.provider || '') ? `应用角色：${(binding?.roleCodes || (binding?.roleCode ? [binding.roleCode] : [])).map(code => configurations?.principals.roles.find(role => role.code === code)?.name || '已配置角色').join('、')}` : binding?.provider === 'supervisor_chain' ? formatWorkflowSupervisorChain(binding as WorkflowSupervisorChainParameters) : '按已配置的人员规则';
    const mode = ({ single: '单人', any: '或签', all: '会签', sequence: '依次审批' } as Record<string,string>)[item.effective.mode || ''] || '';
    return [item.nodeId, `${mode}${mode ? ' · ' : ''}${source}`];
  }));
  const human = node?.kind === 'approval' || node?.kind === 'handle';
  const panel = <div className="oxa-workflow-designer-inspector">
    <header><span className={`oxa-designer-inspector-icon kind-${node?.kind || 'start'}`}><NodeIcon /></span><h2>{node?.title || '流程发起'}</h2><Tag>{isWorkflowPlatformNotify(node) ? '通知节点' : kinds[node?.kind || ''] || '发起'}</Tag><Button type="text" icon={<CloseOutlined />} aria-label="关闭节点设置" onClick={closeInspector} /></header>
    {node ? <>
      <div hidden={human && structureKeys.includes('return')}>{liveNode && configurations && ['approval','handle','cc'].includes(node.kind) ? <WorkflowNodeConfigurationEditor
        key={`${liveNode.nodeId}:${liveNode.configuration.revision}`} workflowCode={workflowCode} node={liveNode} principals={configurations.principals} conditionalAssignment={configurations.conditionalAssignment}
        expectedHeadRevision={nativeHeadRevision} presentation="inline" readOnly={!canHandle || authorityStopped.current} compact={!detailInspector && !narrow} onExpand={() => { setDetailInspector(true);setOutline(false); }}
        onClose={closeInspector} onStateChange={handlingStateChanged} onLeaveGuardChange={handlingGuardChanged} onAuthorityLoss={loseAuthority}
        returnSummary={human && (node.returnPolicy?.targets || node.returnTargets || []).length ? <div><Tag color="gold">随草稿发布</Tag><div>{(node.returnPolicy?.targets || (node.returnTargets || []).map(nodeId => ({ nodeId, defaultRoute: 'replay' }))).map(target => <p key={target.nodeId}>{definition.nodes[target.nodeId]?.title || '退回目标'} · {target.defaultRoute === 'resume' ? '重新提交后直接回到本节点' : '重新提交后重新按流程流转'}</p>)}</div><Button type="link" size="small" onClick={() => setStructureKeys(['return'])}>编辑退回设置</Button></div> : undefined}
        onSaved={() => { void refreshHandling().catch(failure => setError(`办理设置已保存，重新读取失败：${String(failure.message)}`)); }} /> : draft.publishedDefinition.nodes[node.id] && ['approval','handle','cc'].includes(node.kind) ? <Alert type="warning" showIcon title="已发布节点的办理设置未能载入" description="此节点不是新增草稿节点，请重新读取配置后修改。" action={<Button onClick={() => void refreshHandling().catch(failure=>setError(String(failure.message)))}>重新读取办理设置</Button>} /> : ['approval','handle','cc'].includes(node.kind) && <WorkflowDraftHandlingEditor node={node as any} baseline={node as any} bindingOptions={Object.keys(draft.publishedBinding.bindings).map(value=>({value,label:value}))}
          conditionalContext={catalog?.conditionalAssignments ? { definition, nodeId: node.id, standardProviders: ['fixed_users', 'app_role'], releasedSources: Object.fromEntries(Object.entries(catalog.peopleSources).flatMap(([key, source]) => workflowAssignmentLeaves(source).map((leaf, index) => [`${key}/${index}`, leaf]))) } : undefined}
          binding={binding?.bindings['binding' in node ? node.binding : '']} sources={catalog!.peopleSources} principals={configurations?.principals || {users:[],roles:[]}} disabled={disabled}
          onBindingChange={entry => { if (!('binding' in node) || !binding) return;mutate({...definition,nodes:{...definition.nodes,[node.id]:{...node,...((entry.provider==='conditional' ? [...entry.cases.map(rule=>rule.assignee),entry.otherwise] : [entry]).some(leaf=>leaf.provider==='supervisor_chain'&&leaf.continuous!==false)?{mode:'sequence'}:{})} as WorkflowNode}}, {...binding,bindings:{...binding.bindings,[node.binding]:entry}}); }} onChange={patch} /> }</div>
      {node.kind==='action' && !isWorkflowPlatformNotify(node) && catalog && <WorkflowBusinessStepEditor key={`${node.id}:${node.handler.code}`} node={node} catalog={catalog} variables={variables} disabled={disabled} onValidityChange={setStepInputInvalid} onChange={patch} onAssistant={() => { setAssistantContext(`当前步骤：${node.title}（${node.handler.code} v${node.handler.version}）。需要新增业务能力时，请提出源代码与发布契约的改造方案，不要假设新能力已经发布。`);setAssistantOpen(true);setInspector(true); }} />}
      {node.kind === 'parallel' && <WorkflowParallelConfigurationEditor key={node.id} node={node} selectedBranch={node.branches[(graph.edges.find(edge => edge.id === selectedEdge && edge.from === node.id)?.priority || 0)-1]?.id} variables={variables} disabled={disabled} onChange={value => patch({ branches: value.branches })} onRemove={branchId => mutate(editWorkflowDesignerDefinition(definition,{ type: 'remove_parallel_branch',nodeId: node.id,branchId }))} />}
      {node.kind === 'join' && <Alert type="info" showIcon title="本次进入的全部分支完成后继续" description="汇合点与并行分支成对维护。若要删除整个并行区域，请在并行节点设置中操作。" />}
      {node.kind === 'condition' && <WorkflowConditionConfigurationEditor key={node.id} node={node} variables={variables} targets={targets} selectedBranch={graph.edges.find(edge => edge.id === selectedEdge && edge.from === node.id && edge.kind === 'branch')?.priority ? graph.edges.find(edge => edge.id === selectedEdge)!.priority! - 1 : undefined} disabled={disabled} onChange={value => patch({ branches: value.branches, otherwise: value.otherwise })} />}
      {human && structureKeys.includes('return') && <><Button type="link" className="oxa-designer-return-back" icon={<ArrowLeftOutlined />} onClick={() => setStructureKeys([])}>返回节点配置</Button><WorkflowReturnPolicyEditor definition={definition} node={node} disabled={disabled} onChange={returnPolicy => patch({ returnPolicy, returnTargets: returnPolicy.targets.map(target => target.nodeId) })} /></>}
      <section className="oxa-designer-draft-band" hidden={human && structureKeys.includes('return')}><h3>流程结构 · 随草稿发布</h3>
        <Collapse ghost activeKey={structureKeys} onChange={keys => setStructureKeys(Array.isArray(keys) ? keys : [keys])} items={[
          { key: 'name', label: '节点名称', extra: <span>{node.title || '未命名节点'}</span>, children: <label>节点名称<Input disabled={disabled} value={node.title || ''} onChange={event => patch({ title: event.target.value })} /></label> },
          ...(human ? [{ key: 'return', label: '退回设置', extra: <span>{(node.returnPolicy?.targets || node.returnTargets || []).length ? `可退回 ${(node.returnPolicy?.targets || node.returnTargets || []).length} 个节点` : '未配置退回目标'}</span>, children: null }] : []),
          ...(['approval','handle','correction'].includes(node.kind) ? [{ key: 'reminder', label: '办理提醒', extra: <span>{'reminders' in node && node.reminders ? `${node.reminders.afterSeconds >= 3600 ? `${node.reminders.afterSeconds / 3600} 小时` : `${node.reminders.afterSeconds / 60} 分钟`}后提醒` : '未设置提醒'}</span>, children: <>{['approval','handle','correction'].includes(node.kind) && <WorkflowReminderEditor key={node.id} rule={'reminders' in node ? node.reminders : undefined} disabled={disabled} onDirtyChange={setReminderDirty} onChange={reminders => patch({ reminders })} />}</> }] : []),
          ...((human || 'taskPageCode' in node) ? [{ key: 'page', label: '本节点表单', extra: <span>{definition.taskPages?.[node.taskPageCode || '']?.title || '应用自定义页面'}</span>, children: <>{human && !liveNode ? <Select aria-label="本节点表单" allowClear disabled={disabled} value={node.taskPageCode} placeholder="标准只读详情（不保存表单）" options={Object.entries(catalog!.taskPages).map(([value,page])=>({value,label:page.title}))} onChange={pageCode=>{const standard=createWorkflowHumanNode(node.id,node.kind as 'approval'|'handle',node.title,node.kind==='approval'?node.onApprove:node.next,pageCode,catalog!.taskPages,node.kind==='approval'?node.onReject:undefined);patch({taskPageCode:pageCode,fieldPolicy:'fieldPolicy' in standard?standard.fieldPolicy:undefined,administration:'administration' in standard?standard.administration:undefined,allowedOperations:'allowedOperations' in standard?standard.allowedOperations:undefined,requiredOperations:'requiredOperations' in standard?standard.requiredOperations:undefined,operationPolicy:'operationPolicy' in standard?standard.operationPolicy:undefined});}} /> : null}<p>页面内容与可编辑字段上限来自应用发布的页面；没有任务表单时使用标准只读详情，不提供表单保存。</p></> }] : []),
          { key: 'advanced', label: human ? '人员规则与流转路径' : '节点配置', children: <><label>节点名称<Input disabled={disabled} value={node.title || ''} onChange={event => patch({ title: event.target.value })} /></label>
        {(node.kind === 'approval' || node.kind === 'handle') && <><label>{node.kind === "handle" ? "办理完成后" : "通过后"}<Select disabled={disabled} value={node.kind === "handle" ? node.next : node.onApprove} options={targets} onChange={target => patch(node.kind === "handle" ? { next: target } : { onApprove: target })} /></label>{node.kind === "approval" && <label>拒绝后<Select disabled={disabled} value={node.onReject} options={targets} onChange={onReject => patch({ onReject })} /></label>}</>}
         {node.kind === 'action' && isWorkflowPlatformNotify(node) && <WorkflowNotificationEditor node={node} variables={variables} roles={configurations?.principals.roles || []} users={configurations?.principals.users || []} disabled={disabled} onChange={patch} />}


        {'next' in node && <label>完成后<Select disabled={disabled} value={node.next} options={targets} onChange={next => patch({ next })} /></label>}
        {'taskPageCode' in node && <p>本节点页面：{definition.taskPages?.[node.taskPageCode || '']?.title || '按应用页面规则填写' || '标准审批页面'}</p>}
        {!['end','correction','join'].includes(node.kind) && <Popconfirm title={node.kind === 'parallel' ? '删除并行区域及其中的所有节点？' : '删除节点并连接后续路径？'} onConfirm={() => { if (!inspectorReady()) return; try { const next = editWorkflowDesignerDefinition(definition,{ type: 'remove',nodeId: node.id,...(node.kind === 'condition' ? { reconnectTo: node.otherwise } : {}) });mutate(next);setSelected(next.startAt); } catch { message.error('此节点有多个出口，请先选择明确的后续节点。'); } }}><Button danger disabled={disabled}>删除节点</Button></Popconfirm>}
</> },
        ]} />
      </section>
    </> : <p>发起后按流程结构进入第一个节点。</p>}
  </div>;
  const diagnostic = (error: string) => {
    const [code,nodeId] = error.split(':'); const title = nodeId ? definition.nodes[nodeId]?.title || '节点' : '流程';
    const messages: Record<string,string> = { WORKFLOW_DESIGNER_CYCLE: '后续路径形成循环', WORKFLOW_DESIGNER_TARGET_MISSING: '后续节点不存在', WORKFLOW_DESIGNER_UNREACHABLE: '尚未连接到流程', WORKFLOW_DESIGNER_CONDITION_TYPE: '条件变量与比较值类型不一致', WORKFLOW_DESIGNER_VARIABLE_UNKNOWN: '条件变量来源无法确认', WORKFLOW_DESIGNER_CONDITION_BOOLEAN: '条件需要产生满足或不满足的判断', WORKFLOW_DESIGNER_BRANCH_LIMIT: '条件分支数量超出限制' };
    return `${title}：${messages[code || ''] || '配置需要调整'}`;
  };
  return <section className="oxa-workflow-designer" aria-label="流程设计器"><header className="oxa-designer-toolbar">
      <div className="oxa-designer-toolbar-identity"><Tooltip title="返回流程图"><Button icon={<ArrowLeftOutlined />} aria-label="返回流程图" disabled={busy || unknown || assistantState.busy || liveState.busy} onClick={goBack} /></Tooltip><span className="oxa-designer-toolbar-label">流程设计</span><strong>{definition.title}</strong><Tag color="blue">{draft.environmentKey === 'production' ? '正式环境' : '测试环境'}</Tag>
        <Segmented aria-label="流程设计查看版本" value={publishedView ? 'published' : 'draft'} onChange={switchVersion} options={[{ value: 'published',label: `已发布 v${draft.definitionVersion}` },{ value: 'draft',label: '草稿' }]} />
        <span className="oxa-designer-save-state">{busy && frozenSave.current ? '正在保存…' : dirty ? errors.length ? '修改待检查' : '草稿未保存' : `${draft.updatedAt ? '草稿已自动保存' : '草稿与已发布版本一致'}${draft.updatedAt ? ` ${new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}</span>
        {(frozenSave.current || dirty && error) && <Button type="link" disabled={!canEdit || authorityStopped.current || busy} onClick={() => void save()}>{frozenSave.current ? '重试原保存请求' : '重试保存'}</Button>}
      </div>
      <Space size={8} className="oxa-designer-toolbar-actions"><Tooltip title="撤销"><Button icon={<UndoOutlined />} aria-label="撤销" disabled={disabled || stepInputInvalid || reminderDirty || !history.length} onClick={() => { const previous = history.at(-1); if (previous) { setFuture(current => [...current,{definition,binding:binding!}]);setHistory(current => current.slice(0,-1));setDefinition(previous.definition);setBinding(previous.binding); } }}>撤销</Button></Tooltip>
        <Tooltip title="重做"><Button icon={<RedoOutlined />} aria-label="重做" disabled={disabled || stepInputInvalid || reminderDirty || !future.length} onClick={() => { const next = future.at(-1); if (next) { setHistory(current => [...current,{definition,binding:binding!}]);setFuture(current => current.slice(0,-1));setDefinition(next.definition);setBinding(next.binding); } }}>重做</Button></Tooltip>
        <Button icon={<SafetyOutlined />} onClick={() => setChecksOpen(true)}>结构检查</Button><Button icon={<HistoryOutlined />} onClick={() => void showVersions()}>版本记录</Button><Button icon={<RobotOutlined />} disabled={disabled || liveState.busy || liveState.unknown} onClick={() => { const open = () => void openAssistant(); if (leaveHandling.current) leaveHandling.current(open); else open(); }}>AI 助手</Button><Button type="primary" disabled={!canPublish || authorityStopped.current || busy || publishedView || !!frozenSave.current || !!frozenPublish.current || !!frozenAux.current || stepInputInvalid || reminderDirty || errors.length > 0 || liveState.dirty || liveState.busy || liveState.unknown} onClick={() => void openPublication()}>发布并启用</Button>
      </Space>
    </header>
    {error && <Alert type="error" title={error} action={frozenSave.current ? <Button onClick={() => void save()}>重试保存</Button> : frozenAux.current ? <Button onClick={() => void retryAux()}>重试原操作</Button> : undefined} />}
    {authorityNotice && <Alert type="warning" title={authorityNotice} />}{retained}
    {receipt && <><Alert type={receipt.counts.failed || receipt.counts.excepted ? 'warning' : 'success'} title={`已发布 v${receipt.definitionVersion} · ${receipt.status === 'running' ? '正在更新进行中的申请' : '更新处理结束'}`} description={Object.entries(receipt.counts).map(([key,count]) => `${outcomeLabels[key] || key} ${count}`).join(' · ')} action={<Space>{receipt.status === 'running' && <Button disabled={busy} onClick={() => void control('pause')}>暂停更新</Button>}{receipt.status === 'paused' && <Button disabled={busy} onClick={() => void control('resume')}>继续更新</Button>}{!!receipt.counts.failed && <Button disabled={busy} onClick={() => void control('retry_failed')}>重试失败的申请</Button>}</Space>} />{receipt.items?.length ? <details><summary>查看申请更新记录</summary><Table size="small" rowKey="instanceId" dataSource={receipt.items} pagination={{ pageSize: 5 }} columns={[{ title: '申请',dataIndex: 'business_key' },{ title: '结果',render: (_,item) => outcomeLabels[item.outcome] || item.outcome },{ title: '原因',dataIndex: 'reason' }]} />{receipt.items.some(item => item.outcome === 'held') && <div style={{ padding: 12 }}><label>解除原版本保留<Select mode="multiple" style={{ width: '100%' }} value={releaseIds} disabled={busy || !!frozenAux.current} options={receipt.items.filter(item => item.outcome === 'held').map(item => ({ value: item.instanceId,label: item.business_key }))} onChange={setReleaseIds} /></label><Input aria-label="解除保留说明" maxLength={1000} value={releaseReason} disabled={busy || !!frozenAux.current} onChange={event => setReleaseReason(event.target.value)} placeholder="说明为什么将这些申请更新到当前版本" /><Button disabled={busy || !!frozenAux.current || !releaseIds.length || !releaseReason.trim()} onClick={() => void releaseHolds()}>解除保留并更新</Button></div>}</details> : null}</>}
    <div className={`oxa-designer-workspace ${outline ? '' : 'without-outline'} ${inspector ? '' : 'without-inspector'} ${detailInspector ? 'detail-inspector' : ''}`}>
      <aside className="oxa-designer-outline" aria-label="流程大纲"><div className="oxa-designer-outline-heading">{outline && <strong>流程大纲</strong>}<Button type="text" icon={outline ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />} aria-label={outline ? '收起流程大纲' : '展开流程大纲'} onClick={() => { const toggle = () => { if (!outline) setDetailInspector(false);setOutline(value => !value); };if (!outline && leaveHandling.current) leaveHandling.current(toggle); else toggle(); }} /></div>
        {outline && <Input.Search size="small" aria-label="搜索流程节点" placeholder="搜索节点" value={outlineKeyword} allowClear onChange={event => setOutlineKeyword(event.target.value)} />}
        <nav>{outlineNodes.filter(item => !outlineKeyword || item.title.includes(outlineKeyword)).map(item => {
          const Icon = item.presentation === 'notification' ? BellOutlined : typeIcons[item.kind as keyof typeof typeIcons] || CodeOutlined;
          return <Tooltip key={item.id} title={!outline ? item.title : undefined} placement="right"><button type="button" className={`kind-${item.kind}`} aria-label={item.title} aria-pressed={item.edgeId ? selectedEdge === item.edgeId : selected === item.nodeId} style={outline && item.depth ? { paddingLeft: 14+item.depth*16 } : undefined} onClick={() => item.edgeId ? selectEdge(item.edgeId) : selectNode(item.nodeId)}><Icon />{outline && <span>{item.title}</span>}</button></Tooltip>;
        })}</nav>
        {outline && <footer><strong>检查结果</strong><button type="button" onClick={() => setChecksOpen(true)}><CheckCircleOutlined /> {errors.length ? `发现 ${errors.length} 项问题` : '未发现问题'}</button></footer>}
      </aside>
      <main><div className="oxa-designer-banner">{publishedView ? `正在查看已发布 v${draft.definitionVersion}` : canEdit ? '正在编辑草稿' : '正在审阅草稿'} · 发布并启用时可更新进行中的申请</div>
        <WorkflowDiagram graph={displayGraph!} summaries={summaries} selectedNodeId={selected} selectedEdgeId={selectedEdge} onSelectEdge={selectEdge} onSelectNode={selectNode} presentation="designer"
          insertionOptions={[{value:'approval',label:'审批',kind:'approval'},{value:'handle',label:'办理',kind:'handle'},{value:'cc',label:'抄送',kind:'cc'},...(variables.length?[{value:'condition',label:'条件分支',kind:'condition'}]:[]),{value:'parallel',label:'并行分支',kind:'parallel'},{value:'action',label:'业务步骤',kind:'action'},{value:'platform_notify',label:'发送通知',kind:'notification'}] }
          onInsertEdge={disabled || stepInputInvalid || reminderDirty ? undefined : (value, chosenTemplate) => { const open = () => { if (chosenTemplate) { const title = chosenTemplate === 'parallel' ? '并行分支' : chosenTemplate === 'condition' ? '条件分支' : chosenTemplate === 'platform_notify' ? '发送通知' : kinds[chosenTemplate] || draft.publishedDefinition.nodes[chosenTemplate]?.title || '新增节点';insertNode(chosenTemplate,title,value); } else { setInsert(value);setNodeTitle('');setTemplate('approval'); } };if (leaveHandling.current) leaveHandling.current(open); else open(); }} />
        {!inspector && <Button className="oxa-designer-show-inspector" onClick={() => setInspector(true)}>节点设置</Button>}
        <Button className="oxa-designer-mobile-inspector" onClick={() => setInspector(true)}>编辑 {node?.title || '节点'}</Button>
      </main>
      {inspector && narrow && <button type="button" className="oxa-designer-inspector-backdrop" aria-label="关闭节点设置" onClick={closeInspector} />}
      <aside style={{ display: inspector ? undefined : 'none' }} ref={inspectorElement} className="oxa-designer-desktop-inspector" role={narrow ? 'dialog' : undefined} aria-modal={narrow ? true : undefined} aria-label={assistantOpen ? 'AI 助手' : '节点设置'}><div hidden={assistantOpen}>{panel}</div><WorkflowDesignerAssistant presentation="panel" workflowCode={workflowCode} draft={draft} context={assistantContext} open={assistantOpen && canEdit} canApply={canEdit && !authorityStopped.current && !dirty && !busy && !liveState.dirty && !liveState.busy && !liveState.unknown && !frozenSave.current && !frozenPublish.current && !frozenAux.current} onClose={() => setAssistantOpen(false)} onApplied={value => { setPublishedView(false);setDraft(value);setDefinition(value.definition);setBinding(value.binding);setHistory(current => { const snapshots = [...current,{definition,binding:binding!}].slice(-25);while (snapshots.length > 1 && snapshots.reduce((bytes,item) => bytes + JSON.stringify(item).length,0) > 4 * 1024 * 1024) snapshots.shift();return snapshots; });setFuture([]);setError(undefined); }} onStateChange={setAssistantState} onAuthorityLoss={loseAuthority} /></aside>
    </div>
    <Drawer open={checksOpen} title="流程结构检查" width={440} onClose={() => setChecksOpen(false)}><Alert showIcon type={errors.length ? 'warning' : 'success'} title={errors.length ? `发现 ${errors.length} 项待修正的问题` : '未发现结构问题'} description={errors.length ? errors.map(diagnostic).join('；') : '节点与流转路径已通过结构校验。发布时还会检查当前应用的人员规则、页面和业务步骤。'} /></Drawer>
    <Modal open={!!insert} title="新增节点" onCancel={() => setInsert(undefined)} onOk={() => insertNode()} okText="添加" okButtonProps={{ disabled: !nodeTitle.trim() || !template }}><p>新增空白节点后自行配置人员、按钮和提醒。业务步骤使用应用已发布的能力。</p><label>节点类型<Select style={{ width: '100%' }} value={template} onChange={setTemplate} options={[{value:'approval',label:'审批（空白）'},{value:'handle',label:'办理（空白）'},{value:'cc',label:'抄送（空白）'},{value:'action',label:'已发布业务步骤'},{ value: 'parallel',label: '并行分支' },{ value: 'platform_notify', label: '发送通知' },...(variables.length ? [{ value: 'condition',label: '条件分支' }] : []),...Object.values(draft.publishedDefinition.nodes).filter(node => ['approval','handle','cc','action'].includes(node.kind)).map(node => ({ value: node.id,label: `复制已有配置 · ${node.title}` }))]} /></label><label>节点名称<Input value={nodeTitle} onChange={event => setNodeTitle(event.target.value)} /></label></Modal>
    <Drawer open={versionsOpen} title="流程版本记录" width={620} onClose={() => setVersionsOpen(false)}><Table loading={busy} rowKey="publicationId" dataSource={versions} pagination={{ pageSize: 10 }} columns={[{ title: '版本',render: (_,item) => `v${item.definitionVersion}` },{ title: '说明',dataIndex: 'reason' },{ title: '发布时间',dataIndex: 'createdAt',render: value => new Date(value).toLocaleString() },{ title: '操作',render: (_,item) => <Popconfirm title="将该版本恢复到共享草稿？" description="当前草稿将被替换；发布后才会生效。" onConfirm={() => void restore(item.definitionVersion)}><Button disabled={!canEdit || authorityStopped.current || busy || dirty || liveState.dirty || liveState.busy || liveState.unknown || !!frozenSave.current || !!frozenPublish.current || !!frozenAux.current}>恢复到草稿</Button></Popconfirm> }]} /></Drawer>
    <Modal open={publication} title="发布并启用" width={648} className="oxa-designer-publish-modal" cancelText="继续编辑"
      onCancel={() => { if (!frozenPublish.current) setPublication(false); }} onOk={() => void publish()} confirmLoading={busy}
      okText={frozenPublish.current ? '重试原发布请求' : '发布并启用'}
      okButtonProps={{ disabled: !canPublish || authorityStopped.current || !reason.trim() || scope === 'running_and_new' && (holdIds.length > 0 || holdNodeIds.length > 0) && !holdReason.trim() || !preview || preview.truncated || scope === 'running_and_new' && !!preview.counts.excepted && !acknowledge }}>
      <p>将当前草稿发布到{draft.environmentKey === 'production' ? '正式环境' : '测试环境'}。检查通过后立即生效。</p>
      <Spin spinning={busy}>
        <div className="oxa-designer-publish-checks"><CheckCircleOutlined /><span>{preview ? '流程与应用能力检查已完成' : '正在检查流程与应用能力'}</span></div>
        <fieldset disabled={busy || !!frozenPublish.current}>
          <h3>生效范围</h3>
          <Radio.Group value={scope} disabled={busy || !!frozenPublish.current} onChange={event => setScope(event.target.value)} className="oxa-designer-publish-scope">
            <Radio value="running_and_new"><strong>进行中的申请和新发起的申请都使用新版本<Tag color="blue">默认</Tag></strong><small>已进入的任务保留原有人选、按钮和页面，后续流转使用新版本。</small></Radio>
            <Radio value="new_only"><strong>仅新发起的申请使用新版本</strong><small>进行中的申请继续按原版本办理。</small></Radio>
          </Radio.Group>
          {scope === 'running_and_new' && <details className="oxa-designer-publish-holds"><summary>指定保留在原版本的申请{(holdIds.length > 0 || holdNodeIds.length > 0) && <Tag>已指定</Tag>}</summary>
            <label>保留原版本的申请<Select mode="multiple" showSearch filterOption={false} onSearch={keyword => void searchHolds(keyword)} disabled={busy || !!frozenPublish.current} value={holdIds} onChange={value => { setHoldIds(value);setPreview(undefined); }} options={holdCandidates.map(item => ({ value: item.instanceId,label: `${item.businessKey} · ${item.nodeTitle}` }))} /></label>
            <label>保留当前停在这些节点的申请<Select mode="multiple" disabled={busy || !!frozenPublish.current} value={holdNodeIds} options={Object.values(definition.nodes).filter(node => ['approval','handle','correction','action'].includes(node.kind)).map(node => ({ value: node.id,label: node.title || '流程节点' }))} onChange={value => { setHoldNodeIds(value);setPreview(undefined); }} /></label>
            {(holdIds.length > 0 || holdNodeIds.length > 0) && <label>保留原因<Input disabled={busy || !!frozenPublish.current} value={holdReason} maxLength={1000} onChange={event => setHoldReason(event.target.value)} /></label>}
            <Button disabled={busy || !!frozenPublish.current} onClick={() => void check()}>重新检查影响</Button>
          </details>}
          {preview && scope === 'running_and_new' && <><h3>进行中的申请</h3><dl className="oxa-designer-publish-counts">{Object.entries(preview.counts).map(([key,count]) => <div key={key} className={`outcome-${key}`}><dt>{outcomeLabels[key] || key}</dt><dd>{count}</dd></div>)}</dl>
            {preview.items.some(item => item.outcome !== 'eligible') && <details className="oxa-designer-publish-exceptions"><summary>查看需单独处理的申请</summary><Table size="small" rowKey="instanceId" dataSource={preview.items.filter(item => item.outcome !== 'eligible')} pagination={{ pageSize: 5 }} columns={[{ title: '申请',dataIndex: 'businessKey' },{ title: '处理',render: (_,item) => outcomeLabels[item.outcome] },{ title: '原因',dataIndex: 'reason' }]} /></details>}
            {!!preview.counts.excepted && <Checkbox disabled={!!frozenPublish.current || busy} checked={acknowledge} onChange={event => setAcknowledge(event.target.checked)}>我已了解不能更新的申请将保留原版本，并在更新记录中单独列出。</Checkbox>}</>}
          {scope === 'new_only' && <p>新发起的申请使用此版本，进行中的申请保持当前版本。</p>}
          <label className="oxa-designer-publish-reason">版本说明<Input aria-label="流程版本说明" disabled={busy || !!frozenPublish.current} value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} placeholder="说明本次流程的调整" /></label>
        </fieldset>
      </Spin>
    </Modal>
  </section>;
}
