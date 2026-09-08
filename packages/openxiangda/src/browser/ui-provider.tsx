import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactNode } from 'react';
import { PresentationTimeZoneContext, validatePresentationTimeZone } from './presentation-time';

/** Default component styles, Chinese locale and contextual feedback. */
export function OpenXiangdaUiProvider({ children, timeZone }: { children: ReactNode; timeZone?: string }) {
  const zone = validatePresentationTimeZone(timeZone);
  return (
    <PresentationTimeZoneContext.Provider value={zone}>
      <ConfigProvider locale={zhCN}>
        <App className="oxa-ui-root">{children}</App>
      </ConfigProvider>
    </PresentationTimeZoneContext.Provider>
  );
}
