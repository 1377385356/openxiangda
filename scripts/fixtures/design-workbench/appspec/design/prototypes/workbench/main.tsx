import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, App, Button, Empty, Input, Segmented, Select, Skeleton, Tag } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, CheckOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { OpenXiangdaUiProvider } from 'openxiangda/react';
import { ResourceFormContent, ResourceFormDrawer, type SurfaceField } from 'openxiangda/field-kit';
import { MobileSurface } from 'openxiangda/mobile';
import tokenSource from '../../system/tokens.css?raw';
import '../../system/tokens.css';
import './layout.css';
import { ProviderProbe } from './provider-probe';

// An example build adapter: numeric values are authored only in tokens.css.
const tokens = Object.fromEntries([...tokenSource.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()]));
const designTheme = { token: { colorPrimary: tokens.accent, colorText: tokens.fg,
  colorTextSecondary: tokens.muted, colorBorder: tokens.border, colorBgLayout: tokens.bg,
  colorError: tokens.danger, colorWarning: tokens.warn, colorSuccess: tokens.success,
  fontFamily: tokens['font-body'], fontSize: Number(tokens['font-size']), lineHeight: Number(tokens['line-height']),
  borderRadius: Number(tokens.radius), controlHeight: Number(tokens['control-height']) },
  cssVar: { key: 'oxa-workbench-tokens' } };

const seed = [
  { id: 'DEMO-018', title: '更新项目协作信息', category: '信息维护', status: '待办理', date: '2026-09-15', description: '补充本次协作的安排与完成日期，方便参与成员了解下一步。', owner: '示例工作组', note: '协作范围和联系信息已准备好，填写办理记录后完成本次事项。' },
  { id: 'DEMO-019', title: '完善团队联系资料', category: '资料补充', status: '待补充', date: '2026-09-17', description: '核对联系资料并说明本次更新内容。', owner: '示例工作组', note: '缺少一项联系说明；可以先保存已知内容，再补充完整。' },
  { id: 'DEMO-020', title: '确认场地使用安排', category: '安排确认', status: '待办理', date: '2026-09-18', description: '填写使用安排和备注，确认参与人员能获取必要信息。', owner: '示例协作组', note: '请核对日期；本样例不创建真实预约或发送通知。' },
  { id: 'DEMO-021', title: '归档阶段工作记录', category: '记录整理', status: '已完成', date: '2026-09-10', description: '整理阶段记录并保留办理说明。', owner: '示例协作组', note: '本条用于查看已完成事项的只读状态。' },
];
const fields: SurfaceField[] = [
  { key: 'title', label: '事项名称', type: 'text.short', widget: 'text', requiredHint: true, maxLength: 120 },
  { key: 'date', label: '完成日期', type: 'date', widget: 'date', requiredHint: true },
  { key: 'priority', label: '优先级', type: 'option.single', widget: 'select', options: [{ label: '正常办理', value: 'normal' }, { label: '优先处理', value: 'urgent' }], requiredHint: true },
  { key: 'notes', label: '办理说明', type: 'text.long', widget: 'textarea', maxLength: 400 },
].map(field => ({ ...field, readCapabilities: ['demo:view'], createCapabilities: ['demo:write'], updateCapabilities: ['demo:write'] })) as SurfaceField[];

