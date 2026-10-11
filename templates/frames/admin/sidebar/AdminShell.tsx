import { Button } from 'antd';
import type { AdminShellProps } from 'openxiangda/react';
/** Application source: edit navigation, density and layout here. */
export function AdminShell(props: AdminShellProps) {
  return <div className="app-admin app-admin--sidebar" data-app-admin-shell="sidebar">
    <aside className="app-admin-navigation"><a className="app-brand" onClick={()=>props.navigate(props.homePath)}>{props.applicationName}</a>
      <p className="app-nav-caption">管理工作台</p>
      {props.navigation.map(group=><section key={group.code}><h3>{group.label}</h3>{group.items.map(item=><Button key={item.code} type={props.selectedPath===item.path?'primary':'text'} block onClick={()=>props.navigate(item.path)}>{item.label}</Button>)}</section>)}
      {props.centers.map(item=><Button key={item.code} block type="text" onClick={()=>props.navigate(item.path)}>{item.label}</Button>)}
    </aside>
    <div className="app-admin-body"><header className="app-admin-header"><div><small>工作台 / {props.title}</small><h1>{props.title}</h1></div><div className="app-user-menu"><span>{props.identity.subjectProfile.displayName || '当前用户'}</span><Button loading={props.loggingOut} onClick={()=>void props.logout()}>退出登录</Button></div></header><main className="app-admin-content">{props.children}</main></div>
  </div>;
}
