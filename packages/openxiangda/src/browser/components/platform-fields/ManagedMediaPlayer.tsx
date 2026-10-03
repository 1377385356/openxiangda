import {Alert,Button,Spin} from 'antd';
import {useEffect,useState} from 'react';
import type {DataFileRef,DataFilePreview} from 'openxiangda-contracts/browser';
import {fetchDataFileBlob,fetchWorkflowDataFileBlob,loadDataFilePreview,loadWorkflowDataFilePreview,type WorkflowFileBinding} from '../../platform-client';
import {useRuntime} from '../../runtime';
import {startManagedMediaRead} from './managed-media-read';

type Props={file:DataFileRef;resourceCode:string;workflowBinding?:WorkflowFileBinding;className?:string;maxSizeMb?:number};
export function ManagedMediaPlayer(props:Props){
  const {identityEpoch}=useRuntime();
  const key=JSON.stringify([identityEpoch,props.resourceCode,props.file.id,props.workflowBinding,props.maxSizeMb]);
  return <ActiveManagedMediaPlayer {...props} key={key}/>;
}
function ActiveManagedMediaPlayer({file,resourceCode,workflowBinding,className,maxSizeMb=100}:Props){
  const [media,setMedia]=useState<{src:string;preview:DataFilePreview}>();
  const [error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    setMedia(undefined);setError('');
    if(!Number.isFinite(maxSizeMb)||maxSizeMb<=0){setError('媒体容量配置无效');return;}
    const read=startManagedMediaRead({
      preview:()=>workflowBinding?loadWorkflowDataFilePreview(workflowBinding,file.id):loadDataFilePreview(resourceCode,file.id),
      content:()=>workflowBinding?fetchWorkflowDataFileBlob(workflowBinding,file.id):fetchDataFileBlob(resourceCode,file.id),
      maxBytes:maxSizeMb*1024*1024,createUrl:blob=>URL.createObjectURL(blob),revokeUrl:url=>URL.revokeObjectURL(url),
      ready:setMedia,failed:reason=>setError(reason instanceof Error?reason.message:String(reason)),
    });
    return ()=>read.dispose();
  },[attempt,file.id,resourceCode,workflowBinding,maxSizeMb]);
  if(error)return <Alert role="alert" type="error" title="媒体读取失败" description={error} action={<Button size="small" onClick={()=>setAttempt(value=>value+1)}>重新读取</Button>}/>;
  if(!media)return <Spin description="正在确认文件权限并读取媒体"/>;
  return <ManagedMediaElement src={media.src} kind={media.preview.previewType==='video'?'video':'audio'} name={media.preview.file.name} className={className}/>;
}
/** Shared rendering for already authorized content in the standard preview. */
export function ManagedMediaElement({src,kind,name,className}:{src:string;kind:'video'|'audio';name:string;className?:string}){
  return kind==='video'?<video aria-label={name} className={className} controls playsInline preload="metadata" src={src} style={{maxWidth:'100%'}}/>:
    <audio aria-label={name} className={className} controls preload="metadata" src={src}/>;
}