function Workbench({ designed, setDesigned }: { designed: boolean; setDesigned(value: boolean): void }) {
  const { message, modal } = App.useApp();
  const [items, setItems] = useState(seed);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('待办理');
  const [current, setCurrent] = useState(seed[0]);
  const [opened, setOpened] = useState(false);
  const [editor, setEditor] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [scenario, setScenario] = useState('normal');
  const [mobile, setMobile] = useState(false);
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (opened) detailTitle.current?.focus(); }, [opened, current]);
  const visible = scenario === 'empty' ? [] : items.filter(item =>
    (filter === '全部' || (filter === '待办理' ? item.status !== '已完成' : item.status === filter)) && item.title.includes(query));

  function close() {
    if (pending) return;
    if (dirty) modal.confirm({ title: '放弃未保存的内容？', content: '继续填写可以保留当前输入，放弃后将关闭表单。',
      okText: '放弃更改', cancelText: '继续填写', onOk: () => { setEditor(false); setDirty(false); } });
    else setEditor(false);
  }
  function submit(values: Record<string, unknown>) {
    if (pending) return;
    setPending(true); setError('');
    timer.current = setTimeout(() => {
      setPending(false);
      if (scenario === 'save-error') { setError('演练服务暂时不可用，输入已保留。恢复示例服务后可再次提交。'); return; }
      const next = { ...current, title: String(values.title), date: String(values.date), status: '已完成', note: String(values.notes || '已完成办理。') };
      setItems(previous => previous.map(item => item.id === current.id ? next : item)); setCurrent(next);
      setDirty(false); setEditor(false); void message.success('示例记录已保存');
    }, 650);
  }
  function begin() { setMobile(matchMedia('(max-width: 760px)').matches); setError(''); setDirty(false); setEditor(true); }
  return <div className="workbench-layout">
    <header className="masthead"><div className="identity"><span className="identity-mark" aria-hidden="true">办</span><span>事项中心</span></div><span className="sample-label"><span>交互样例</span><span>全部为示例数据</span></span></header>
    <main>
      <div className="page-intro"><div><p className="eyebrow">日常协作 / 我的工作台</p><h1>把每一件事，办妥。</h1><p className="intro-copy">找到需要处理的事项，查看资料，再完成办理记录。</p></div><span className="edition">WORKSPACE<br/><strong>日常办理</strong></span></div>
      <div className={`workspace-grid ${opened ? 'is-open' : ''}`}>
        <section className="list-panel" aria-labelledby="list-title">
          <div className="section-heading"><h2 id="list-title">我的事项</h2><span>{visible.length} 项示例</span></div>
          <Segmented aria-label="事项范围" value={filter} onChange={value => setFilter(String(value))} options={['待办理', '已完成', '全部']} block />
          <Input className="search" aria-label="搜索事项" placeholder="搜索事项名称" prefix={<SearchOutlined />} value={query} onChange={event => setQuery(event.target.value)} allowClear />
          <div className="records" aria-busy={scenario === 'loading'}>
            {scenario === 'loading' ? <div className="state-box" role="status"><Skeleton active paragraph={{ rows: 5 }} /><p>正在载入示例事项。可从下方演练切回正常状态。</p></div>
            : scenario === 'error' ? <div className="state-box"><Alert type="error" showIcon title="事项暂时无法载入" description="这是网络失败演练。其他页面内容仍可使用。" /><Button onClick={() => setScenario('normal')}>重新加载</Button></div>
            : scenario === 'forbidden' ? <div className="state-box"><Alert type="warning" showIcon title="暂时没有查看权限" description="这是拒绝路径演练，未将拒绝显示成空数据。" /><Button onClick={() => setScenario('normal')}>返回可访问示例</Button></div>
            : !visible.length ? <div className="state-box"><Empty description={query ? `没有找到“${query}”` : '当前没有待办理事项'} /><Button onClick={() => { setQuery(''); setFilter('全部'); setScenario('normal'); }}>查看全部示例</Button></div>
            : visible.map(item => <button className={`record ${current.id === item.id ? 'selected' : ''}`} key={item.id} aria-pressed={current.id === item.id} onClick={() => { setCurrent(item); setOpened(true); }}>
                <span className="record-top"><span>{item.category}</span><span className={`status status-${item.status === '待补充' ? 'warning' : 'normal'}`}>{item.status}</span></span>
                <strong>{scenario === 'long' ? `${item.title}：需要多方核对并补充完整说明的较长事项名称，以验证中文标题换行和信息保持完整` : item.title}</strong>
                <span className="record-bottom"><span>{item.date} 前完成</span><ArrowRightOutlined /></span>
              </button>)}
          </div>
          <p className="list-note">办理结果保留在事项记录中，方便之后查阅。</p>
        </section>
        <section className="detail-panel" aria-labelledby="detail-title">
          <Button aria-label="返回事项" className="back-to-list" icon={<ArrowLeftOutlined />} onClick={() => { setOpened(false); document.getElementById('list-title')?.scrollIntoView(); }}>返回事项</Button>
          <div className="detail-eyebrow"><span>事项详情</span><span>{current.id}</span></div>
          <h2 ref={detailTitle} tabIndex={-1} id="detail-title">{current.title}</h2>
          <p className="detail-description">{current.description}</p>
          <dl className="facts"><div><dt>当前状态</dt><dd><Tag color={current.status === '待补充' ? 'gold' : 'default'}>{current.status}</Tag></dd></div><div><dt>计划完成</dt><dd>{current.date}</dd></div><div><dt>负责团队</dt><dd>{current.owner}</dd></div><div><dt>事项分类</dt><dd>{current.category}</dd></div></dl>
          <div className="detail-note"><h3>办理前，请先了解</h3><p>{current.note}</p></div>
          <div className="activity"><h3>办理进度</h3><ol><li><span className="activity-dot done"><CheckOutlined /></span><div><strong>事项已准备</strong><p>示例资料已整理，可以开始办理。</p></div></li><li><span className={`activity-dot ${current.status === '已完成' ? 'done' : ''}`}>{current.status === '已完成' ? <CheckOutlined /> : '2'}</span><div><strong>{current.status === '已完成' ? '办理记录已完成' : '等待填写办理记录'}</strong><p>{current.status === '已完成' ? current.note : '核对内容后提交，完成本次协作。'}</p></div></li></ol></div>
          <div className="detail-actions"><span>本地样例，不发送业务请求</span><Button aria-label="填写办理记录" type="primary" icon={<PlusOutlined />} disabled={current.status === '已完成' || scenario === 'forbidden'} onClick={begin}>填写办理记录</Button></div>
        </section>
      </div>
    </main>
    <footer className="preview-tools"><span>设计能力样例 / OpenXiangda × OpenDesign</span><details><summary>查看状态与组件对照</summary><div className="sample-controls"><label>状态演练 <Select aria-label="状态演练" value={scenario} onChange={setScenario} options={[['normal', '正常'], ['empty', '空列表'], ['loading', '载入中'], ['error', '载入失败'], ['forbidden', '无权限'], ['save-error', '保存失败'], ['long', '长标题']].map(([value, label]) => ({ value, label }))} /></label><label>主题对照 <Segmented aria-label="主题对照" value={designed ? '应用设计' : '组件默认'} options={['应用设计', '组件默认']} onChange={value => setDesigned(value === '应用设计')} /></label></div></details></footer>
    <ResourceFormDrawer mode="edit" title="办理记录" open={editor} busy={pending} onClose={close} onClosed={() => setDirty(false)}>
      {editor && <MobileSurface className="design-form"><div className="form-intro"><h2>填写办理记录</h2><p>核对事项和日期，补充本次办理说明。</p></div>
        <ResourceFormContent variant={mobile ? 'mobile' : 'desktop'} mode="edit" resourceCode="design-demo" groups={[{ section: 'default', fields }]} busy={pending} pending={pending} initialValues={{ title: current.title, date: current.date, priority: { label: '正常办理', value: 'normal' } }}
          error={error} feedback={error && scenario === 'save-error' ? <Button onClick={() => setScenario('normal')}>恢复示例服务</Button> : undefined} canWriteField={() => true} onValuesChange={() => setDirty(true)} onSubmit={submit} submitLabel="保存办理记录" actions={<Button onClick={close} disabled={pending}>取消</Button>} />
      </MobileSurface>}
    </ResourceFormDrawer>
  </div>;
}

function Preview() {
  const [designed, setDesigned] = useState(true);
  return <OpenXiangdaUiProvider className="design-workbench" theme={designed ? designTheme : undefined}>
    <Workbench designed={designed} setDesigned={setDesigned} />
  </OpenXiangdaUiProvider>;
}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('provider-probe') ? <ProviderProbe /> : <Preview />);
