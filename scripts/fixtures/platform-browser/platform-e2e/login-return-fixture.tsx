import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { RuntimeBoundary, OpenXiangdaUiProvider } from 'openxiangda/react';
import 'openxiangda/react/styles.css';
const parameters = new URLSearchParams(location.search);
const mobile = parameters.get('device') === 'mobile';
const path = mobile ? '/m/login' : '/login';
const target = parameters.get('target') || '/m/recuperation?section=routes#details';
const Login = () => <div>应用登录表单</div>;
const authentication = [{ surface: { device: mobile ? 'mobile' as const : 'desktop' as const,
  routeCode: 'login', path, defaultRouteCode: 'home' }, component: Login }];
const routes: any[] = [{ route: { code: 'home', path: mobile ? '/m/home' : '/home' }, component: () => <div>首页</div> }];
function Location() { const here = useLocation(); return <output data-testid="current-route">{here.pathname}{here.search}{here.hash}</output>; }
ReactDOM.createRoot(document.getElementById('root')!).render(
  <OpenXiangdaUiProvider><MemoryRouter initialEntries={[`${path}?returnTo=${encodeURIComponent(target)}`]}>
    <Location /><RuntimeBoundary authentication={authentication} routes={routes}><div>原业务页面</div></RuntimeBoundary>
  </MemoryRouter></OpenXiangdaUiProvider>,
);
