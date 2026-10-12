import { useLocation } from 'react-router-dom';
import { GeneratedResourcePage, type ResourcePageProps } from 'openxiangda/resource';
/** Editable task-page composition, using the same platform access boundary. */
export function UserResourcePage({resourceCode,mode}:{resourceCode:string;mode:ResourcePageProps['mode']}){const mobile=useLocation().pathname.startsWith('/m/');const base=(mobile?'/m':'')+'/my/'+resourceCode;return <GeneratedResourcePage resourceCode={resourceCode} mode={mode} variant={mobile?'mobile':'desktop'} paths={{fallback:base,list:base,create:base+'/submit',detail:base+'/:id',edit:base+'/:id/edit'}}/>;}
