import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Checkbox, Drawer, Empty, Input, Modal, Popconfirm, Select, Skeleton, Space, Spin, Table, Tag } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CheckCircleOutlined, DeleteOutlined, RedoOutlined, UndoOutlined } from '@ant-design/icons';
import { editWorkflowDesignerDefinition, projectWorkflowGraph, validateWorkflowDesignerDocument, workflowDesignerVariables, type WorkflowDefinition, type WorkflowDesignerDraft, type WorkflowDesignerSave, type WorkflowDesignerPublish, type WorkflowNode, type WorkflowNodeConfigurations, type WorkflowPublicationPreview, type WorkflowPublicationReceipt } from 'openxiangda-contracts/browser';
import { OpenXiangdaPlatformRequestError, loadWorkflowDesignerDraft, loadWorkflowNodeConfigurations, saveWorkflowDesignerDraft, previewWorkflowDesignerPublication, publishWorkflowDesigner, loadWorkflowDesignerPublication, listWorkflowDesignerPublications, restoreWorkflowDesignerVersion, controlWorkflowDesignerPublication, searchWorkflowDesignerHoldCandidates } from '../../platform-client';
import { createBrowserUuid } from '../../uuid';
import { WorkflowDiagram } from './WorkflowDiagram';
import { WorkflowNodeConfigurationEditor } from './WorkflowNodeConfigurationEditor';
import { WorkflowDesignerAssistant } from './WorkflowDesignerAssistant';
import { WorkflowConditionEditor, defaultWorkflowCondition } from './WorkflowConditionEditor';
const kinds: Record<string,string> = { approval: '审批', condition: '条件分支', cc: '抄送', action: '已发布业务步骤', correction: '补正', end: '结束' };
const id = () => `node_${createBrowserUuid().replaceAll('-','').slice(0,12)}`;
const outcomeLabels: Record<string,string> = { eligible: '可更新', migrated: '已更新', deferred: '等待步骤完成', excepted: '需单独处理', held: '保留原版本', failed: '更新失败', completed: '已结束', superseded: '已替代' };
const refused = (error: unknown) => error instanceof OpenXiangdaPlatformRequestError && error.status >= 400 && error.status < 500;
const same = (left: unknown,right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Canonical authoring. The graph is a projection; coordinates never become executable state. */
export function WorkflowDesigner({ workflowCode, onPublished, onDirtyChange, onStateChange }: { workflowCode: string; onPublished?: (receipt: WorkflowPublicationReceipt) => void; onDirtyChange?: (dirty: boolean) => void; onStateChange?: (state: { dirty: boolean; busy: boolean; unknown: boolean }) => void }) {
  const { message } = App.useApp();
  const [draft,setDraft] = useState<WorkflowDesignerDraft>();
  const [definition,setDefinition] = useState<WorkflowDefinition>();
  const [configurations,setConfigurations] = useState<WorkflowNodeConfigurations>();
  const [selected,setSelected] = useState('');
  const [selectedEdge,setSelectedEdge] = useState<string>();
  const [publishedView,setPublishedView] = useState(false);
  const [outline,setOutline] = useState(true);
  const [inspector,setInspector] = useState(false);
  const [liveEditor,setLiveEditor] = useState(false);
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
    const [value,configuration] = await Promise.all([loadWorkflowDesignerDraft(workflowCode),loadWorkflowNodeConfigurations(workflowCode)]);
    if (!alive.current) return;
    setDraft(value);setDefinition(value.definition);setConfigurations(configuration);setSelected(value.definition.startAt);setHistory([]);setFuture([]);setError(undefined);
  },[workflowCode]);
  useEffect(() => { alive.current = true; void load().catch(error => setError(String(error.message))); return () => { alive.current = false; }; },[load]);
  const dirty = !!draft && !!definition && !same(draft.definition,definition);
  useEffect(() => { const unknown = !!frozenSave.current || !!frozenPublish.current || !!frozenAux.current || assistantState.unknown;onDirtyChange?.(dirty || unknown);onStateChange?.({ dirty,busy: busy || assistantState.busy,unknown }); },[dirty,busy,assistantState,onDirtyChange,onStateChange]);
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (dirty || frozenSave.current || frozenPublish.current || frozenAux.current || assistantState.unknown) { event.preventDefault(); event.returnValue = ''; } }; addEventListener('beforeunload',guard);return () => removeEventListener('beforeunload',guard); },[dirty,assistantState.unknown]);
  useEffect(() => {
    if (!receipt || receipt.status !== 'running' || publication) return;
    let active = true;
    const poll = setInterval(() => { void loadWorkflowDesignerPublication(workflowCode,receipt.publicationId).then(value => { if (active) setReceipt(value); },() => {}); },3000);
    return () => { active = false;clearInterval(poll); };
  },[workflowCode,receipt?.publicationId,receipt?.status,publication]);
  const shown = publishedView ? draft?.publishedDefinition : definition;
  const graph = useMemo(() => shown ? projectWorkflowGraph(shown,'draft') : undefined,[shown]);
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
  const save = async () => {
    if (!draft || !definition) return undefined;
    setBusy(true);
    try {
      frozenSave.current ||= { expectedRevision: draft.revision,expectedHeadRevision: draft.baseHeadRevision,operationId: createBrowserUuid(),definition,binding: draft.binding };
      const saved = await saveWorkflowDesignerDraft(workflowCode,frozenSave.current);
      frozenSave.current = undefined;setDraft(saved);setDefinition(saved.definition);setError(undefined);message.success('流程草稿已保存');return saved;
    } catch (error) { if (refused(error)) frozenSave.current = undefined;setError(`${String((error as Error).message)}${refused(error) ? '。修改已保留，可修正后再次保存。' : '。结果待确认，请重试原保存请求。'}`);return undefined; }
    finally { setBusy(false); }
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
    setAssistantOpen(true);
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
  const edge = graph?.edges.find(item => item.id === insert);
  const insertNode = () => {
    if (!edge || !definition || !nodeTitle.trim()) return;
    const nodeId = id();
    let next: WorkflowNode;
    if (template === 'condition') next = { id: nodeId,kind: 'condition',title: nodeTitle.trim(),branches: [{ label: '条件 1',when: defaultWorkflowCondition(variables),target: edge.to }],otherwise: edge.to };
    else {
      const source = draft?.publishedDefinition.nodes[template];
      if (!source || !['approval','cc','action'].includes(source.kind)) return;
      next = { ...structuredClone(source),id: nodeId,title: nodeTitle.trim() };
      if (next.kind === 'approval') next.onApprove = edge.to;
      else if ('next' in next) next.next = edge.to;
    }
    try {
      mutate(editWorkflowDesignerDefinition(definition,{ type: 'insert',from: edge.from,target: edge.to,node: next,edge: edge.kind === 'branch' ? (edge.priority || 1) - 1 : edge.kind === 'default' ? 'default' : edge.kind as 'approve'|'reject'|'next' }));
      setSelected(nodeId);setInsert(undefined);
    } catch (error) { setError(String((error as Error).message)); }
  };
  if (!draft || !definition || !graph) return error ? <Alert type="error" title="流程设计未能载入" description={error} action={<Button onClick={() => void load().catch(error => setError(String(error.message)))}>重新载入</Button>} /> : <Skeleton active />;
  const targets = Object.values(definition.nodes).filter(item => item.id !== selected).map(item => ({ value: item.id,label: item.title || item.id }));
  const panel = <div className="oxa-workflow-designer-inspector"><header><h2>{node?.title || '节点设置'}</h2><Tag>{kinds[node?.kind || '']}</Tag></header>
    {node && <><section className="oxa-designer-live-band"><h3>办理设置 <small>保存后对后续进入的任务生效</small></h3>{liveNode ? <><p>人员、办理方式和按钮沿用任务进入时的配置。</p><Button block onClick={() => setLiveEditor(true)}>调整办理设置</Button></> : <p>新增节点的办理设置随草稿发布。</p>}</section>
      <section className="oxa-designer-draft-band"><h3>流程结构 <small>随草稿发布生效</small></h3><label>节点名称<Input disabled={disabled} value={node.title || ''} onChange={event => patch({ title: event.target.value })} /></label>
        {node.kind === 'approval' && <><label>人员规则<Select disabled={disabled} value={node.binding} options={Object.keys(draft.publishedBinding.bindings).map(value => ({ value,label: `${Object.values(draft.publishedDefinition.nodes).find(node => 'binding' in node && node.binding === value)?.title || '已发布节点'}的人员规则` }))} onChange={binding => patch({ binding })} /></label><label>通过后<Select disabled={disabled} value={node.onApprove} options={targets} onChange={onApprove => patch({ onApprove })} /></label><label>拒绝后<Select disabled={disabled} value={node.onReject} options={targets} onChange={onReject => patch({ onReject })} /></label><label>可退回节点<Select disabled={disabled} mode="multiple" value={node.returnTargets || []} options={targets.filter(item => ['approval','correction'].includes(definition.nodes[item.value]?.kind || ''))} onChange={returnTargets => patch({ returnTargets })} /></label><p>办理时可选择重新经过后续节点，或提交后直接回到退回人；页面和字段规则由应用维护。</p></>}
        {node.kind === 'condition' && <>{node.branches.map((branch,index) => <div className="oxa-designer-branch" key={index}><Space><Tag>优先级 {index + 1}</Tag><Button size="small" icon={<ArrowUpOutlined />} disabled={disabled || index === 0} aria-label="提高分支优先级" onClick={() => { const branches = [...node.branches];[branches[index - 1],branches[index]] = [branches[index]!,branches[index - 1]!];patch({ branches }); }} /><Button size="small" icon={<ArrowDownOutlined />} disabled={disabled || index === node.branches.length - 1} aria-label="降低分支优先级" onClick={() => { const branches = [...node.branches];[branches[index],branches[index + 1]] = [branches[index + 1]!,branches[index]!];patch({ branches }); }} /><Button size="small" danger disabled={disabled || node.branches.length === 1} icon={<DeleteOutlined />} aria-label="删除分支" onClick={() => patch({ branches: node.branches.filter((_,i) => i !== index) })} /></Space><Input aria-label={`分支 ${index + 1} 名称`} disabled={disabled} value={branch.label || ''} onChange={event => patch({ branches: node.branches.map((item,i) => i === index ? { ...item,label: event.target.value } : item) })} /><fieldset disabled={disabled}><WorkflowConditionEditor value={branch.when} variables={variables} onChange={when => patch({ branches: node.branches.map((item,i) => i === index ? { ...item,when } : item) })} /></fieldset><Select aria-label={`分支 ${index + 1} 目标`} disabled={disabled} value={branch.target} options={targets} onChange={target => patch({ branches: node.branches.map((item,i) => i === index ? { ...item,target } : item) })} /></div>)}<Button disabled={disabled || !variables.length || node.branches.length >= 32} onClick={() => patch({ branches: [...node.branches,{ label: `条件 ${node.branches.length + 1}`,when: defaultWorkflowCondition(variables),target: node.otherwise }] })}>添加条件分支</Button><label>其他情况<Select disabled={disabled} value={node.otherwise} options={targets} onChange={otherwise => patch({ otherwise })} /></label><p>按优先级首次匹配，未匹配时走“其他情况”。</p></>}
        {'next' in node && <label>完成后<Select disabled={disabled} value={node.next} options={targets} onChange={next => patch({ next })} /></label>}
        {'taskPageCode' in node && <p>本节点页面：{node.taskPageCode || '标准审批页面'}</p>}
        {!['end','correction'].includes(node.kind) && <Popconfirm title="删除节点并连接后续路径？" onConfirm={() => { try { mutate(editWorkflowDesignerDefinition(definition,{ type: 'remove',nodeId: node.id,...(node.kind === 'condition' ? { reconnectTo: node.otherwise } : {}) }));setSelected(definition.startAt === node.id ? graph.edges.find(edge => edge.from === node.id)?.to || '' : definition.startAt); } catch { message.error('此节点有多个出口，请先选择明确的后续节点。'); } }}><Button danger disabled={disabled}>删除节点</Button></Popconfirm>}
      </section></>}
  </div>;
  const diagnostic = (error: string) => {
    const [code,nodeId] = error.split(':');const title = nodeId ? definition.nodes[nodeId]?.title || '节点' : '流程';
    const messages: Record<string,string> = { WORKFLOW_DESIGNER_CYCLE: '后续路径形成循环',WORKFLOW_DESIGNER_TARGET_MISSING: '后续节点不存在',WORKFLOW_DESIGNER_UNREACHABLE: '尚未连接到流程',WORKFLOW_DESIGNER_CONDITION_TYPE: '条件变量与比较值类型不一致',WORKFLOW_DESIGNER_VARIABLE_UNKNOWN: '条件变量来源无法确认',WORKFLOW_DESIGNER_CONDITION_BOOLEAN: '条件需要产生满足或不满足的判断',WORKFLOW_DESIGNER_BRANCH_LIMIT: '条件分支数量超出限制' };
    return `${title}：${messages[code || ''] || '配置需要调整'}`;
  };
  return <section className="oxa-workflow-designer" aria-label="流程设计器"><header className="oxa-designer-toolbar"><Space><Button onClick={() => setOutline(!outline)}>流程大纲</Button><strong>{definition.title}</strong><Tag>{draft.environmentKey === 'production' ? '正式环境' : '测试环境'}</Tag><Select aria-label="流程设计查看版本" value={publishedView ? 'published' : 'draft'} options={[{ value: 'published',label: `已发布 v${draft.definitionVersion}` },{ value: 'draft',label: `草稿 · 修订 ${draft.revision}` }]} onChange={value => setPublishedView(value === 'published')} /></Space><Space wrap><Button icon={<UndoOutlined />} disabled={disabled || !history.length} onClick={() => { setFuture([definition,...future]);setDefinition(history.at(-1)!);setHistory(history.slice(0,-1)); }}>撤销</Button><Button icon={<RedoOutlined />} disabled={disabled || !future.length} onClick={() => { setHistory([...history,definition]);setDefinition(future[0]!);setFuture(future.slice(1)); }}>重做</Button><Button disabled={disabled} onClick={() => void openAssistant()}>AI 助手</Button><Button disabled={busy || assistantState.unknown} onClick={() => void showVersions()}>版本记录</Button><Button disabled={busy || assistantState.busy || assistantState.unknown || !!frozenAux.current || !!frozenPublish.current || !dirty && !frozenSave.current} onClick={() => void save()}>保存草稿</Button><Button type="primary" disabled={busy || assistantState.busy || assistantState.unknown || !!frozenAux.current || errors.length > 0 || publishedView || !!frozenPublish.current && !publication} onClick={() => void openPublication()}>发布并启用</Button></Space></header>
    {error && <Alert type="error" title={error} action={frozenSave.current ? <Button onClick={() => void save()}>重试保存</Button> : frozenAux.current ? <Button onClick={() => void retryAux()}>重试原操作</Button> : undefined} />}
    {receipt && <><Alert type={receipt.counts.failed || receipt.counts.excepted ? 'warning' : 'success'} title={`已发布 v${receipt.definitionVersion} · ${receipt.status === 'running' ? '正在更新进行中的申请' : '更新处理结束'}`} description={Object.entries(receipt.counts).map(([key,count]) => `${outcomeLabels[key] || key} ${count}`).join(' · ')} action={<Space>{receipt.status === 'running' && <Button disabled={busy} onClick={() => void control('pause')}>暂停更新</Button>}{receipt.status === 'paused' && <Button disabled={busy} onClick={() => void control('resume')}>继续更新</Button>}{!!receipt.counts.failed && <Button disabled={busy} onClick={() => void control('retry_failed')}>重试失败的申请</Button>}</Space>} />{receipt.items?.length ? <details><summary>查看申请更新记录</summary><Table size="small" rowKey="instanceId" dataSource={receipt.items} pagination={{ pageSize: 5 }} columns={[{ title: '申请',dataIndex: 'business_key' },{ title: '结果',render: (_,item) => outcomeLabels[item.outcome] || item.outcome },{ title: '原因',dataIndex: 'reason' }]} />{receipt.items.some(item => item.outcome === 'held') && <div style={{ padding: 12 }}><label>解除原版本保留<Select mode="multiple" style={{ width: '100%' }} value={releaseIds} disabled={busy || !!frozenAux.current} options={receipt.items.filter(item => item.outcome === 'held').map(item => ({ value: item.instanceId,label: item.business_key }))} onChange={setReleaseIds} /></label><Input aria-label="解除保留说明" maxLength={1000} value={releaseReason} disabled={busy || !!frozenAux.current} onChange={event => setReleaseReason(event.target.value)} placeholder="说明为什么将这些申请更新到当前版本" /><Button disabled={busy || !!frozenAux.current || !releaseIds.length || !releaseReason.trim()} onClick={() => void releaseHolds()}>解除保留并更新</Button></div>}</details> : null}</>}
    <div className="oxa-designer-banner">{publishedView ? '查看已发布结构' : dirty ? '当前有未保存的修改' : '草稿已保存'} · 发布时可更新进行中的申请，当前办理任务保持原配置。</div>
    {errors.length > 0 && <Alert type="warning" title="流程检查发现待修正的问题" description={errors.slice(0,8).map(diagnostic).join("；")} />}
    <div className={`oxa-designer-workspace ${outline ? '' : 'without-outline'}`}>{outline && <aside className="oxa-designer-outline" aria-label="流程大纲">{graph.nodes.map(item => <button type="button" aria-pressed={selected === item.id} key={item.id} onClick={() => { setSelected(item.id);setInspector(true); }}>{item.title}<small>{kinds[item.kind]}</small></button>)}<footer><CheckCircleOutlined /> {errors.length ? `发现 ${errors.length} 项问题` : '结构检查通过'}{errors.length > 0 && <ul>{errors.slice(0,8).map(error => <li key={error}>{diagnostic(error)}</li>)}</ul>}</footer></aside>}
      <main><WorkflowDiagram graph={graph} selectedNodeId={selected} selectedEdgeId={selectedEdge} onSelectEdge={setSelectedEdge} onSelectNode={value => { setSelected(value);setInspector(true); }} presentation="canvas" onInsertEdge={disabled ? undefined : value => { setInsert(value);setNodeTitle('');setTemplate(variables.length ? 'condition' : Object.values(draft.publishedDefinition.nodes).find(node => node.kind === 'approval')?.id || ''); }} /><Button className="oxa-designer-mobile-inspector" onClick={() => setInspector(true)}>编辑 {node?.title || '节点'}</Button></main><aside className="oxa-designer-desktop-inspector">{panel}</aside></div>
    <Drawer title="节点设置" open={inspector && matchMedia('(max-width: 899px)').matches} placement="bottom" styles={{ wrapper: { height: '85dvh' } }} onClose={() => setInspector(false)}>{panel}</Drawer>
    {liveEditor && liveNode && configurations && <WorkflowNodeConfigurationEditor workflowCode={workflowCode} node={liveNode} principals={configurations.principals} expectedHeadRevision={draft.baseHeadRevision} onClose={() => setLiveEditor(false)} onSaved={() => { setLiveEditor(false);void loadWorkflowNodeConfigurations(workflowCode).then(setConfigurations); }} />}
    <Modal open={!!insert} title="新增节点" onCancel={() => setInsert(undefined)} onOk={insertNode} okText="添加" okButtonProps={{ disabled: !nodeTitle.trim() || !template }}><p>在选中路径中插入节点，沿用已发布的人员规则、业务步骤和页面。</p><label>节点类型<Select style={{ width: '100%' }} value={template} onChange={setTemplate} options={[...(variables.length ? [{ value: 'condition',label: '条件分支' }] : []),...Object.values(draft.publishedDefinition.nodes).filter(node => ['approval','cc','action'].includes(node.kind)).map(node => ({ value: node.id,label: `${kinds[node.kind]} · ${node.title}` }))]} /></label><label>节点名称<Input value={nodeTitle} onChange={event => setNodeTitle(event.target.value)} /></label></Modal>
    <WorkflowDesignerAssistant workflowCode={workflowCode} draft={draft} open={assistantOpen} canApply={!dirty && !busy && !frozenSave.current && !frozenPublish.current && !frozenAux.current} onClose={() => setAssistantOpen(false)} onApplied={value => { setPublishedView(false);setDraft(value);setDefinition(value.definition);setHistory([]);setFuture([]);setError(undefined); }} onStateChange={setAssistantState} />
    <Drawer open={versionsOpen} title="流程版本记录" width={620} onClose={() => setVersionsOpen(false)}><Table loading={busy} rowKey="publicationId" dataSource={versions} pagination={{ pageSize: 10 }} columns={[{ title: '版本',render: (_,item) => `v${item.definitionVersion}` },{ title: '说明',dataIndex: 'reason' },{ title: '发布时间',dataIndex: 'createdAt',render: value => new Date(value).toLocaleString() },{ title: '操作',render: (_,item) => <Popconfirm title="将该版本恢复到共享草稿？" description="当前草稿将被替换；发布后才会生效。" onConfirm={() => void restore(item.definitionVersion)}><Button disabled={busy || dirty || !!frozenSave.current || !!frozenPublish.current || !!frozenAux.current}>恢复到草稿</Button></Popconfirm> }]} /></Drawer>
    <Modal open={publication} title="发布并启用流程" onCancel={() => { if (!frozenPublish.current) setPublication(false); }} onOk={() => void publish()} confirmLoading={busy} okText={frozenPublish.current ? '重试原发布请求' : '发布并启用'} okButtonProps={{ disabled: !reason.trim() || scope === 'running_and_new' && (holdIds.length > 0 || holdNodeIds.length > 0) && !holdReason.trim() || !preview || preview.truncated || scope === 'running_and_new' && !!preview.counts.excepted && !acknowledge }}><fieldset disabled={busy || !!frozenPublish.current}><label>生效范围<Select value={scope} style={{ width: '100%' }} onChange={setScope} options={[{ value: 'running_and_new',label: '进行中与新申请使用新版本（默认）' },{ value: 'new_only',label: '仅新申请使用新版本' }]} /></label><p>当前办理的人员、按钮和页面保持不变；后续节点使用新流程。</p><label>修改说明<Input.TextArea value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></label>{scope === 'running_and_new' && <><label>保留原版本的申请<Select mode="multiple" showSearch filterOption={false} onSearch={keyword => void searchHolds(keyword)} disabled={busy || !!frozenPublish.current} style={{ width: '100%' }} value={holdIds} onChange={value => { setHoldIds(value);setPreview(undefined); }} options={holdCandidates.map(item => ({ value: item.instanceId,label: `${item.businessKey} · ${item.nodeTitle}` }))} /></label><label>保留当前停在这些节点的申请<Select mode="multiple" style={{ width: '100%' }} value={holdNodeIds} options={Object.values(definition.nodes).filter(node => ['approval','correction','action'].includes(node.kind)).map(node => ({ value: node.id,label: node.title || '流程节点' }))} onChange={value => { setHoldNodeIds(value);setPreview(undefined); }} /></label>{(holdIds.length > 0 || holdNodeIds.length > 0) && <label>保留原因<Input value={holdReason} maxLength={1000} onChange={event => setHoldReason(event.target.value)} /></label>}<Button onClick={() => void check()}>重新检查影响</Button></>}</fieldset><Spin spinning={busy}>{scope === 'new_only' && <p>新发起的申请使用此版本，进行中的申请保持当前版本。</p>}{preview && scope === 'running_and_new' && <><p>{Object.entries(preview.counts).map(([key,count]) => `${outcomeLabels[key] || key} ${count}`).join(' · ')}</p><Table size="small" rowKey="instanceId" dataSource={preview.items.filter(item => item.outcome !== 'eligible')} pagination={{ pageSize: 5 }} columns={[{ title: '申请',dataIndex: 'businessKey' },{ title: '处理',render: (_,item) => outcomeLabels[item.outcome] },{ title: '原因',dataIndex: 'reason' }]} />{!!preview.counts.excepted && <Checkbox disabled={!!frozenPublish.current} checked={acknowledge} onChange={event => setAcknowledge(event.target.checked)}>我已了解不能更新的申请将保留原版本，并在更新记录中单独列出。</Checkbox>}</>}</Spin></Modal>
  </section>;
}
