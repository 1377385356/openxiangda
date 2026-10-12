import { useEffect, useState } from 'react';
import { Button, Checkbox, InputNumber, Select, Space } from 'antd';
import type { WorkflowReminders } from 'openxiangda-contracts/browser';

const units = [{ value: 1, label: '秒' }, { value: 60, label: '分钟' }, { value: 3600, label: '小时' }, { value: 86400, label: '天' }];
const displayUnit = (seconds: number) => seconds % 86400 === 0 ? 86400 : seconds % 3600 === 0 ? 3600 : seconds % 60 === 0 ? 60 : 1;
const sameRule = (a?: WorkflowReminders, b?: WorkflowReminders) => a && b ? a.afterSeconds === b.afterSeconds && a.everySeconds === b.everySeconds && a.max === b.max : a === b;
const describeDuration = (seconds: number) => { const unit = displayUnit(seconds); return `${seconds / unit} ${units.find(item => item.value === unit)!.label}`; };

/** Confirming edits only updates the canonical draft; the deadline worker owns delivery. */
export function WorkflowReminderEditor({ rule, disabled, onChange, onDirtyChange }: {
  rule?: WorkflowReminders; disabled: boolean; onChange: (rule: WorkflowReminders | undefined) => void; onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<WorkflowReminders | undefined>(() => rule && structuredClone(rule));
  const [afterUnit, setAfterUnit] = useState(() => displayUnit(rule?.afterSeconds || 86400));
  const [everyUnit, setEveryUnit] = useState(() => displayUnit(rule?.everySeconds || 86400));
  useEffect(() => { setDraft(rule && structuredClone(rule)); }, [rule]);
  const update = (patch: Partial<WorkflowReminders>) => setDraft(value => value && { ...value, ...patch });
  const dirty = !sameRule(draft, rule);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const durationInput = (field: 'afterSeconds' | 'everySeconds', unit: number, setUnit: (unit: number) => void, label: string) => <Space.Compact>
    <InputNumber aria-label={label} disabled={disabled} min={1 / unit} max={2592000 / unit} step={1} value={draft![field] / unit}
      onChange={value => { if (typeof value === 'number' && Number.isFinite(value)) update({ [field]: Math.max(1, Math.min(2592000, Math.round(value * unit))) }); }} />
    <Select aria-label={`${label}单位`} disabled={disabled} value={unit} options={units} onChange={setUnit} />
  </Space.Compact>;
  return <section className="oxa-workflow-reminder-editor" aria-label="办理提醒配置">
    <h3>时限 · 提醒</h3>
    <Checkbox disabled={disabled} checked={!!draft} onChange={event => setDraft(event.target.checked ? { afterSeconds: 86400, everySeconds: 86400, max: 3, to: ['handlers'] } : undefined)}>未处理时提醒</Checkbox>
    {draft && <div className="oxa-workflow-reminder-fields">
      <div><span>进入节点后</span>{durationInput('afterSeconds', afterUnit, setAfterUnit, '首次提醒延迟')}<span>未处理时提醒</span></div>
      <div><span>共提醒</span><InputNumber aria-label="最多提醒次数" disabled={disabled} min={1} max={10} precision={0} value={draft.max} onChange={value => { if (typeof value === 'number') update({ max: value }); }} /><span>次，每隔</span>{durationInput('everySeconds', everyUnit, setEveryUnit, '重复提醒间隔')}</div>
      <div><span>提醒对象</span><Checkbox checked disabled>当前处理人</Checkbox></div>
      <p className="oxa-workflow-reminder-summary">{describeDuration(draft.afterSeconds)}后仍未处理时提醒，每隔{describeDuration(draft.everySeconds)}提醒一次，最多 {draft.max} 次。</p>
    </div>}
    <p className="oxa-workflow-config-help">任务完成后停止提醒。此设置随流程草稿发布；已进入的任务保持原提醒规则。</p>
    {!disabled && <footer><Button disabled={!dirty} onClick={() => setDraft(rule && structuredClone(rule))}>取消</Button><Button type="primary" disabled={!dirty} onClick={() => onChange(draft && structuredClone(draft))}>确定</Button></footer>}
  </section>;
}
