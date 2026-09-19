const MOBILE_RUNTIME_STYLE_ID = 'openxiangda-antd-mobile-runtime-global';

const MOBILE_RUNTIME_STYLE = `div.adm-px-tester {
  --size: 1;
  height: calc(var(--size) / 2 * 2px);
  width: 0;
  position: fixed;
  left: -100vw;
  top: -100vh;
  user-select: none;
  pointer-events: none;
}`;

/**
 * Ant Design Mobile measures px values while its component modules evaluate.
 * Install only the required document-level mechanics before those modules load;
 * the reviewed visual defaults remain scoped in mobile-base.css.
 */
export function initializeAntdMobileRuntimeGlobal(
  target: Document | undefined = globalThis.document,
) {
  if (!target || target.getElementById(MOBILE_RUNTIME_STYLE_ID)) return;
  const style = target.createElement('style');
  style.id = MOBILE_RUNTIME_STYLE_ID;
  style.textContent = MOBILE_RUNTIME_STYLE;
  (target.head || target.documentElement).appendChild(style);
  target.addEventListener('touchstart', () => {}, true);
}

initializeAntdMobileRuntimeGlobal();
