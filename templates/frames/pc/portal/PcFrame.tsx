import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
type FrameProps={children:ReactNode;canGoBack:boolean;back():void};
import { appName } from '../../../../../packages/contracts/src/generated.js';
export function PcFrame({children,canGoBack,back}:FrameProps) {
  return <div className="app-user app-user--portal"><header className="app-user-header"><Link className="app-brand" to="/home">{appName}</Link><nav><Link to="/home">我的工作台</Link></nav></header><main className="app-user-main">{canGoBack&&<button className="app-back" onClick={back}>返回</button>}{children}</main></div>;
}
