import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, useNavigate, useLocation, type NavigateFunction } from 'react-router-dom';
import { OpenXiangdaApplication, defineApplicationContributions, useUnsavedChangesGuard, WorkflowBusinessStepRecoveryPanel, type WorkflowBusinessStepRecoveryDraftState } from 'openxiangda/react';
import 'openxiangda/react/styles.css';

declare global { interface Window { fixtureNavigate: NavigateFunction; } }
const appCode = 'openxiangda-application';
const mount = '/guard';
if (location.pathname.endsWith('.html')) history.replaceState({}, '', `${mount}/home`);
function Draft() {
  const [value, setValue] = useState('');
  const [second, setSecond] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mountId] = useState(() => crypto.randomUUID());
  const navigate = useNavigate();
  const guard = useUnsavedChangesGuard({ when: Boolean(value) && !saved, message: '会议草稿尚未保存。' });
  useEffect(() => { if (saved) navigate('/saved'); }, [saved, navigate]);
  return <div><h1>编辑会议</h1><input aria-label="主题" value={value} onChange={e => setValue(e.target.value)} />
    <output data-testid="mount">{mountId}</output><button onClick={() => setValue('')}>保存</button>
    <button onClick={() => setSaved(true)}>提交并跳转</button>
    <button onClick={() => { setValue(''); guard.release(); navigate('/saved'); }}>同步提交并跳转</button>
    <button onClick={() => guard.confirmNavigation(() => { setValue(''); guard.release(); navigate('/closed'); })}>关闭当前表单</button>
    <button onClick={() => setSecond(v => !v)}>切换第二表单</button>{second && <SecondDraft />}
    <Link to="/link">站内链接</Link><button onClick={() => navigate('/replace', { replace: true })}>替换跳转</button>
  </div>;
}
function SecondDraft() {
  useUnsavedChangesGuard({ when: true, message: '第二表单尚未保存。' });
  return <p>第二表单</p>;
}
function StepRecovery() {
  const [draft, setDraft] = useState<WorkflowBusinessStepRecoveryDraftState>({ dirty: false, busy: false, unknown: false });
  const [failRefresh, setFailRefresh] = useState(false);
  useUnsavedChangesGuard({ when: draft.dirty || draft.busy || draft.unknown, preventNavigation: draft.busy || draft.unknown, message: '步骤恢复原请求尚未确认。' });
  return <><button onClick={() => setFailRefresh(true)}>模拟刷新失败</button><Link to="/link">离开步骤恢复</Link>
    <WorkflowBusinessStepRecoveryPanel instanceId="step-instance" onDraftStateChange={setDraft} onCompleted={() => { if (failRefresh) throw new Error('host refresh failed'); }} />
  </>;
}
function Pages() {
  const navigate = useNavigate(); const location = useLocation();
  useEffect(() => { window.fixtureNavigate = navigate; }, [navigate]);
  return <><output data-testid="location">{location.pathname}{location.search}</output>
    <button onClick={() => navigate('/edit')}>编辑</button>
    <button onClick={() => navigate('/recovery')}>业务步骤恢复</button>
    {location.pathname === '/edit' ? <Draft /> : location.pathname === '/recovery' ? <StepRecovery /> : <h1>其他页面</h1>}
  </>;
}
const definitions = { guard: { code: 'guard-page', path: '/:page', label: '导航保护验收',
  surface: 'user', tabPersistence: 'none', keepAlive: 'none' } } as const;
const contributions = defineApplicationContributions(definitions, { pages: { guard: Pages } });
const routeManifest = { schemaVersion: 'openxiangda.application-route-manifest/v3', appCode,
  devicePolicy: { kind: 'viewport-family', mobileMaxWidthPx: 900, desktopMinWidthPx: 901 },
  rootEntry: { code: 'application-root', desktop: '/', mobile: '/m/' },
  digest: 'd'.repeat(64),
  authentication: { desktop: { routeCode: 'application-login', path: '/login' },
    mobile: { routeCode: 'application-login-mobile', path: '/m/login' } }, routes: [],
} as const;
function Fixture() {
  const [version, setVersion] = useState(0);
  return <><button onClick={() => setVersion(v => v + 1)}>父级重绘</button><output>{version}</output>
    <OpenXiangdaApplication appCode={appCode} appName="导航保护验收" timeZone="Asia/Shanghai"
      resourceDefinitions={{}} adminPages={[]} adminNavigation={[]} routeManifest={routeManifest} contributions={contributions} />
  </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture /></React.StrictMode>);
