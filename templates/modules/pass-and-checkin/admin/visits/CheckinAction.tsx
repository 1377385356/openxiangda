import { App, Button } from 'antd';
import { useState } from 'react';
import { createNativeResourceClient, useResourceDefinitions } from 'openxiangda/resource';
export function CheckinAction({record,refresh}:{record:Readonly<Record<string,unknown>>;refresh():Promise<unknown>}){
 const definitions=useResourceDefinitions();
 const [busy,setBusy]=useState(false);const {message}=App.useApp();
 const status=record.status as {value?:string}|undefined;
 if(typeof record.id!=='string'||typeof record.revision!=='number'||!definitions.visits)return null;
 if(status?.value==='arrived'||status?.value==='left'||status?.value==='cancelled')return null;
 return <Button type="link" size="small" loading={busy} onClick={()=>{if(busy)return;setBusy(true);void createNativeResourceClient('visits',definitions.visits!.surface).update(String(record.id),Number(record.revision),{status:{value:'arrived',label:'已到访'}}).then(()=>message.success('已登记到访'),error=>message.error(error instanceof Error?error.message:'登记失败，请先刷新核对状态')).finally(()=>{void refresh();setBusy(false);});}}>登记到访</Button>;
}
