import React from 'react';
import ReactDOM from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { RuntimeBoundary, OpenXiangdaUiProvider, OpenXiangdaApplication, defineApplicationContributions } from 'openxiangda/react';
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
const initializedApplication = parameters.get('application') === '1';
function InitializedLogin() { return <><Location /><Login /></>; }
function InitializedBusiness() { return <><Location /><div>原业务页面</div></>; }
const contributions = defineApplicationContributions({
  routes: { target: { code: 'return-target', path: '/m/recuperation', label: '原业务页面',
    surface: 'user', tabPersistence: 'none', keepAlive: 'none' } },
  authenticationSurfaces: { login: authentication[0].surface },
} as const, { pages: { target: InitializedBusiness }, authentication: { login: InitializedLogin } });
const routeManifest = {
  schemaVersion: 'openxiangda.application-route-manifest/v3', appCode: 'openxiangda-application',
  devicePolicy: { kind: 'viewport-family', mobileMaxWidthPx: 900, desktopMinWidthPx: 901 },
  rootEntry: { code: 'application-root', desktop: '/home', mobile: '/m/home' },
  authentication: { desktop: { routeCode: 'login', path: '/login' },
    mobile: { routeCode: 'login-mobile', path: '/m/login' } }, routes: [], digest: 'b'.repeat(64),
} as const;
if (initializedApplication) {
  history.replaceState({}, '', `${path}?returnTo=${encodeURIComponent(target)}`);
}
ReactDOM.createRoot(document.getElementById('root')!).render(initializedApplication ?
  <OpenXiangdaApplication appCode="openxiangda-application" appName="登录返回验收"
    resourceDefinitions={{}} adminPages={[]} adminNavigation={[]} routeManifest={routeManifest} contributions={contributions} /> :
  <OpenXiangdaUiProvider><MemoryRouter initialEntries={[`${path}?returnTo=${encodeURIComponent(target)}`]}>
    <Location /><RuntimeBoundary authentication={authentication} routes={routes}><div>原业务页面</div></RuntimeBoundary>
  </MemoryRouter></OpenXiangdaUiProvider>,
);
