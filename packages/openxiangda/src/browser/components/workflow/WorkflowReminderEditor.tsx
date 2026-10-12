import { Checkbox, InputNumber } from 'antd';
import type { WorkflowReminders } from 'openxiangda-contracts/browser';
export function WorkflowReminderEditor({rule,disabled,onChange}: {rule?: WorkflowReminders;disabled:boolean;onChange:(rule:WorkflowReminders|undefined)=>void}) {
  const update=(patch:Partial<WorkflowReminders>)=>rule && onChange({...rule,...patch});
  return <section><h3>办理提醒</h3><Checkbox disabled={disabled} checked={!!rule} onChange={event=>onChange(event.target.checked?{afterSeconds:86400,everySeconds:86400,max:3,to:['handlers']}:undefined)}>提醒当前办理人</Checkbox>{rule && <>
    <label>进入节点后（分钟）<InputNumber disabled={disabled} min={1} max={43200} value={rule.afterSeconds/60} onChange={value=>value!==null && update({afterSeconds:Math.round(value*60)})} /></label>
    <label>之后每隔（分钟）<InputNumber disabled={disabled} min={1} max={43200} value={rule.everySeconds/60} onChange={value=>value!==null && update({everySeconds:Math.round(value*60)})} /></label>
    <label>最多提醒（次）<InputNumber disabled={disabled} min={1} max={10} precision={0} value={rule.max} onChange={value=>value!==null && update({max:value})} /></label>
    <p>任务完成后停止提醒。已进入的任务保持原规则，后续进入的任务使用新规则。</p>
  </>}</section>;
}
