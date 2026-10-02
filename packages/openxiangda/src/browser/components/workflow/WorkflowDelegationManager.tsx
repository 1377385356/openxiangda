import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, DatePicker, Descriptions, Drawer, Empty, Form, Input, Select, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import type { WorkflowDelegationAdministration, WorkflowDelegationCandidate, WorkflowDelegationCandidatePage, WorkflowDelegationCatalog,
  WorkflowDelegationEffectiveState, WorkflowDelegationMutationPreview, WorkflowDelegationMutationReceipt, WorkflowDelegationMutationRequest } from 'openxiangda-contracts/browser';
import { executeWorkflowDelegationMutation, listWorkflowDelegationCandidates, listWorkflowDelegations, loadWorkflowDelegation,
  loadWorkflowDelegationCatalog, loadWorkflowDelegationMutationReceipt, OpenXiangdaPlatformRequestError, previewWorkflowDelegationMutation } from '../../platform-client';

export interface WorkflowDelegationDraftState { dirty: boolean; busy: boolean; unknown: boolean }
export interface WorkflowDelegationManagerProps {
  initialAll?: boolean;
  refreshKey?: number | string;
  /** Register dirty state with the host's existing navigation owner. */
  onDraftStateChange?: (state: WorkflowDelegationDraftState) => void;
}
const stateNames: Record<WorkflowDelegationEffectiveState,string> = {active:'生效中',scheduled:'尚未开始',expired:'已过期',revoked:'已撤销',ineligible:'资格失效'};
const issueNames: Record<string,string> = {DELEGATOR_ACCOUNT_INELIGIBLE:'原审批人账号已失效',DELEGATE_ACCOUNT_INELIGIBLE:'代理人账号已失效',
  DELEGATOR_MEMBERSHIP_CHANGED:'原审批人的职责或有效期已变更',DELEGATE_MEMBERSHIP_CHANGED:'代理人的职责或有效期已变更',SCOPE_INCOMPATIBLE:'审批范围不兼容',CHAIN_CONFLICT:'存在链式或环形代理'};
const errorText = (error:unknown) => error instanceof Error ? error.message : '读取失败，请重试';
const time = (value:string|null) => value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—';
function useRead<T>(key:string|undefined,read:()=>Promise<T>) {
  const reader=useRef(read); reader.current=read;
  const [attempt,setAttempt]=useState(0),[state,setState]=useState<{key?:string;attempt:number;data?:T;error:string;loading:boolean}>({attempt:0,error:'',loading:true});
  useEffect(()=>{
    let active=true; setState({key,attempt,error:'',loading:Boolean(key)});
    if(key) void reader.current().then(data=>{if(active)setState({key,attempt,data,error:'',loading:false});})
      .catch(error=>{if(active)setState({key,attempt,error:errorText(error),loading:false});});
    return()=>{active=false;};
  },[key,attempt]);
  const current=state.key===key&&state.attempt===attempt?state:{data:undefined,error:'',loading:Boolean(key)};
  return {...current,reload:()=>setAttempt(value=>value+1)};
}
type Edit = ({ operation:'create' } | { operation:'revoke'; row:WorkflowDelegationAdministration }) & { catalog:WorkflowDelegationCatalog };

