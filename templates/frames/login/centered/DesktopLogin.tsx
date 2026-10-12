import type { ApplicationLoginSurfaceProps } from 'openxiangda/react';
import { LoginForm } from './LoginForm';
export function DesktopLogin(props:ApplicationLoginSurfaceProps){return <main className="app-login app-login--centered"><LoginForm {...props}/></main>;}
