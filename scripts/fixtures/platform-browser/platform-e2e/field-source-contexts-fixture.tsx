import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App, Button, ConfigProvider, Form } from 'antd';
import { MobileSurfaceFieldControl, SurfaceFieldControl, SurfaceFilterControl, type SurfaceField } from '../../../../packages/openxiangda/src/browser/components/resource/SurfaceFields';
import '../../../../packages/openxiangda/dist/browser/styles.css';

const reference = { key: 'customer', label: '关联记录', type: 'resource-ref.single', widget: 'resource',
  readCapabilities: [], createCapabilities: [], updateCapabilities: [], source: { kind: 'resource', resourceCode: 'customers', labelField: 'name',
    filters: [{ field: 'team', operator: 'eq', binding: { kind: 'field', field: 'team' } }] } } as SurfaceField;
const user = { key: 'owner', label: '办理成员', type: 'user.single', widget: 'directory-user',
  readCapabilities: [], createCapabilities: [], updateCapabilities: [] } as SurfaceField;
const recordId = '11111111-1111-4111-8111-111111111111';
function Fixture() {
  const mobile = new URLSearchParams(location.search).has('mobile');
  const [form] = Form.useForm();
  const [bindings, setBindings] = useState<Record<string, unknown>>({});
  const [revision, setRevision] = useState(5);
  const [filter, setFilter] = useState<unknown>();
  const [member, setMember] = useState<unknown>();
  const Control = mobile ? MobileSurfaceFieldControl : SurfaceFieldControl;
  return <ConfigProvider><App><main style={{ padding: 16, maxWidth: 1100, margin: 'auto' }}>
    <h1>关联筛选与保存上下文</h1>
    <section data-reference-filter><h2>只读列表筛选</h2><SurfaceFilterControl field={reference} resourceCode="orders" value={filter} onChange={setFilter} /></section>
    <section data-directory-filter style={{ marginTop: 20 }}><h2>历史成员筛选</h2><SurfaceFilterControl field={user} resourceCode="orders" value={member} onChange={setMember} /></section>
    <section data-record-form style={{ marginTop: 20 }}><h2>普通更新关联选择</h2><p>记录版本：{revision}。保存绑定不在浏览器。</p>
      <Form form={form} layout="vertical"><Control field={reference} operation="update" resourceCode="orders" recordId={recordId} expectedRevision={revision}
        disabled={false} renderers={{ referenceBindings: bindings }} /></Form>
      <Button onClick={() => setBindings({ team: { label: '新范围', value: 'west' } })}>修改绑定</Button>
      <Button onClick={() => setBindings({ team: null })}>清空绑定</Button>
      <Button onClick={() => setRevision(6)}>切换版本</Button>
    </section>
  </main></App></ConfigProvider>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<Fixture />);
