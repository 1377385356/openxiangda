import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactNode } from 'react';

/** Default component styles, Chinese locale and contextual feedback. */
export function OpenXiangdaUiProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={zhCN}>
      <App className="oxa-ui-root">{children}</App>
    </ConfigProvider>
  );
}
