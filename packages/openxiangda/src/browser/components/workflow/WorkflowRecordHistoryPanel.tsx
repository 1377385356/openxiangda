import { useEffect, useState } from 'react';
import type { WorkflowRecordHistory } from 'openxiangda-contracts/browser';
import { loadWorkflowRecordHistory, OpenXiangdaPlatformRequestError } from '../../platform-client';
import { usePresentationTimeZone } from '../../presentation-time';
import { detailTime } from '../resource/RecordDetailFrame';

export interface WorkflowRecordHistoryPanelProps {
  resourceCode: string;
  recordId: string;
  instanceId?: string;
  variant?: 'desktop' | 'mobile';
}

const statusLabels: Record<string, string> = {
  running: '办理中', active: '办理中', assigned: '待办理', entered: '办理中',
  waiting: '等待办理', pending: '等待办理', completed: '已完成', approved: '已通过',
  rejected: '已拒绝', returned: '已退回', withdrawn: '已撤回', terminated: '已终止',
  skipped: '已跳过', cancelled: '已取消', transferred: '已转交', failed: '处理失败',
};

/** Read-only in both surfaces; server permission failures immediately clear prior data. */
export function WorkflowRecordHistoryPanel({ resourceCode, recordId, instanceId, variant = 'desktop' }: WorkflowRecordHistoryPanelProps) {
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{ key: string; data?: WorkflowRecordHistory; error?: string }>({ key: '' });
  const subject = JSON.stringify([resourceCode, recordId, instanceId]);
  const [pageSubject, setPageSubject] = useState(subject);
  // A record switch never inherits a previous record's page or visible response.
  const pageOffset = pageSubject === subject ? offset : 0;
  const requestKey = JSON.stringify([subject, pageOffset, reload]);
  const timeZone = usePresentationTimeZone();
  const time = (value: string | null) => detailTime(value, timeZone) || '时间未记录';
  useEffect(() => {
    let active = true;
    setState({ key: requestKey });
    void loadWorkflowRecordHistory(resourceCode, recordId, { instanceId, limit: 20, offset: pageOffset })
      .then(data => { if (active) setState({ key: requestKey, data }); })
      .catch(error => {
        if (!active) return;
        const status = error instanceof OpenXiangdaPlatformRequestError ? error.status : 0;
        const message = status === 403 ? '当前用户无权查看此申请的办理记录。'
          : status === 404 ? '没有可查看的流程记录。'
          : status === 409 ? '申请或流程已变化，请重新读取。'
          : status === 413 ? '记录较多，暂时无法在此页面显示。'
          : '办理记录读取失败，请重试。';
        setState({ key: requestKey, error: message });
      });
    return () => { active = false; };
  }, [resourceCode, recordId, instanceId, pageOffset, requestKey]);
  const data = state.key === requestKey ? state.data : undefined;
  const error = state.key === requestKey ? state.error : undefined;
  const page = (next: number) => { setPageSubject(subject); setOffset(next); };
  return <section className="oxa-workflow-record-history" data-device={variant} aria-label="流程办理记录" aria-busy={!data && !error}>
    {!data && !error ? <p role="status">正在读取办理记录…</p>
      : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setReload(value => value + 1)}>重新读取</button></div>
      : data && <>
        <div className="oxa-workflow-record-history-heading"><span>{statusLabels[data.instance.status] || data.instance.status} · 流程第 {data.instance.version} 版</span>
          <button type="button" onClick={() => setReload(value => value + 1)}>刷新</button></div>
        <ol className="oxa-workflow-record-history-nodes">
          {data.visits.map(visit => <li key={visit.id}>
            <div><strong>{visit.title}</strong><span>{statusLabels[visit.status] || visit.status}</span></div>
            <time>{time(visit.completedAt || visit.enteredAt)}</time>
            {visit.people.map((person, index) => <div className="oxa-workflow-record-history-person" key={`${person.userId}:${index}`}>
              <span>{person.displayName} · {statusLabels[person.outcome || person.status] || person.status}</span>
              {person.comment && <p>{person.comment}</p>}
            </div>)}
          </li>)}
        </ol>
        <h4>操作记录（{data.total}）</h4>
        {data.items.length ? <ol className="oxa-workflow-record-history-operations">
          {data.items.map(item => <li key={item.id}>
            <div><strong>{item.operationLabel}</strong><span>{item.actor.displayName}</span></div>
            <time>{time(item.occurredAt)}</time>
            {item.reason && <p>{item.reason}</p>}
          </li>)}
        </ol> : <p>暂无操作记录</p>}
        <nav aria-label="办理记录分页" className="oxa-workflow-record-history-pagination">
          <button type="button" disabled={data.offset === 0} onClick={() => page(Math.max(0, data.offset - data.limit))}>上一页</button>
          <span>第 {Math.floor(data.offset / data.limit) + 1} 页</span>
          <button type="button" disabled={!data.hasMore} onClick={() => page(data.offset + data.limit)}>下一页</button>
        </nav>
      </>}
  </section>;
}
