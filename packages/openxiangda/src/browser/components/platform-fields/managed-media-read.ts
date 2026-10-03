import type {DataFilePreview} from 'openxiangda-contracts/browser';

/** One mounted player owns one transient read. Cancellation prevents late
 * content from creating a URL; every created URL has exactly one disposer. */
export function startManagedMediaRead(deps:{
  preview():Promise<DataFilePreview>;content():Promise<Blob>;maxBytes:number;
  createUrl(blob:Blob):string;revokeUrl(url:string):void;
  ready(value:{src:string;preview:DataFilePreview}):void;failed(error:unknown):void;
}){
  let active=true,url='';
  const completion=(async()=>{
    try{
      const preview=await deps.preview();if(!active)return;
      if(!preview.canPreview||preview.renderMode!=='inline'||!['video','audio'].includes(preview.previewType))throw new Error(preview.unsupportedReason||'当前文件无法播放，请使用附件下载');
      if(!Number.isSafeInteger(preview.file.size)||preview.file.size<1||preview.file.size>deps.maxBytes)throw new Error('媒体超出当前播放器容量，请下载后播放');
      const blob=await deps.content();if(!active)return;
      if(blob.size!==preview.file.size)throw new Error('媒体内容与平台文件大小不一致，请重新读取');
      url=deps.createUrl(blob);deps.ready({src:url,preview});
    }catch(error){if(active)deps.failed(error);}
  })();
  return {completion,dispose(){active=false;if(url){deps.revokeUrl(url);url='';}}};
}
