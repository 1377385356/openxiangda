import { Alert, Button, Checkbox, Form, Input, Space, Spin } from 'antd';
import { useState } from 'react';
import type { ApplicationLoginSurfaceProps } from 'openxiangda/react';
export function LoginForm(props:ApplicationLoginSurfaceProps) {
  const passwordMethod=props.methods.find(method=>method.type==='password');
  const [expanded,setExpanded]=useState(false);
  const showPassword=Boolean(passwordMethod&&(expanded||passwordMethod.presentation==='primary'));
  const pending=props.state!=='idle';
  return <section className="app-login-form"><p className="app-eyebrow">欢迎回来</p><h1>登录 {props.app.name}</h1><p className="app-muted">使用公司账号，继续今天的工作。</p>
    {props.error&&<Alert role="alert" type="error" showIcon title={props.error.message} />}
    {props.state==='recovering-identity'&&<Spin tip="正在恢复登录" />}
    <Space orientation="vertical" style={{width:'100%'}}>{props.methods.filter(method=>method.type!=='password').map(method=><Button key={method.code} block type={method.presentation==='primary'?'primary':'default'} loading={props.state==='redirecting'} disabled={!method.available||pending} onClick={()=>void (method.type==='sso'?props.startSso(method.code):props.startDingTalk(method.code))}>{method.label}</Button>)}</Space>
    {passwordMethod&&!showPassword&&<Button type="link" disabled={!passwordMethod.available||pending} onClick={()=>setExpanded(true)}>{passwordMethod.label}</Button>}
    {showPassword&&<Form layout="vertical" requiredMark={false} disabled={pending||!passwordMethod?.available} onFinish={values=>void props.passwordLogin({...values,...(props.error?.challenge?{challengeId:props.error.challenge.id}:{})})}>
      <Form.Item label="公司账号" name="username" rules={[{required:true,message:'请输入账号'}]}><Input autoComplete="username" placeholder="请输入账号" /></Form.Item>
      <Form.Item label="密码" name="password" rules={[{required:true,message:'请输入密码'}]}><Input.Password autoComplete="current-password" placeholder="请输入密码" /></Form.Item>
      {props.error?.challenge&&<Form.Item label={props.error.challenge.question} name="challengeAnswer" rules={[{required:true,message:'请输入验证码答案'}]}><Input autoComplete="off" /></Form.Item>}
      <Form.Item name="rememberAccount" valuePropName="checked"><Checkbox>记住账号</Checkbox></Form.Item>
      <Button block type="primary" htmlType="submit" loading={props.state==='submitting'}>登录并继续</Button>
    </Form>}
    {!props.methods.length&&props.state==='idle'&&!props.error&&<Alert type="warning" title="暂无可用登录方式，请联系管理员" />}
    <p className="app-login-help">如需账号帮助，请联系公司管理员。</p>
  </section>;
}