/** Personal and administrator maintenance use the same current-user contract. */
export function WorkflowDelegationManager({initialAll=false,refreshKey=0,onDraftStateChange}:WorkflowDelegationManagerProps) {
  const catalog=useRead(`delegation-catalog:${refreshKey}`,loadWorkflowDelegationCatalog);
  const [all,setAll]=useState(initialAll),[page,setPage]=useState(1),[keyword,setKeyword]=useState(''),[search,setSearch]=useState('');
  const [effectiveState,setEffectiveState]=useState<WorkflowDelegationEffectiveState>(),[workflowCode,setWorkflowCode]=useState<string>(),[edit,setEdit]=useState<Edit>();
  const [refresh,setRefresh]=useState(0);
  const query={all:all&&Boolean(catalog.data?.canReadAll),limit:20,offset:(page-1)*20,keyword:search,
    ...(effectiveState?{effectiveState}:{}),...(workflowCode?{workflowCode}:{})};
  const rows=useRead(catalog.data?JSON.stringify([catalog.data.actorUserId,refreshKey,refresh,query]):undefined,()=>listWorkflowDelegations(query));
  const blocked=Boolean(edit);
  const changed=()=>{setRefresh(value=>value+1);catalog.reload();};
  if(catalog.error&&!edit) return <Alert type="error" showIcon title="无法读取代理维护权限" description={catalog.error} action={<Button onClick={catalog.reload}>重试</Button>} />;
  return <div className="oxa-workflow-delegation-manager">
    <div className="oxa-delegation-toolbar">
      {catalog.data?.canReadAll&&<Select aria-label="代理可见范围" value={all?'all':'mine'} disabled={blocked} options={[{value:'mine',label:'与我有关'},{value:'all',label:'全应用代理'}]}
        onChange={value=>{setAll(value==='all');setPage(1);}} />}
      <Input.Search aria-label="搜索代理人员或原因" placeholder="搜索人员姓名或原因" value={keyword} allowClear disabled={blocked} maxLength={80}
        onChange={event=>setKeyword(event.target.value)} onSearch={value=>{setSearch(value.trim());setPage(1);}} />
      <Select aria-label="代理状态" value={effectiveState} placeholder="全部状态" allowClear disabled={blocked} options={Object.entries(stateNames).map(([value,label])=>({value,label}))}
        onChange={value=>{setEffectiveState(value);setPage(1);}} />
      <Select aria-label="代理限定流程" value={workflowCode} placeholder="全部流程" allowClear disabled={blocked} showSearch optionFilterProp="label"
        options={catalog.data?.workflows.map(row=>({value:row.code,label:row.title}))} onChange={value=>{setWorkflowCode(value);setPage(1);}} />
      <Button disabled={blocked} onClick={changed}>刷新</Button>
      {catalog.data?.canCreate&&<Button type="primary" disabled={blocked} onClick={()=>setEdit({operation:'create',catalog:catalog.data!})}>设置我的代理</Button>}
    </div>
    <p className="oxa-workflow-config-help">在指定职责、流程和时间内，由符合资格的人代办审批。创建或撤销规则只影响后续分派，已有待办保留原职责快照。</p>
    {catalog.data&&!catalog.data.canCreate&&!catalog.data.canReadAll&&<Alert showIcon type="info" title="当前没有可以委托的审批职责" description="可以查看与你有关的代理。职责成员由管理员维护。" />}
    {catalog.data?.canReadAll&&<p className="oxa-workflow-config-help">管理员可以查看及撤销代理；创建需要由原审批人本人操作。</p>}
    {rows.error&&<Alert showIcon type="error" title="代理读取失败" description={rows.error} action={<Button disabled={blocked} onClick={rows.reload}>重试</Button>} />}
    <Table rowKey="id" size="small" loading={catalog.loading||rows.loading} dataSource={rows.data?.items} scroll={{x:900}}
      locale={{emptyText:<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={rows.error?'读取失败，请重试':'没有符合筛选条件的代理'} />}}
      pagination={{current:page,pageSize:20,total:rows.data?.total,showSizeChanger:false,disabled:blocked,onChange:setPage}}
      columns={[
        {title:'审批职责与人员',width:240,render:(_,row)=><><b>{row.delegatorDisplayName} → {row.delegateDisplayName}</b><div className="oxa-workflow-config-help">{row.roleName}</div></>},
        {title:'流程范围',width:160,render:(_,row)=>row.workflowCode?catalog.data?.workflows.find(flow=>flow.code===row.workflowCode)?.title||row.workflowCode:'全部适用流程'},
        {title:'有效时间',width:190,render:(_,row)=><><div>{time(row.validFrom)}</div><div className="oxa-workflow-config-help">至 {time(row.validTo)}</div></>},
        {title:'当前状态',width:120,render:(_,row)=><Tag color={row.effectiveState==='active'?'green':row.effectiveState==='ineligible'?'error':undefined}>{stateNames[row.effectiveState]}</Tag>},
        {title:'操作',width:110,render:(_,row)=>row.canRevoke?<Button type="link" danger disabled={blocked} onClick={()=>setEdit({operation:'revoke',row,catalog:catalog.data!})}>撤销规则</Button>:'—'},
      ]} expandable={{expandedRowRender:row=><DelegationDetails row={row} />}} />
    {edit&&<DelegationEditor key={`${edit.catalog.actorUserId}:${edit.operation}:${edit.operation==='revoke'?edit.row.id:'new'}`}
      edit={edit} catalog={edit.catalog} onClose={()=>setEdit(undefined)} onChanged={changed} onDraftStateChange={onDraftStateChange} />}
  </div>;
}
function DelegationDetails({row}:{row:WorkflowDelegationAdministration}) {
  return <Descriptions size="small" column={1} items={[
    {key:'reason',label:'设置原因',children:row.reason},
    {key:'revision',label:'规则修订',children:`r${row.revision}`},
    {key:'duties',label:'冻结的职责修订',children:`${row.delegatorDisplayName} r${row.delegatorRoleSubjectRevision} / ${row.delegateDisplayName} r${row.delegateRoleSubjectRevision}`},
    {key:'issues',label:'资格诊断',children:row.issues.length?row.issues.map(issue=>issueNames[issue]||issue).join('；'):'当前资格正常'},
    {key:'clock',label:'状态核对时间',children:time(row.evaluatedAt)},
    ...(row.revokedAt?[{key:'revoke',label:'撤销记录',children:`${time(row.revokedAt)} · ${row.revokeReason||'—'}`}]:[]),
  ]} />;
}
type Values={source:string;workflowCode?:string;validFrom:dayjs.Dayjs;validTo:dayjs.Dayjs;reason:string};
function DelegationEditor({edit,catalog,onClose,onChanged,onDraftStateChange}:{edit:Edit;catalog:WorkflowDelegationCatalog;onClose:()=>void;onChanged:()=>void;onDraftStateChange?:WorkflowDelegationManagerProps['onDraftStateChange']}) {
  const {modal}=App.useApp(); const [form]=Form.useForm<Values>();
  const [row,setRow]=useState(edit.operation==='revoke'?edit.row:undefined),[selected,setSelected]=useState<WorkflowDelegationCandidate>();
  const [sources,setSources]=useState(catalog.sources);
  const [proposal,setProposal]=useState<WorkflowDelegationMutationRequest>(),[preview,setPreview]=useState<WorkflowDelegationMutationPreview>(),[receipt,setReceipt]=useState<WorkflowDelegationMutationReceipt>();
  const [busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[error,setError]=useState(''),[rejected,setRejected]=useState(false);
  const [term,setTerm]=useState(''),[search,setSearch]=useState(''),[candidatePage,setCandidatePage]=useState(1),[candidateRefresh,setCandidateRefresh]=useState(0);
  const source=Form.useWatch('source',form),from=Form.useWatch('validFrom',form),to=Form.useWatch('validTo',form),workflowCode=Form.useWatch('workflowCode',form);
  const windowReady=source&&from&&to&&to.isAfter(from), locked=busy||unknown||Boolean(receipt);
  const reader=useRead<WorkflowDelegationCandidatePage>(edit.operation==='create'&&windowReady?JSON.stringify([catalog.actorUserId,source,from.toISOString(),to.toISOString(),workflowCode,search,candidatePage,candidateRefresh]):undefined,
    ()=>listWorkflowDelegationCandidates({delegatorRoleSubjectKey:source,validFrom:from.toISOString(),validTo:to.toISOString(),...(workflowCode?{workflowCode}:{}),keyword:search,limit:20,offset:(candidatePage-1)*20}));
  useEffect(()=>{const timer=setTimeout(()=>{setSearch(term.trim());setCandidatePage(1);},250);return()=>clearTimeout(timer);},[term]);
  const dirty=!receipt;
  useEffect(()=>{onDraftStateChange?.({dirty,busy,unknown});return()=>onDraftStateChange?.({dirty:false,busy:false,unknown:false});},[dirty,busy,unknown,onDraftStateChange]);
  useEffect(()=>{if(!dirty)return;const beforeUnload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload);},[dirty]);
  const changed=()=>{if(locked)return;setPreview(undefined);setProposal(undefined);setRejected(false);setError('');};
  const close=()=>{
    if(busy)return;
    if(dirty) modal.confirm({title:'放弃当前未完成的代理维护？',content:unknown?'提交结果仍未确认，请保留原操作并先核对回执。':'当前输入尚未提交。关闭后将丢失本次草稿。',okText:unknown?'继续核对':'放弃草稿',cancelText:unknown?'留在此页':'继续编辑',
      onOk:unknown?undefined:onClose});
    else onClose();
  };
  const makeProposal=async()=>{
    setError('');setBusy(true);
    try {
      const values=await form.validateFields();
      let request:WorkflowDelegationMutationRequest;
      const base={schemaVersion:'openxiangda.workflow-delegation-mutation/v2' as const,operationId:crypto.randomUUID(),environmentKey:catalog.environmentKey,reason:values.reason.trim()};
      if(edit.operation==='create') {
        const binding=sources.find(item=>item.roleSubjectKey===values.source);
        if(!binding||!selected)throw new Error('请选择审批职责和符合资格的代理人');
        request={...base,operation:'create',workflowCode:values.workflowCode||null,delegatorRoleSubjectKey:values.source,expectedDelegatorRevision:binding.roleSubjectRevision,
          delegateUserId:selected.userId,delegateRoleSubjectKey:selected.roleSubjectKey,expectedDelegateRevision:selected.roleSubjectRevision,validFrom:values.validFrom.toISOString(),validTo:values.validTo.toISOString()};
      } else request={...base,operation:'revoke',delegationId:row!.id,expectedRevision:row!.revision};
      setProposal(request);setPreview(undefined);setRejected(false);
      const checked=await previewWorkflowDelegationMutation(request);
      if(checked.operationId!==request.operationId||checked.operation!==request.operation) throw new Error('代理核对结果不匹配，请重新核对');
      setPreview(checked);
    } catch(failure) {if(!(failure&&typeof failure==='object'&&'errorFields' in failure))setError(errorText(failure));}
    finally {setBusy(false);}
  };
  const accept=(result:WorkflowDelegationMutationReceipt)=>{
    if(!proposal||!preview||result.operationId!==proposal.operationId||result.operation!==proposal.operation||result.requestDigest!==preview.requestDigest||result.actorUserId!==catalog.actorUserId||result.appCode!==catalog.appCode||result.environmentKey!==catalog.environmentKey)
      throw new Error('原操作回执不匹配，结果仍待确认');
    setReceipt(result);setUnknown(false);setRejected(false);onChanged();
  };
  const submit=async()=>{
    if(!proposal||!preview)return;
    const recovering=unknown;setBusy(true);setError('');
    try {accept(await executeWorkflowDelegationMutation(proposal));}
    catch(failure) {
      setError(errorText(failure));
      if(!recovering&&failure instanceof OpenXiangdaPlatformRequestError&&failure.status>=400&&failure.status<500){setRejected(true);setPreview(undefined);}
      else setUnknown(true);
    } finally {setBusy(false);}
  };
  const reconcile=async()=>{
    if(!proposal)return;setBusy(true);setError('');
    try {accept(await loadWorkflowDelegationMutationReceipt(proposal.operationId));}
    catch(failure) {setError(failure instanceof OpenXiangdaPlatformRequestError&&failure.status===404?'尚未找到原操作回执，提交结果仍未知。可继续核对，或显式重试同一请求。':errorText(failure));setUnknown(true);}
    finally {setBusy(false);}
  };
  const rebase=async()=>{
    setBusy(true);setError('');
    try {
      if(row) setRow(await loadWorkflowDelegation(row.id));
      else {
        const fresh=await loadWorkflowDelegationCatalog();
        if(!fresh.sources.some(item=>item.roleSubjectKey===source))throw new Error('原审批职责已失效，请关闭草稿后重新选择');
        setSources(fresh.sources);
        if(selected){const current=await listWorkflowDelegationCandidates({delegatorRoleSubjectKey:source,validFrom:from.toISOString(),validTo:to.toISOString(),...(workflowCode?{workflowCode}:{}),keyword:selected.displayName,limit:50,offset:0});
          const target=current.items.find(item=>item.roleSubjectKey===selected.roleSubjectKey);if(!target)throw new Error('原代理人不再符合资格，请保留输入并重新选择');setSelected(target);}
        setCandidateRefresh(value=>value+1);
      }
      setProposal(undefined);setPreview(undefined);setRejected(false);
    } catch(failure) {setError(errorText(failure));} finally{setBusy(false);}
  };
  const candidates=new Map(reader.data?.items.map(item=>[item.roleSubjectKey,item])||[]);if(selected)candidates.set(selected.roleSubjectKey,selected);
  return <Drawer open title={edit.operation==='create'?'设置我的审批代理':'撤销审批代理'} size={640} styles={{wrapper:{maxWidth:'100vw'}}} onClose={close}
    closable={!busy} mask={{closable:!busy}} keyboard={!busy} className="oxa-workflow-delegation-editor"
    footer={<Space wrap>{receipt?<Button type="primary" onClick={onClose}>完成</Button>:unknown?<><Button disabled={busy} loading={busy} onClick={()=>void reconcile()}>核对原操作回执</Button><Button disabled={busy} onClick={()=>void submit()}>重试原请求</Button></>:<>
      <Button disabled={busy} onClick={close}>关闭</Button>{rejected&&<Button disabled={busy} onClick={()=>void rebase()}>读取当前基准，保留输入</Button>}
      <Button disabled={busy||Boolean(row&&!row.canRevoke)} loading={busy&&!preview} onClick={()=>void makeProposal()}>核对变更</Button>
      <Button type="primary" danger={edit.operation==='revoke'} disabled={busy||!preview} loading={busy&&Boolean(preview)} onClick={()=>void submit()}>{edit.operation==='revoke'?'确认撤销':'确认设置'}</Button>
    </>}</Space>}>
    <Alert showIcon type="info" title="只影响后续分派" description="已有待办保留创建时的原审批人、代理人和时间快照；到期及人员资格仍在办理时复核。" />
    {row&&<><p><b>{row.delegatorDisplayName} → {row.delegateDisplayName}</b> · {row.roleName} · r{row.revision}</p><DelegationDetails row={row} /></>}
    <Form form={form} layout="vertical" disabled={locked} initialValues={{source:catalog.sources[0]?.roleSubjectKey,validFrom:dayjs(catalog.evaluatedAt),validTo:dayjs(catalog.evaluatedAt).add(1,'day')}}
      onValuesChange={values=>{changed();if('source' in values||'workflowCode' in values||'validFrom' in values||'validTo' in values){setSelected(undefined);setCandidatePage(1);}}}>
      {edit.operation==='create'&&<>
        <Form.Item name="source" label="委托的审批职责" rules={[{required:true,message:'请选择本人的审批职责'}]}><Select aria-label="委托的审批职责" options={sources.map(item=>({value:item.roleSubjectKey,label:item.roleName}))} /></Form.Item>
        <Form.Item name="workflowCode" label="限定流程"><Select aria-label="设置代理的限定流程" allowClear placeholder="全部适用流程" showSearch optionFilterProp="label" options={catalog.workflows.map(flow=>({value:flow.code,label:flow.title}))} /></Form.Item>
        <div className="oxa-delegation-dates"><Form.Item name="validFrom" label="开始时间" rules={[{required:true,message:'请选择开始时间'}]}><DatePicker aria-label="代理开始时间" showTime format="YYYY-MM-DD HH:mm:ss" /></Form.Item>
          <Form.Item name="validTo" label="结束时间" rules={[{required:true,message:'请选择结束时间'},{validator:async(_,value)=>{if(value&&from&&!value.isAfter(from))throw new Error('结束时间必须晚于开始时间');}}]}><DatePicker aria-label="代理结束时间" showTime format="YYYY-MM-DD HH:mm:ss" /></Form.Item></div>
        <Form.Item label="代理人" required extra="只列出同一职责、范围和有效期兼容的人员。到结束时间自动失效。">
          <Select aria-label="选择合法代理人" placeholder={windowReady?'搜索并选择代理人':'先选择职责和时间'} showSearch filterOption={false} disabled={locked||!windowReady} loading={reader.loading}
            value={selected?.roleSubjectKey} onSearch={setTerm} allowClear options={[...candidates.values()].map(item=>({value:item.roleSubjectKey,label:`${item.displayName} · ${item.roleName}`}))}
            onChange={value=>{setSelected(candidates.get(value));changed();}} />
          {reader.error&&<Alert type="error" showIcon title="代理人读取失败" description={reader.error} action={<Button disabled={locked} onClick={reader.reload}>重试</Button>} />}
          {reader.data&&<div className="oxa-delegation-candidate-paging">第 {candidatePage} 页，共 {reader.data.total} 位符合资格的人员
            <Button size="small" disabled={locked||reader.loading||candidatePage===1} onClick={()=>setCandidatePage(value=>value-1)}>上一页</Button>
            <Button size="small" disabled={locked||reader.loading||candidatePage*20>=reader.data.total} onClick={()=>setCandidatePage(value=>value+1)}>下一页</Button></div>}
        </Form.Item>
      </>}
      <Form.Item name="reason" label={edit.operation==='create'?'设置原因':'撤销原因'} rules={[{required:true,whitespace:true,message:'请填写原因'},{max:2000,message:'原因最多2000字'}]}><Input.TextArea aria-label="代理维护原因" rows={3} maxLength={2000} /></Form.Item>
    </Form>
    {error&&<Alert type={unknown?'warning':'error'} showIcon title={unknown?'提交结果待确认':'操作未完成'} description={error} />}
    {preview&&!receipt&&<div className="oxa-delegation-preview"><h3>核对本次变更</h3><p>{preview.after.delegatorDisplayName} → {preview.after.delegateDisplayName} · {preview.after.roleName}</p>
      <p>{edit.operation==='create'?`${time(preview.after.validFrom)} 至 ${time(preview.after.validTo)}`:`规则 r${preview.before?.revision} → r${preview.after.revision}，状态变为已撤销`}</p><p>{preview.after.reason}</p>
      {proposal?.operation==='revoke'&&<p>撤销原因：{proposal.reason}</p>}<p className="oxa-workflow-config-help">提交前会再次验证当前资格及修订。</p></div>}
    {unknown&&proposal&&<p className="oxa-workflow-config-help">原操作编号：<code>{proposal.operationId}</code>。核对未找到回执时，不代表尚未提交。</p>}
    {receipt&&<Alert type="success" showIcon title={receipt.operation==='create'?'代理规则已设置':'代理规则已撤销'} description={`已取得原操作回执，规则修订 r${receipt.delegation.revision}。当前状态请以刷新后的列表为准。`} />}
  </Drawer>;
}
