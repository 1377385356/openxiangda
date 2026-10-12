import { Link } from 'react-router-dom';
import { appName } from '../../../../../packages/contracts/src/generated.js';
import type { ReactNode } from 'react';
type FrameProps={children:ReactNode;canGoBack:boolean;back():void};
export function MobileFrame({children,canGoBack,back}:FrameProps) {
  return <div className="app-mobile app-mobile--task-list"><header className="app-mobile-header">{canGoBack&&<button className="app-back" onClick={back}>‹ 返回</button>}<strong>{appName}</strong></header><main className="app-mobile-main">{children}</main></div>;
}
