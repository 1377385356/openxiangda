import type { ApplicationLoginSurfaceProps } from 'openxiangda/react';
import { LoginForm } from './LoginForm';
export function MobileLogin(props:ApplicationLoginSurfaceProps){return <main className="app-login app-login--mobile"><LoginForm {...props}/></main>;}
