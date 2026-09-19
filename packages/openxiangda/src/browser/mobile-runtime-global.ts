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
 * The CSS side-effect prelude on the mobile component graph owns evaluation
 * ordering. This idempotent initializer keeps the identifiable fallback style
 * and touch mechanic without importing upstream document visual defaults.
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
