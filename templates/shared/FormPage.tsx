import { ResourceFormBlock, type ResourcePageProps } from 'openxiangda/resource';
/** Replace this composition or build on public Field Kit controls. */
export function FormPage(props:ResourcePageProps){return <section data-app-resource-form><ResourceFormBlock {...props} mode={props.mode==='edit'?'edit':'create'}/></section>;}
