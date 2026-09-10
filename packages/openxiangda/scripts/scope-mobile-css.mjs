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
    // No global preference selector; applications supply inherited design inputs.
    if (key === "html[data-prefers-color-scheme='dark']") return '';
    const scoped = selectors.get(key);
    if (!scoped) throw new Error(`Unreviewed Ant Design Mobile base selector: ${key}`);
    const themed = scoped === scope ? declarations.replace(/(--adm-([\w-]+)):\s*([^;]+);/g,
      (_match, property, name, fallback) => `${property}: var(--oxa-mobile-${name}, ${fallback.trim()});`) : declarations;
    rules.push(`${scoped} {${themed}}`);
    return '';
  });
  if (remainder.trim() || !rules.length) throw new Error('Ant Design Mobile base CSS is no longer flat');
  return `/* Ant Design Mobile base styles, scoped by OpenXiangda at build time. */\n${rules.join('\n')}\n`;
}
