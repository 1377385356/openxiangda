import type { ApplicationLoginSurfaceProps } from 'openxiangda/react';
import { LoginForm } from './LoginForm';
export function DesktopLogin(props:ApplicationLoginSurfaceProps){return <main className="app-login app-login--split"><section className="app-login-brand"><div className="app-brand">{props.app.name}</div><div><p>连接工作，让协作更轻松</p><h2>从一个想法，<br/>到一次更好的体验。</h2><span>每一个任务，都有清晰的下一步。</span></div></section><LoginForm {...props}/></main>;}
