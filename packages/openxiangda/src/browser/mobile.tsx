import ImageViewerControl, { type MultiImageViewerProps } from 'antd-mobile/es/components/image-viewer/index.js';
import DatePickerControl, { type DatePickerProps, type DatePickerRef } from 'antd-mobile/es/components/date-picker/index.js';
import PickerControl, { type PickerProps, type PickerRef } from 'antd-mobile/es/components/picker/index.js';
import PopupControl, { type PopupProps } from 'antd-mobile/es/components/popup/index.js';
import { forwardRef, type HTMLAttributes } from 'react';

// Component entrypoints deliberately exclude the library's global HTML/body reset.
export { default as Button } from 'antd-mobile/es/components/button/index.js';
export { default as CheckList } from 'antd-mobile/es/components/check-list/index.js';
export { default as Input } from 'antd-mobile/es/components/input/index.js';
export { default as SearchBar } from 'antd-mobile/es/components/search-bar/index.js';
export { default as Switch } from 'antd-mobile/es/components/switch/index.js';
export { default as TextArea } from 'antd-mobile/es/components/text-area/index.js';
export { default as Radio } from 'antd-mobile/es/components/radio/index.js';
export { default as Checkbox } from 'antd-mobile/es/components/checkbox/index.js';
export { default as Rate } from 'antd-mobile/es/components/rate/index.js';
export { default as Calendar } from 'antd-mobile/es/components/calendar/index.js';
export { default as PickerView } from 'antd-mobile/es/components/picker-view/index.js';
export { default as ConfigProvider } from 'antd-mobile/es/components/config-provider/index.js';
export { default as zhCN } from 'antd-mobile/es/locales/zh-CN.js';
export type { DatePickerProps, DatePickerRef, PickerProps, PickerRef, PopupProps };

/** Keep overlays under the calling surface's scoped component styles. */
export function Popup(props: PopupProps) {
  return <PopupControl {...props} getContainer={props.getContainer ?? null} />;
}

export const Picker = forwardRef<PickerRef, PickerProps>((props, ref) => (
  <PickerControl {...props} ref={instance => {
    if (typeof ref === 'function') ref(instance);
    else if (ref) ref.current = instance;
  }} getContainer={props.getContainer ?? null} />
));
Picker.displayName = 'MobilePicker';

export const DatePicker = forwardRef<DatePickerRef, DatePickerProps>((props, ref) => (
  <DatePickerControl {...props} ref={ref} getContainer={props.getContainer ?? null} />
));
DatePicker.displayName = 'MobileDatePicker';

export type MobileSurfaceProps = HTMLAttributes<HTMLDivElement>;

export function MobileSurface({ className, ...props }: MobileSurfaceProps) {
  return <div {...props} className={['oxa-mobile-scope', className].filter(Boolean).join(' ')} />;
}

/** Declarative viewer preserves the calling surface's scope and cleanup. */
export function ImageViewer(props: MultiImageViewerProps) {
  return <ImageViewerControl.Multi {...props} getContainer={props.getContainer ?? null}
    renderFooter={(image, index) => <div ref={node => {
      // 5.42's ImageViewer places interactive content inside Mask's aria-hidden
      // element. Expose only this owned viewer, never unrelated application DOM.
      const mask = node?.closest('.adm-mask');
      mask?.removeAttribute('aria-hidden');
      mask?.setAttribute('role', 'dialog');
      mask?.setAttribute('aria-label', '图片预览');
    }}>{props.renderFooter?.(image, index)}</div>} />;
}
