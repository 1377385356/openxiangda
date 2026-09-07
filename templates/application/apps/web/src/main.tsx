import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  defineApplicationContributions,
  DefaultDesktopApplicationLoginSurface,
  DefaultMobileApplicationLoginSurface,
  OpenXiangdaApplication,
  type ApplicationLoginSurfaceProps,
} from 'openxiangda/react';
import {
  appCode,
  appName,
  appPerspectives,
  appRoutes,
  routeManifest,
  authenticationSurfaces,
  anonymousPublicAccess,
  adminNavigation,
  adminAccess,
  adminPages,
  resourceDefinitions,
  workflowDefinitions,
} from '../../../packages/contracts/src/generated.js';
import './document.css';
import './user-end/tailwind.css';
import 'openxiangda/react/styles.css';

const ApplicationHome = () => <main>OpenXiangda 应用</main>;
const ApplicationHomeMobile = () => <main>OpenXiangda 移动应用</main>;
const BrandedDesktopLogin = (props: ApplicationLoginSurfaceProps) => (
  <DefaultDesktopApplicationLoginSurface {...props} />
);
const BrandedMobileLogin = (props: ApplicationLoginSurfaceProps) => (
  <DefaultMobileApplicationLoginSurface {...props} />
);

const applicationContributions = defineApplicationContributions(
  { routes: appRoutes, authenticationSurfaces },
  {
    pages: {
      applicationHome: ApplicationHome,
      applicationHomeMobile: ApplicationHomeMobile,
    },
    authentication: {
      applicationLogin: BrandedDesktopLogin,
      applicationLoginMobile: BrandedMobileLogin,
    },
  },
);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OpenXiangdaApplication
      appCode={appCode}
      appName={appName}
      adminAccess={adminAccess}
      adminNavigation={adminNavigation}
      adminPages={adminPages}
      routeManifest={routeManifest}
      contributions={applicationContributions}
      publicAccess={anonymousPublicAccess}
      perspectives={appPerspectives}
      resourceDefinitions={resourceDefinitions}
      workflows={workflowDefinitions}
    />
  </React.StrictMode>,
);
