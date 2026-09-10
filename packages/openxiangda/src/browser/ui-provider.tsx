import { App, ConfigProvider, type ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useCallback, useRef, type CSSProperties, type ReactNode } from 'react';
import { PresentationTimeZoneContext, validatePresentationTimeZone } from './presentation-time';

export interface OpenXiangdaUiOptions {
  theme?: ThemeConfig;
  className?: string;
  style?: CSSProperties & Record<`--${string}`, string | number>;
}
const defaultTheme: ThemeConfig = {};

/** Application-owned visual input; no global preferences or document mutation. */
export function OpenXiangdaUiProvider({ children, timeZone, theme, className, style }: OpenXiangdaUiOptions & { children: ReactNode; timeZone?: string }) {
  const zone = validatePresentationTimeZone(timeZone);
  const surface = useRef<HTMLElement>(null);
  const getContainer = useCallback(() => surface.current || document.body, []);
  return (
    <PresentationTimeZoneContext.Provider value={zone}>
      <ConfigProvider locale={zhCN} theme={theme ?? defaultTheme} getPopupContainer={getContainer}>
        <App ref={surface} className={['oxa-ui-root', className].filter(Boolean).join(' ')} style={style}
          message={{ getContainer }} notification={{ getContainer }}>{children}</App>
      </ConfigProvider>
    </PresentationTimeZoneContext.Provider>
  );
}
