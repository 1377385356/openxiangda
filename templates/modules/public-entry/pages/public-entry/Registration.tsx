import { Alert, Button, Form, Result, Spin } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createBrowserUuid } from 'openxiangda/core';
import { createAnonymousPublicClient } from 'openxiangda/react';
import { useResourceDefinitions } from 'openxiangda/resource';
import { SurfaceFieldControl, normalizeRecordForForm, normalizeFormValues } from 'openxiangda/field-kit';
const publicFields=['visitorName','company','area','arriveAt','purpose'];
export function Registration(){
 const [form]=Form.useForm();const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [receipt,setReceipt]=useState<string>();
 const draft=useRef(0);const attempt=useRef<{key:string;revision:number} | undefined>(undefined);
 const surface=useResourceDefinitions().visits?.surface;
 const client=useMemo(()=>createAnonymousPublicClient({routeCode:'visitor-registration',policyCode:'visitor-public-entry'}),[]);
 useEffect(()=>{let active=true;void client.bootstrap().then(session=>{if(!active)return;if(!session.draft)throw new Error('登记草稿暂不可用');draft.current=session.draft.revision;if(surface)form.setFieldsValue(normalizeRecordForForm(session.draft.data,surface));setReady(true);}).catch(reason=>active&&setError(reason instanceof Error?reason.message:'登记入口暂不可用'));return()=>{active=false;};},[client,form,surface]);
 const submit=async(values:Record<string,unknown>)=>{if(busy||!surface)return;setBusy(true);setError('');try{
  if(!attempt.current){const saved=await client.saveDraft(draft.current,normalizeFormValues(values,surface));draft.current=saved.revision;attempt.current={key:createBrowserUuid(),revision:saved.revision};}
  const result=await client.submit(attempt.current.revision,attempt.current.key);setReceipt(result.recordId);
 }catch(reason){setError(reason instanceof Error?reason.message:'提交结果暂未确认，请重试原提交');}finally{setBusy(false);}};
 if(receipt)return <Result status="success" title="登记已提交" subTitle="请按预约时间到达接待区域，前台将核对您的信息。"/>;
 if(!surface)return <Result status="error" title="登记入口暂不可用"/>;
 return <section className="app-home-card"><p className="app-eyebrow">来访登记</p><h1>期待您的到来</h1><p className="app-muted">填写到访信息，方便前台接待。</p>{error&&<Alert role="alert" type="error" title={error}/>}<Form form={form} layout="vertical" onFinish={submit} disabled={busy||!ready}>
 {publicFields.map(key=><SurfaceFieldControl key={key} field={{key,...surface.fields[key]!}} resourceCode="visits" operation="create" disabled={busy||!ready||Boolean(attempt.current)}/>)}
 {!ready&&!error&&<Spin/>}<Button htmlType="submit" type="primary" block disabled={!ready} loading={busy}>{attempt.current?'重试原提交':'提交登记'}</Button></Form></section>;
}
