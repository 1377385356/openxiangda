import { WorkflowReminderEditor } from './WorkflowReminderEditor.js';
import { WorkflowNotificationEditor } from './WorkflowNotificationEditor.js';
import { WorkflowReturnPolicyEditor } from './WorkflowReturnPolicyEditor.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Collapse, Drawer, Empty, Input, Modal, Popconfirm, Radio, Segmented, Select, Skeleton, Space, Spin, Table, Tag, Tooltip } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, CloseOutlined, HistoryOutlined, MenuFoldOutlined, MenuUnfoldOutlined, RedoOutlined, RobotOutlined, SafetyOutlined, UndoOutlined, UserOutlined, FormOutlined, CodeOutlined, CopyOutlined, BranchesOutlined, BellOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { formatWorkflowSupervisorChain, type WorkflowSupervisorChainParameters, isWorkflowPlatformNotify, WORKFLOW_PLATFORM_NOTIFY_HANDLER, WORKFLOW_PLATFORM_NOTIFY_INPUT_SCHEMA, WORKFLOW_PLATFORM_NOTIFY_OUTPUT_SCHEMA, editWorkflowDesignerDefinition, projectWorkflowGraph, validateWorkflowDesignerDocument, workflowDesignerVariables, type WorkflowDefinition, type WorkflowDesignerDraft, type WorkflowDesignerSave, type WorkflowDesignerPublish, type WorkflowNode, type WorkflowNodeConfigurations, type WorkflowPublicationPreview, type WorkflowPublicationReceipt } from 'openxiangda-contracts/browser';
import { OpenXiangdaPlatformRequestError, loadWorkflowDesignerDraft, loadWorkflowNodeConfigurations, loadApplicationAdministrationContext, saveWorkflowDesignerDraft, previewWorkflowDesignerPublication, publishWorkflowDesigner, loadWorkflowDesignerPublication, listWorkflowDesignerPublications, restoreWorkflowDesignerVersion, controlWorkflowDesignerPublication, searchWorkflowDesignerHoldCandidates } from '../../platform-client';
import { createBrowserUuid } from '../../uuid';
import { WorkflowDiagram } from './WorkflowDiagram';
import { workflowDesignerDisplayGraph, workflowDesignerOutlineNodes, workflowDesignerStartId } from './workflow-designer-presentation';
import { WorkflowDraftHandlingEditor } from './WorkflowDraftHandlingEditor';
import { WorkflowNodeConfigurationEditor } from './WorkflowNodeConfigurationEditor';
import { WorkflowDesignerAssistant } from './WorkflowDesignerAssistant';
import { defaultWorkflowCondition } from './WorkflowConditionEditor';
import { WorkflowConditionConfigurationEditor } from './WorkflowConditionConfigurationEditor';
const kinds: Record<string,string> = { handle: '办理节点', approval: '审批节点', condition: '条件分支', cc: '抄送', action: '已发布业务步骤', correction: '补正', end: '结束' };
const id = () => `node_${createBrowserUuid().replaceAll('-','').slice(0,12)}`;
const outcomeLabels: Record<string,string> = { eligible: '可更新', migrated: '已更新', deferred: '等待步骤完成', excepted: '需单独处理', held: '保留原版本', failed: '更新失败', completed: '已结束', superseded: '已替代' };
const refused = (error: unknown) => error instanceof OpenXiangdaPlatformRequestError && error.status >= 400 && error.status < 500;
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (left: unknown,right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

/** Canonical authoring. The graph is a projection; coordinates never become executable state. */
export function WorkflowDesigner({ workflowCode, onPublished, onDirtyChange, onStateChange, onBack }: { workflowCode: string; onBack?: () => void; onPublished?: (receipt: WorkflowPublicationReceipt) => void; onDirtyChange?: (dirty: boolean) => void; onStateChange?: (state: { dirty: boolean; busy: boolean; unknown: boolean }) => void }) {
  const { message } = App.useApp();
  const [draft,setDraft] = useState<WorkflowDesignerDraft>();
  const [definition,setDefinition] = useState<WorkflowDefinition>();
  const [nativeHeadRevision,setNativeHeadRevision] = useState<number>();
  const [configurations,setConfigurations] = useState<WorkflowNodeConfigurations>();
  const [selected,setSelected] = useState('');
  const [selectedEdge,setSelectedEdge] = useState<string>();
  const [publishedView,setPublishedView] = useState(false);
  const [outline,setOutline] = useState(true);
  const [detailInspector,setDetailInspector] = useState(false);
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
  const attemptedAutosave = useRef<WorkflowDefinition | undefined>(undefined);
  const [error,setError] = useState<string>();
  const [busy,setBusy] = useState(false);
  const [history,setHistory] = useState<WorkflowDefinition[]>([]);
  const [future,setFuture] = useState<WorkflowDefinition[]>([]);
  const [insert,setInsert] = useState<string>();
  const [template,setTemplate] = useState('condition');
  const [nodeTitle,setNodeTitle] = useState('');
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
  const frozenSave = useRef<WorkflowDesignerSave | undefined>(undefined);
  const frozenPublish = useRef<WorkflowDesignerPublish | undefined>(undefined);
  const frozenAux = useRef<(() => Promise<void>) | undefined>(undefined);
  const alive = useRef(true);
  const load = useCallback(async () => {
    const [value,configuration,context] = await Promise.all([loadWorkflowDesignerDraft(workflowCode),loadWorkflowNodeConfigurations(workflowCode),loadApplicationAdministrationContext()]);
    if (context.headRevision == null) throw new Error('当前应用没有可用的办理配置版本');
    if (!alive.current) return;
    setDraft(value);setDefinition(value.definition);setConfigurations(configuration);setNativeHeadRevision(context.headRevision);setSelected(value.definition.startAt);setHistory([]);setFuture([]);setError(undefined);
  },[workflowCode]);
  useEffect(() => { alive.current = true; void load().catch(error => setError(String(error.message))); return () => { alive.current = false; }; },[load]);
  const refreshHandling = async () => {
    const [configuration,context] = await Promise.all([loadWorkflowNodeConfigurations(workflowCode),loadApplicationAdministrationContext()]);
    if (context.headRevision == null) throw new Error('当前应用没有可用的办理配置版本');
    setConfigurations(configuration);setNativeHeadRevision(context.headRevision);
  };
  const dirty = !!draft && !!definition && !same(draft.definition,definition);
  useEffect(() => { const unknown = !!frozenSave.current || !!frozenPublish.current || !!frozenAux.current || assistantState.unknown || liveState.unknown;onDirtyChange?.(dirty || liveState.dirty || unknown);onStateChange?.({ dirty: dirty || liveState.dirty,busy: busy || assistantState.busy || liveState.busy,unknown }); },[dirty,busy,assistantState,liveState,onDirtyChange,onStateChange]);
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (dirty || frozenSave.current || frozenPublish.current || frozenAux.current || assistantState.unknown) { event.preventDefault(); event.returnValue = ''; } }; addEventListener('beforeunload',guard);return () => removeEventListener('beforeunload',guard); },[dirty,assistantState.unknown]);
  useEffect(() => {
    if (!receipt || receipt.status !== 'running' || publication) return;
    let active = true;
    const poll = setInterval(() => { void loadWorkflowDesignerPublication(workflowCode,receipt.publicationId).then(value => { if (active) setReceipt(value); },() => {}); },3000);
    return () => { active = false;clearInterval(poll); };
  },[workflowCode,receipt?.publicationId,receipt?.status,publication]);
  const shown = publishedView ? draft?.publishedDefinition : definition;
  const graph = useMemo(() => shown ? projectWorkflowGraph(shown,'draft') : undefined,[shown]);
  const displayGraph = useMemo(() => graph ? workflowDesignerDisplayGraph(graph, structureKeys.includes('return') ? selected : undefined) : undefined, [graph, structureKeys, selected]);
  const outlineNodes = useMemo(() => displayGraph ? workflowDesignerOutlineNodes(displayGraph) : [], [displayGraph]);
  useEffect(() => { if (shown && selected !== workflowDesignerStartId && !shown.nodes[selected]) setSelected(shown.startAt); }, [shown, selected]);
  const variables = useMemo(() => definition ? workflowDesignerVariables(definition) : [],[definition]);
  const errors = useMemo(() => definition ? validateWorkflowDesignerDocument(definition) : [],[definition]);
  const node = shown?.nodes[selected];
  const liveNode = configurations?.nodes.find(item => item.nodeId === selected);
  const disabled = busy || assistantState.busy || assistantState.unknown || publishedView || !!frozenSave.current || !!frozenPublish.current || !!frozenAux.current;
  const mutate = (next: WorkflowDefinition) => {
    if (!definition || disabled) return;
    setHistory(current => {
      const bounded = [...current,definition].slice(-25);
      while (bounded.length > 1 && bounded.reduce((bytes,item) => bytes + JSON.stringify(item).length,0) > 4 * 1024 * 1024) bounded.shift();
      return bounded;
    });setFuture([]);setDefinition(next);setError(undefined);
  };
  const patch = (patch: Record<string,unknown>) => { if (definition && node) mutate(editWorkflowDesignerDefinition(definition,{ type: 'node',nodeId: node.id,patch })); };
  const save = async (quiet = false) => {
    if (!draft || !definition) return undefined;
    setBusy(true);
    try {
      frozenSave.current ||= { expectedRevision: draft.revision,expectedHeadRevision: draft.baseHeadRevision,operationId: createBrowserUuid(),definition,binding: draft.binding };
      const saved = await saveWorkflowDesignerDraft(workflowCode,frozenSave.current);
      frozenSave.current = undefined;setDraft(saved);setDefinition(saved.definition);setError(undefined);if (!quiet) message.success('流程草稿已保存');return saved;
    } catch (error) { if (refused(error)) frozenSave.current = undefined;setError(`${String((error as Error).message)}${refused(error) ? '。修改已保留，可修正后再次保存。' : '。结果待确认，请重试原保存请求。'}`);return undefined; }
    finally { setBusy(false); }
  };
  const autosave = useRef(save); autosave.current = save;
  useEffect(() => {
    if (!dirty || !definition || busy || publishedView || errors.length || frozenSave.current || frozenPublish.current || frozenAux.current || attemptedAutosave.current === definition) return;
    const timer = setTimeout(() => { attemptedAutosave.current = definition; void autosave.current(true); }, 900);
    return () => clearTimeout(timer);
  }, [dirty, definition, busy, publishedView, errors.length]);
  const selectNode = (value: string) => {
    const next = () => { setSelected(value); if (value !== selected) setStructureKeys([]); setInspector(value !== workflowDesignerStartId); };
    if (value !== selected && leaveHandling.current) leaveHandling.current(next); else next();
  };
  useEffect(() => {
    if (!narrow || !inspector) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = inspectorElement.current;
    const keydown = (event: KeyboardEvent) => {
      if (!element || !element.contains(event.target as Node) || event.defaultPrevented) return;
      if (event.key === 'Escape' && ![...element.querySelectorAll('[aria-expanded="true"]')].some(item => item.getClientRects().length)) {
        event.preventDefault();const close = () => setInspector(false); if (leaveHandling.current) leaveHandling.current(close); else close();
      }
      if (event.key === 'Tab') {
        const focusable = [...element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(item => item.getClientRects().length);
        const target = event.shiftKey && document.activeElement === focusable[0] ? focusable.at(-1) : !event.shiftKey && document.activeElement === focusable.at(-1) ? focusable[0] : undefined;
        if (target) { event.preventDefault();target.focus(); }
      }
    };
    element?.querySelector<HTMLElement>('button')?.focus();document.addEventListener('keydown',keydown);
    return () => { document.removeEventListener('keydown',keydown); previous?.focus({preventScroll:true}); };
  }, [narrow, inspector]);
  const switchVersion = (value: string | number) => {
    const next = () => { setPublishedView(value === 'published'); };
    if (leaveHandling.current) leaveHandling.current(next); else next();
  };
  const goBack = () => {
    const next = () => { if (dirty) { void save(true).then(saved => { if (saved) { if (onBack) onBack(); else { const url = new URL(location.href);url.searchParams.delete('design');location.assign(url.href); } } });return; } if (onBack) onBack(); else { const url = new URL(location.href); url.searchParams.delete('design'); location.assign(url.href); } };
    if (leaveHandling.current) leaveHandling.current(next); else next();
  };
  const holds = () => holdIds.length || holdNodeIds.length ? [{ instanceIds: holdIds,nodeIds: holdNodeIds,reason: holdReason.trim() }] : [];
  const check = async (value: WorkflowDesignerDraft = draft!, selectedHolds = holds()) => {
    if (!value) return;
    setBusy(true);setPreview(undefined);
    try { const result = await previewWorkflowDesignerPublication(workflowCode,{ expectedRevision: value.revision,holds: selectedHolds });setPreview(result);setHoldCandidates(result.items);setError(undefined); }
    catch (error) { setError(String((error as Error).message)); } finally { setBusy(false); }
  };
  const openPublication = async () => {
    const saved = dirty || frozenSave.current ? await save() : draft;
    if (!saved) return;setScope('running_and_new');setHoldIds([]);setHoldNodeIds([]);setHoldReason('');setReason('');setAcknowledge(false);setPublication(true);setPreview(undefined);
    await check(saved,[]);
  };
  const publish = async () => {
    if (!draft || !reason.trim() || scope === 'running_and_new' && (holdIds.length || holdNodeIds.length) && !holdReason.trim()) return;
    setBusy(true);
    try {
      frozenPublish.current ||= { expectedRevision: draft.revision,expectedHeadRevision: draft.baseHeadRevision,operationId: createBrowserUuid(),reason: reason.trim(),scope,holds: scope === 'running_and_new' ? holds() : [],acknowledgeExceptions: acknowledge };
      const result = await publishWorkflowDesigner(workflowCode,frozenPublish.current);
      frozenPublish.current = undefined;setReceipt(result);setPublication(false);await load();onPublished?.(result);message.success('流程版本已发布并启用');
    } catch (error) { if (refused(error)) frozenPublish.current = undefined;setError(`${String((error as Error).message)}${refused(error) ? '。草稿已保留。' : '。结果待确认，重试将使用原发布请求。'}`); } finally { setBusy(false); }
  };
  const openAssistant = async () => {
    if (disabled) return;
    if (dirty || frozenSave.current) { const saved = await save();if (!saved) return; }
    setInspector(true);setAssistantOpen(true);
  };
  const showVersions = async () => {
    setVersionsOpen(true);setBusy(true);
    try { setVersions(await listWorkflowDesignerPublications(workflowCode)); } catch (error) { setError(String((error as Error).message)); } finally { setBusy(false); }
  };
  const retryAux = async () => {
    if (!frozenAux.current) return;setBusy(true);
    try { await frozenAux.current();frozenAux.current = undefined;setError(undefined); }
    catch (error) { if (refused(error)) frozenAux.current = undefined;setError(`${String((error as Error).message)}${refused(error) ? '。输入已保留。' : '。结果待确认，请重试原操作。'}`); }
    finally { setBusy(false); }
  };
  const restore = async (version: number) => {
    if (!draft || frozenAux.current) return;
    const input = { version,expectedRevision: draft.revision,expectedHeadRevision: draft.baseHeadRevision,operationId: createBrowserUuid() };
    frozenAux.current = async () => {
      const restored = await restoreWorkflowDesignerVersion(workflowCode,input);
      setDraft(restored);setDefinition(restored.definition);setHistory([]);setFuture([]);setVersionsOpen(false);message.success('历史版本已恢复到草稿，检查后可发布');
    };await retryAux();
  };
  const control = async (action: 'pause'|'resume'|'retry_failed') => {
    if (!receipt || !draft || frozenAux.current) return;
    const publicationId = receipt.publicationId;
    const input = { expectedHeadRevision: draft.baseHeadRevision,operationId: createBrowserUuid(),action,reason: action === 'pause' ? '管理员暂停更新' : action === 'retry_failed' ? '管理员重试更新失败的申请' : '管理员继续更新' };
    frozenAux.current = async () => { setReceipt(await controlWorkflowDesignerPublication(workflowCode,publicationId,input)); };await retryAux();
  };
  const searchHolds = async (keyword: string) => {
    try { setHoldCandidates(await searchWorkflowDesignerHoldCandidates(workflowCode,keyword)); }
    catch (error) { setError(String((error as Error).message)); }
  };
  const releaseHolds = async () => {
    if (!receipt || !draft || !releaseIds.length || !releaseReason.trim() || frozenAux.current) return;
    const publicationId = receipt.publicationId;
    const input = { expectedHeadRevision: draft.baseHeadRevision,operationId: createBrowserUuid(),action: 'release_holds' as const,instanceIds: releaseIds,reason: releaseReason.trim() };
    frozenAux.current = async () => { setReceipt(await controlWorkflowDesignerPublication(workflowCode,publicationId,input));setReleaseIds([]);setReleaseReason(''); };await retryAux();
  };
  const insertNode = (chosenTemplate = template, chosenTitle = nodeTitle, edgeId = insert) => {
    const edge = displayGraph?.edges.find(item => item.id === edgeId);
    if (!edge || !definition || !chosenTitle.trim()) return;
    const nodeId = id();
    let next: WorkflowNode;
    if (chosenTemplate === 'condition') next = { id: nodeId,kind: 'condition',title: chosenTitle.trim(),branches: [{ label: '条件 1',when: defaultWorkflowCondition(variables),target: edge.to }],otherwise: edge.to };
    else if (chosenTemplate === 'platform_notify') next = { id: nodeId, kind: 'action', title: chosenTitle.trim(), next: edge.to,
      handler: { code: WORKFLOW_PLATFORM_NOTIFY_HANDLER, version: 1, mode: 'reconciled-effect' },
      inputSchema: structuredClone(WORKFLOW_PLATFORM_NOTIFY_INPUT_SCHEMA), outputSchema: structuredClone(WORKFLOW_PLATFORM_NOTIFY_OUTPUT_SCHEMA),
      inputs: { text: { source: 'literal', value: '请关注此申请的最新进展。' } }, notification: { template: 'workflow_message', recipients: { provider: 'initiator' } } };
    else {
      const source = draft?.publishedDefinition.nodes[chosenTemplate];
      if (!source || !['approval','handle','cc','action'].includes(source.kind)) return;
      next = { ...structuredClone(source),id: nodeId,title: chosenTitle.trim() };
      if (next.kind === 'approval') next.onApprove = edge.to;
      else if ('next' in next) next.next = edge.to;
    }
    try {
      mutate(edge.from === workflowDesignerStartId ? { ...definition, startAt: next.id, nodes: { ...definition.nodes, [next.id]: next } } : editWorkflowDesignerDefinition(definition,{ type: 'insert',from: edge.from,target: edge.to,node: next,edge: edge.kind === 'branch' ? (edge.priority || 1) - 1 : edge.kind === 'default' ? 'default' : edge.kind as 'approve'|'reject'|'next' }));
      setSelected(nodeId);setInspector(true);setStructureKeys(next.kind === 'condition' ? [] : ['advanced']);setInsert(undefined);
    } catch (error) { setError(String((error as Error).message)); }
  };
  if (!draft || !definition || !graph || nativeHeadRevision == null) return error ? <Alert type="error" title="流程设计未能载入" description={error} action={<Button onClick={() => void load().catch(error => setError(String(error.message)))}>重新载入</Button>} /> : <Skeleton active />;
  const targets = Object.values(definition.nodes).filter(item => item.id !== selected).map(item => ({ value: item.id,label: item.title || item.id }));
  const typeIcons = { approval: UserOutlined, handle: FormOutlined, condition: BranchesOutlined, action: CodeOutlined, cc: CopyOutlined, correction: FormOutlined, end: CheckCircleOutlined, start: PlayCircleOutlined };
  const NodeIcon = isWorkflowPlatformNotify(node) ? BellOutlined : typeIcons[node?.kind as keyof typeof typeIcons] || CodeOutlined;
  const summaries = Object.fromEntries((configurations?.nodes || []).map(item => {
    const binding = item.effective.binding;
    const source = binding?.provider === 'fixed_users' ? `指定成员：${(binding.users || []).map(user => configurations?.principals.users.find(person => person.value === user)?.label || '成员').join('、')}` : ['app_role','app_role_in_scope'].includes(binding?.provider || '') ? `应用角色：${(binding?.roleCodes || (binding?.roleCode ? [binding.roleCode] : [])).map(code => configurations?.principals.roles.find(role => role.code === code)?.name || '已配置角色').join('、')}` : binding?.provider === 'supervisor_chain' ? formatWorkflowSupervisorChain(binding as WorkflowSupervisorChainParameters) : '按已配置的人员规则';
    const mode = ({ single: '单人', any: '或签', all: '会签', sequence: '依次审批' } as Record<string,string>)[item.effective.mode || ''] || '';
    return [item.nodeId, `${mode}${mode ? ' · ' : ''}${source}`];
  }));
  const human = node?.kind === 'approval' || node?.kind === 'handle';
  const panel = <div className="oxa-workflow-designer-inspector">
    <header><span className={`oxa-designer-inspector-icon kind-${node?.kind || 'start'}`}><NodeIcon /></span><h2>{node?.title || '流程发起'}</h2><Tag>{isWorkflowPlatformNotify(node) ? '通知节点' : kinds[node?.kind || ''] || '发起'}</Tag><Button type="text" icon={<CloseOutlined />} aria-label="关闭节点设置" onClick={() => { const close = () => setInspector(false); if (leaveHandling.current) leaveHandling.current(close); else close(); }} /></header>
    {node ? <>
      <div hidden={human && structureKeys.includes('return')}>{liveNode && configurations && ['approval','handle','cc'].includes(node.kind) ? <WorkflowNodeConfigurationEditor
        key={`${liveNode.nodeId}:${liveNode.configuration.revision}`} workflowCode={workflowCode} node={liveNode} principals={configurations.principals}
        expectedHeadRevision={nativeHeadRevision} presentation="inline" readOnly={publishedView} compact={!detailInspector && !narrow} onExpand={() => { setDetailInspector(true);setOutline(false); }}
        onClose={() => setInspector(false)} onStateChange={handlingStateChanged} onLeaveGuardChange={handlingGuardChanged}
        returnSummary={human && (node.returnPolicy?.targets || node.returnTargets || []).length ? <div><Tag color="gold">随草稿发布</Tag><div>{(node.returnPolicy?.targets || (node.returnTargets || []).map(nodeId => ({ nodeId, defaultRoute: 'replay' }))).map(target => <p key={target.nodeId}>{definition.nodes[target.nodeId]?.title || '退回目标'} · {target.defaultRoute === 'resume' ? '重新提交后直接回到本节点' : '重新提交后重新按流程流转'}</p>)}</div><Button type="link" size="small" onClick={() => setStructureKeys(['return'])}>编辑退回设置</Button></div> : undefined}
        onSaved={() => { void refreshHandling().catch(failure => setError(`办理设置已保存，重新读取失败：${String(failure.message)}`)); }} />  : human && <WorkflowDraftHandlingEditor node={node} baseline={Object.values(draft.publishedDefinition.nodes).find(source => source.kind === node.kind && 'taskPageCode' in source && source.taskPageCode === node.taskPageCode && 'binding' in source && source.binding === node.binding) as typeof node || node} bindingOptions={Object.keys(draft.publishedBinding.bindings).map(value => ({value,label:`${Object.values(draft.publishedDefinition.nodes).find(source => 'binding' in source && source.binding===value)?.title || '已发布节点'}的人员规则`}))} disabled={disabled} onChange={value => patch({ ...value, ...(typeof value.binding === 'string' && draft.publishedBinding.bindings[value.binding]?.provider === 'supervisor_chain' && draft.publishedBinding.bindings[value.binding]?.continuous !== false ? {mode:'sequence'} : {}) })} />}</div>
      {node.kind === 'condition' && <WorkflowConditionConfigurationEditor key={node.id} node={node} variables={variables} targets={targets} selectedBranch={graph.edges.find(edge => edge.id === selectedEdge && edge.from === node.id && edge.kind === 'branch')?.priority ? graph.edges.find(edge => edge.id === selectedEdge)!.priority! - 1 : undefined} disabled={disabled} onChange={value => patch({ branches: value.branches, otherwise: value.otherwise })} />}
      {human && structureKeys.includes('return') && <><Button type="link" className="oxa-designer-return-back" icon={<ArrowLeftOutlined />} onClick={() => setStructureKeys([])}>返回节点配置</Button><WorkflowReturnPolicyEditor definition={definition} node={node} disabled={disabled} onChange={returnPolicy => patch({ returnPolicy, returnTargets: returnPolicy.targets.map(target => target.nodeId) })} /></>}
      <section className="oxa-designer-draft-band" hidden={human && structureKeys.includes('return')}><h3>流程结构 · 随草稿发布</h3>
        <Collapse ghost activeKey={structureKeys} onChange={keys => setStructureKeys(Array.isArray(keys) ? keys : [keys])} items={[
          { key: 'name', label: '节点名称', extra: <span>{node.title || '未命名节点'}</span>, children: <label>节点名称<Input disabled={disabled} value={node.title || ''} onChange={event => patch({ title: event.target.value })} /></label> },
          ...(human ? [{ key: 'return', label: '退回设置', extra: <span>{(node.returnPolicy?.targets || node.returnTargets || []).length ? `可退回 ${(node.returnPolicy?.targets || node.returnTargets || []).length} 个节点` : '未配置退回目标'}</span>, children: null }] : []),
          ...(['approval','handle','correction'].includes(node.kind) ? [{ key: 'reminder', label: '办理提醒', extra: <span>{'reminders' in node && node.reminders ? `${node.reminders.afterSeconds >= 3600 ? `${node.reminders.afterSeconds / 3600} 小时` : `${node.reminders.afterSeconds / 60} 分钟`}后提醒` : '未设置提醒'}</span>, children: <>{['approval','handle','correction'].includes(node.kind) && <WorkflowReminderEditor rule={'reminders' in node ? node.reminders : undefined} disabled={disabled} onChange={reminders => patch({ reminders })} />}</> }] : []),
          ...('taskPageCode' in node ? [{ key: 'page', label: '本节点表单', extra: <span>{definition.taskPages?.[node.taskPageCode || '']?.title || '应用自定义页面'}</span>, children: <p>页面内容和字段规则由应用维护。办理人员只能按本节点已开放的字段填写。</p> }] : []),
          { key: 'advanced', label: human ? '人员规则与流转路径' : '节点配置', children: <><label>节点名称<Input disabled={disabled} value={node.title || ''} onChange={event => patch({ title: event.target.value })} /></label>
        {(node.kind === 'approval' || node.kind === 'handle') && <><label>人员规则<Select disabled={disabled} value={node.binding} options={Object.keys(draft.publishedBinding.bindings).map(value => ({ value,label: draft.publishedBinding.bindings[value]?.provider === 'supervisor_chain' ? formatWorkflowSupervisorChain(draft.publishedBinding.bindings[value] as WorkflowSupervisorChainParameters) : `${Object.values(draft.publishedDefinition.nodes).find(node => 'binding' in node && node.binding === value)?.title || '已发布节点'}的人员规则` }))} onChange={binding => patch({ binding, ...(draft.publishedBinding.bindings[binding]?.provider === 'supervisor_chain' && draft.publishedBinding.bindings[binding]?.continuous !== false ? { mode: 'sequence' } : {}) })} /></label><label>{node.kind === "handle" ? "办理完成后" : "通过后"}<Select disabled={disabled} value={node.kind === "handle" ? node.next : node.onApprove} options={targets} onChange={target => patch(node.kind === "handle" ? { next: target } : { onApprove: target })} /></label>{node.kind === "approval" && <label>拒绝后<Select disabled={disabled} value={node.onReject} options={targets} onChange={onReject => patch({ onReject })} /></label>}</>}
         {node.kind === 'action' && isWorkflowPlatformNotify(node) && <WorkflowNotificationEditor node={node} variables={variables} roles={configurations?.principals.roles || []} users={configurations?.principals.users || []} disabled={disabled} onChange={patch} />}


        {'next' in node && <label>完成后<Select disabled={disabled} value={node.next} options={targets} onChange={next => patch({ next })} /></label>}
        {'taskPageCode' in node && <p>本节点页面：{definition.taskPages?.[node.taskPageCode || '']?.title || '按应用页面规则填写' || '标准审批页面'}</p>}
        {!['end','correction'].includes(node.kind) && <Popconfirm title="删除节点并连接后续路径？" onConfirm={() => { try { mutate(editWorkflowDesignerDefinition(definition,{ type: 'remove',nodeId: node.id,...(node.kind === 'condition' ? { reconnectTo: node.otherwise } : {}) }));setSelected(definition.startAt === node.id ? graph.edges.find(edge => edge.from === node.id)?.to || '' : definition.startAt); } catch { message.error('此节点有多个出口，请先选择明确的后续节点。'); } }}><Button danger disabled={disabled}>删除节点</Button></Popconfirm>}
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
      <div className="oxa-designer-toolbar-identity"><Tooltip title="返回流程图"><Button icon={<ArrowLeftOutlined />} aria-label="返回流程图" disabled={busy || assistantState.unknown || liveState.busy || liveState.unknown} onClick={goBack} /></Tooltip><span className="oxa-designer-toolbar-label">流程设计</span><strong>{definition.title}</strong><Tag color="blue">{draft.environmentKey === 'production' ? '正式环境' : '测试环境'}</Tag>
        <Segmented aria-label="流程设计查看版本" value={publishedView ? 'published' : 'draft'} onChange={switchVersion} options={[{ value: 'published',label: `已发布 v${draft.definitionVersion}` },{ value: 'draft',label: '草稿' }]} />
        <span className="oxa-designer-save-state">{busy && frozenSave.current ? '正在保存…' : dirty ? errors.length ? '修改待检查' : '草稿未保存' : `${draft.updatedAt ? '草稿已自动保存' : '草稿与已发布版本一致'}${draft.updatedAt ? ` ${new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}</span>
        {(frozenSave.current || dirty && error) && <Button type="link" disabled={busy} onClick={() => void save()}>{frozenSave.current ? '重试原保存请求' : '重试保存'}</Button>}
      </div>
      <Space size={8} className="oxa-designer-toolbar-actions"><Tooltip title="撤销"><Button icon={<UndoOutlined />} aria-label="撤销" disabled={disabled || !history.length} onClick={() => { const previous = history.at(-1); if (previous) { setFuture(current => [...current,definition]);setHistory(current => current.slice(0,-1));setDefinition(previous); } }}>撤销</Button></Tooltip>
        <Tooltip title="重做"><Button icon={<RedoOutlined />} aria-label="重做" disabled={disabled || !future.length} onClick={() => { const next = future.at(-1); if (next) { setHistory(current => [...current,definition]);setFuture(current => current.slice(0,-1));setDefinition(next); } }}>重做</Button></Tooltip>
        <Button icon={<SafetyOutlined />} onClick={() => setChecksOpen(true)}>结构检查</Button><Button icon={<HistoryOutlined />} onClick={() => void showVersions()}>版本记录</Button><Button icon={<RobotOutlined />} disabled={disabled || liveState.busy || liveState.unknown} onClick={() => { const open = () => void openAssistant(); if (leaveHandling.current) leaveHandling.current(open); else open(); }}>AI 助手</Button><Button type="primary" disabled={disabled || errors.length > 0 || liveState.dirty || liveState.busy || liveState.unknown} onClick={() => void openPublication()}>发布并启用</Button>
      </Space>
    </header>
    {error && <Alert type="error" title={error} action={frozenSave.current ? <Button onClick={() => void save()}>重试保存</Button> : frozenAux.current ? <Button onClick={() => void retryAux()}>重试原操作</Button> : undefined} />}
    {receipt && <><Alert type={receipt.counts.failed || receipt.counts.excepted ? 'warning' : 'success'} title={`已发布 v${receipt.definitionVersion} · ${receipt.status === 'running' ? '正在更新进行中的申请' : '更新处理结束'}`} description={Object.entries(receipt.counts).map(([key,count]) => `${outcomeLabels[key] || key} ${count}`).join(' · ')} action={<Space>{receipt.status === 'running' && <Button disabled={busy} onClick={() => void control('pause')}>暂停更新</Button>}{receipt.status === 'paused' && <Button disabled={busy} onClick={() => void control('resume')}>继续更新</Button>}{!!receipt.counts.failed && <Button disabled={busy} onClick={() => void control('retry_failed')}>重试失败的申请</Button>}</Space>} />{receipt.items?.length ? <details><summary>查看申请更新记录</summary><Table size="small" rowKey="instanceId" dataSource={receipt.items} pagination={{ pageSize: 5 }} columns={[{ title: '申请',dataIndex: 'business_key' },{ title: '结果',render: (_,item) => outcomeLabels[item.outcome] || item.outcome },{ title: '原因',dataIndex: 'reason' }]} />{receipt.items.some(item => item.outcome === 'held') && <div style={{ padding: 12 }}><label>解除原版本保留<Select mode="multiple" style={{ width: '100%' }} value={releaseIds} disabled={busy || !!frozenAux.current} options={receipt.items.filter(item => item.outcome === 'held').map(item => ({ value: item.instanceId,label: item.business_key }))} onChange={setReleaseIds} /></label><Input aria-label="解除保留说明" maxLength={1000} value={releaseReason} disabled={busy || !!frozenAux.current} onChange={event => setReleaseReason(event.target.value)} placeholder="说明为什么将这些申请更新到当前版本" /><Button disabled={busy || !!frozenAux.current || !releaseIds.length || !releaseReason.trim()} onClick={() => void releaseHolds()}>解除保留并更新</Button></div>}</details> : null}</>}
    <div className={`oxa-designer-workspace ${outline ? '' : 'without-outline'} ${inspector ? '' : 'without-inspector'} ${detailInspector ? 'detail-inspector' : ''}`}>
      <aside className="oxa-designer-outline" aria-label="流程大纲"><div className="oxa-designer-outline-heading">{outline && <strong>流程大纲</strong>}<Button type="text" icon={outline ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />} aria-label={outline ? '收起流程大纲' : '展开流程大纲'} onClick={() => { const toggle = () => { if (!outline) setDetailInspector(false);setOutline(value => !value); };if (!outline && leaveHandling.current) leaveHandling.current(toggle); else toggle(); }} /></div>
        {outline && <Input.Search size="small" aria-label="搜索流程节点" placeholder="搜索节点" value={outlineKeyword} allowClear onChange={event => setOutlineKeyword(event.target.value)} />}
        <nav>{outlineNodes.filter(item => !outlineKeyword || item.title.includes(outlineKeyword)).map(item => {
          const Icon = item.presentation === 'notification' ? BellOutlined : typeIcons[item.kind as keyof typeof typeIcons] || CodeOutlined;
          return <Tooltip key={item.id} title={!outline ? item.title : undefined} placement="right"><button type="button" className={`kind-${item.kind}`} aria-label={item.title} aria-pressed={selected === item.id} onClick={() => selectNode(item.id)}><Icon />{outline && <span>{item.title}</span>}</button></Tooltip>;
        })}</nav>
        {outline && <footer><strong>检查结果</strong><button type="button" onClick={() => setChecksOpen(true)}><CheckCircleOutlined /> {errors.length ? `发现 ${errors.length} 项问题` : '未发现问题'}</button></footer>}
      </aside>
      <main><div className="oxa-designer-banner">{publishedView ? `正在查看已发布 v${draft.definitionVersion}` : '正在编辑草稿'} · 发布并启用时可更新进行中的申请</div>
        <WorkflowDiagram graph={displayGraph!} summaries={summaries} selectedNodeId={selected} selectedEdgeId={selectedEdge} onSelectEdge={setSelectedEdge} onSelectNode={selectNode} presentation="designer"
          insertionOptions={[...Object.values(draft.publishedDefinition.nodes).filter(source => ['approval','handle','cc','action'].includes(source.kind) && !isWorkflowPlatformNotify(source)).map(source => ({ value: source.id,label: source.title || kinds[source.kind] || '已发布节点',kind: source.kind })), ...(variables.length ? [{ value: 'condition',label: '条件分支',kind: 'condition' }] : []), { value: 'platform_notify',label: '发送通知',kind: 'notification' }]}
          onInsertEdge={disabled ? undefined : (value, chosenTemplate) => { const open = () => { if (chosenTemplate) { const title = chosenTemplate === 'condition' ? '条件分支' : chosenTemplate === 'platform_notify' ? '发送通知' : draft.publishedDefinition.nodes[chosenTemplate]?.title || '新增节点';insertNode(chosenTemplate,title,value); } else { setInsert(value);setNodeTitle('');setTemplate(variables.length ? 'condition' : Object.values(draft.publishedDefinition.nodes).find(node => node.kind === 'approval' || node.kind === 'handle')?.id || ''); } };if (leaveHandling.current) leaveHandling.current(open); else open(); }} />
        {!inspector && <Button className="oxa-designer-show-inspector" onClick={() => setInspector(true)}>节点设置</Button>}
        <Button className="oxa-designer-mobile-inspector" onClick={() => setInspector(true)}>编辑 {node?.title || '节点'}</Button>
      </main>
      {inspector && narrow && <button type="button" className="oxa-designer-inspector-backdrop" aria-label="关闭节点设置" onClick={() => { const close = () => setInspector(false);if (leaveHandling.current) leaveHandling.current(close); else close(); }} />}
      <aside style={{ display: inspector ? undefined : 'none' }} ref={inspectorElement} className="oxa-designer-desktop-inspector" role={narrow ? 'dialog' : undefined} aria-modal={narrow ? true : undefined} aria-label={assistantOpen ? 'AI 助手' : '节点设置'}><div hidden={assistantOpen}>{panel}</div><WorkflowDesignerAssistant presentation="panel" workflowCode={workflowCode} draft={draft} open={assistantOpen} canApply={!dirty && !busy && !liveState.dirty && !liveState.busy && !liveState.unknown && !frozenSave.current && !frozenPublish.current && !frozenAux.current} onClose={() => setAssistantOpen(false)} onApplied={value => { setPublishedView(false);setDraft(value);setDefinition(value.definition);setHistory(current => { const snapshots = [...current,definition].slice(-25);while (snapshots.length > 1 && snapshots.reduce((bytes,item) => bytes + JSON.stringify(item).length,0) > 4 * 1024 * 1024) snapshots.shift();return snapshots; });setFuture([]);setError(undefined); }} onStateChange={setAssistantState} /></aside>
    </div>
    <Drawer open={checksOpen} title="流程结构检查" width={440} onClose={() => setChecksOpen(false)}><Alert showIcon type={errors.length ? 'warning' : 'success'} title={errors.length ? `发现 ${errors.length} 项待修正的问题` : '未发现结构问题'} description={errors.length ? errors.map(diagnostic).join('；') : '节点与流转路径已通过结构校验。发布时还会检查当前应用的人员规则、页面和业务步骤。'} /></Drawer>
    <Modal open={!!insert} title="新增节点" onCancel={() => setInsert(undefined)} onOk={() => insertNode()} okText="添加" okButtonProps={{ disabled: !nodeTitle.trim() || !template }}><p>在选中路径中插入节点，沿用已发布的人员规则、业务步骤和页面。</p><label>节点类型<Select style={{ width: '100%' }} value={template} onChange={setTemplate} options={[{ value: 'platform_notify', label: '发送通知' },...(variables.length ? [{ value: 'condition',label: '条件分支' }] : []),...Object.values(draft.publishedDefinition.nodes).filter(node => ['approval','handle','cc','action'].includes(node.kind)).map(node => ({ value: node.id,label: `${kinds[node.kind]} · ${node.title}` }))]} /></label><label>节点名称<Input value={nodeTitle} onChange={event => setNodeTitle(event.target.value)} /></label></Modal>
    <Drawer open={versionsOpen} title="流程版本记录" width={620} onClose={() => setVersionsOpen(false)}><Table loading={busy} rowKey="publicationId" dataSource={versions} pagination={{ pageSize: 10 }} columns={[{ title: '版本',render: (_,item) => `v${item.definitionVersion}` },{ title: '说明',dataIndex: 'reason' },{ title: '发布时间',dataIndex: 'createdAt',render: value => new Date(value).toLocaleString() },{ title: '操作',render: (_,item) => <Popconfirm title="将该版本恢复到共享草稿？" description="当前草稿将被替换；发布后才会生效。" onConfirm={() => void restore(item.definitionVersion)}><Button disabled={busy || dirty || liveState.dirty || liveState.busy || liveState.unknown || !!frozenSave.current || !!frozenPublish.current || !!frozenAux.current}>恢复到草稿</Button></Popconfirm> }]} /></Drawer>
    <Modal open={publication} title="发布并启用" width={648} className="oxa-designer-publish-modal" cancelText="继续编辑"
      onCancel={() => { if (!frozenPublish.current) setPublication(false); }} onOk={() => void publish()} confirmLoading={busy}
      okText={frozenPublish.current ? '重试原发布请求' : '发布并启用'}
      okButtonProps={{ disabled: !reason.trim() || scope === 'running_and_new' && (holdIds.length > 0 || holdNodeIds.length > 0) && !holdReason.trim() || !preview || preview.truncated || scope === 'running_and_new' && !!preview.counts.excepted && !acknowledge }}>
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
