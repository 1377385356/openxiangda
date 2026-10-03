import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, Button, ConfigProvider, Form, Grid, Radio, Space } from 'antd';
import { MobileSurfaceFieldControl, SurfaceFieldControl } from 'openxiangda/field-kit';
import 'openxiangda/react/styles.css';

function Fixture() {
  const [form] = Form.useForm();
  const values = Form.useWatch([], form);
  const screens = Grid.useBreakpoint();
  const [mode, setMode] = useState('update');
  const [multiple, setMultiple] = useState(true);
  const [notice, setNotice] = useState('');
  const [queries, setQueries] = useState<string[]>([]);
  useEffect(() => {
    const observed = (event: { phase: string; keyword: string }) => setQueries(items => [...items.slice(-9), `${event.phase} ${event.keyword || '全部'}`]);
    import.meta.hot?.on('candidate-query-observed', observed);
    return () => import.meta.hot?.off('candidate-query-observed', observed);
  }, []);
  const Control = screens.md ? SurfaceFieldControl : MobileSurfaceFieldControl;
  const control = async (action: string, label: string) => { await fetch('/fixture-control', { method: 'POST', body: JSON.stringify({ action }) }); setNotice(label); };
  const field: any = { key: 'leaders', label: '单位负责人', type: multiple ? 'user.multiple' : 'user.single', widget: 'directory-user',
    readCapabilities: [], createCapabilities: [], updateCapabilities: [],
    userCandidates: { kind: 'app-role', roleCode: 'unit-leader', pageSize: 2, scope: { dimensionCode: 'college', operation: 'approve', field: 'college' } } };
  return <main style={{ maxWidth: 900, margin: '24px auto', padding: '0 20px', fontFamily: 'system-ui' }}>
    <h1 style={{ fontSize: 24 }}>受限选人组件验证</h1>
    <p>本页使用合成响应验证组件交互，不代表真实业务或授权验收。</p>
    <Radio.Group value={mode} onChange={event => setMode(event.target.value)} options={[
      { label: '普通表单', value: 'update' }, { label: '任务补填', value: 'task' }, { label: '未保存范围', value: 'create' }, { label: '缺少任务版本', value: 'missing-task' },
    ]} />
    <div style={{ marginTop: 12 }}><Radio.Group value={multiple} onChange={event => { setMultiple(event.target.value); form.setFieldValue('leaders', event.target.value ? [] : null); }}
      options={[{ label: '多人选择', value: true }, { label: '单人选择', value: false }]} /></div>
    <Form form={form} layout="vertical" initialValues={{ leaders: [] }} style={{ marginTop: 24 }}>
      <Control field={field} operation={mode === 'create' ? 'create' : 'update'} resourceCode="requests" recordId="record-1" expectedRevision={7} disabled={false}
        workflowCandidateBinding={mode === 'task' || mode === 'missing-task' ? { taskId: 'task-1', expectedTaskVersion: mode === 'task' ? 2 : undefined } : undefined} />
    </Form>
    <Space wrap>
      <Button onClick={() => form.setFieldValue('leaders', multiple ? [{ value: 'departed', label: '已离岗老师' }] : { value: 'departed', label: '已离岗老师' })}>载入失效旧选择</Button>
      <Button onClick={() => void control('fail-next', '下次查询将失败一次')}>下一次查询失败</Button>
      <Button onClick={() => void control('revoke-confirm', '确认时撤销陈老师 member-001')}>确认前撤销测试</Button>
      <Button onClick={() => { form.setFieldValue('leaders', multiple ? [] : null); void control('reset', '已重置'); }}>重置</Button>
    </Space>
    <p role="status">{notice}</p><h2 style={{ fontSize: 16 }}>表单已确认的值</h2>
    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} aria-label="表单值">{JSON.stringify(values || {}, null, 2)}</pre>
    <div aria-label="查询证据">{queries.map((query, index) => <div key={index}>{query}</div>)}</div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider><App><Fixture /></App></ConfigProvider>);
