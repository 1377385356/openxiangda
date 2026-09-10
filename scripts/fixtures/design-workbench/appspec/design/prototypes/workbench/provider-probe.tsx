import { useState } from 'react';
import { App, Button, Input, Select, theme } from 'antd';
import { OpenXiangdaUiProvider } from 'openxiangda/react';
import { MobileSurface, Button as MobileButton } from 'openxiangda/mobile';

function Fields() {
  const [value, setValue] = useState('');
  const { modal, message, notification } = App.useApp();
  const { token } = theme.useToken();
  return <div>
    <output aria-label="实际主色">{token.colorPrimary}</output>
    <Input aria-label="保留输入" value={value} onChange={event => setValue(event.target.value)} />
    <Select aria-label="作用域选项" options={[{ value: 'one', label: '作用域内选项' }]} style={{ width: 200 }} />
    <Button onClick={() => modal.confirm({ title: '作用域确认', content: '应用上下文', okText: '确认操作', cancelText: '返回页面' })}>打开确认</Button>
    <Button onClick={() => message.success('作用域消息')}>显示消息</Button>
    <Button onClick={() => notification.info({ title: '作用域通知' })}>显示通知</Button>
    <MobileSurface><div className="oxa-mobile-field"><MobileButton color="primary">移动主操作</MobileButton></div></MobileSurface>
  </div>;
}
export function ProviderProbe() {
  const [designed, setDesigned] = useState(false);
  return <>
    <Button onClick={() => setDesigned(value => !value)}>更换视觉参数</Button>
    <section aria-label="被测应用"><OpenXiangdaUiProvider className="probe-scope" style={{ '--probe-marker': 'owned', ...(designed ? { '--oxa-mobile-color-primary': '#245a49' } : {}) }}
      theme={designed ? { token: { colorPrimary: '#245a49' } } : undefined}><Fields /></OpenXiangdaUiProvider></section>
    <section aria-label="相邻应用"><OpenXiangdaUiProvider><Fields /></OpenXiangdaUiProvider></section>
  </>;
}
