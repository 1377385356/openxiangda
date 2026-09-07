const scope = ':where(.oxa-mobile-scope, .oxa-mobile-page, .oxa-mobile-field)';
const selectors = new Map([
  [':root', scope],
  ['html', scope],
  ['body', scope],
  ['a, button', `${scope} a, ${scope} button`],
  ['a', `${scope} a`],
  ['a:active', `${scope} a:active`],
  ['.adm-plain-anchor', `${scope} .adm-plain-anchor`],
  ['.adm-plain-anchor:active', `${scope} .adm-plain-anchor:active`],
  // Scroll locking and px measurement are library mechanics.
  ['body.adm-overflow-hidden', 'body.adm-overflow-hidden'],
  ['div.adm-px-tester', 'div.adm-px-tester'],
]);

/** Transform the pinned dependency's flat base CSS; review selectors on upgrades. */
export function scopeMobileCss(source) {
  const rules = [];
  const remainder = source.replace(/([^{}]+)\{([^{}]*)\}/g, (_rule, selector, declarations) => {
    const key = selector.trim().replace(/\s+/g, ' ');
    // Ship only the library's default appearance.
    if (key === "html[data-prefers-color-scheme='dark']") return '';
    const scoped = selectors.get(key);
    if (!scoped) throw new Error(`Unreviewed Ant Design Mobile base selector: ${key}`);
    rules.push(`${scoped} {${declarations}}`);
    return '';
  });
  if (remainder.trim() || !rules.length) throw new Error('Ant Design Mobile base CSS is no longer flat');
  return `/* Ant Design Mobile base styles, scoped by OpenXiangda at build time. */\n${rules.join('\n')}\n`;
}
