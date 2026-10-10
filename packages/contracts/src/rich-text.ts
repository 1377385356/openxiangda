import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { RICH_TEXT_POLICY_V2 } from './native-compiler/rich-text-policy.js';
export { RICH_TEXT_POLICY_V2 } from './native-compiler/rich-text-policy.js';

type HtmlNode = DefaultTreeAdapterMap['node'];
type HtmlElement = DefaultTreeAdapterMap['element'];
export interface RichTextManagedMedia {
  appCode: string;
  resourceCode: string;
  fileId: string;
  kind: 'image' | 'video';
}
export class RichTextPolicyError extends Error {
  constructor(readonly code: string) { super(code); }
}
const CODE = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const nativePath = new RegExp(`^/service/openxiangda-api/v2/applications/(${CODE})/native/data/(${CODE})/files/(${UUID})/content$`, 'i');
const publicPath = new RegExp(`^/service/openxiangda-api/v2/applications/(${CODE})/anonymous-public/files/(${UUID})/content$`, 'i');
export function parseRichTextManagedSource(source: string): Omit<RichTextManagedMedia, 'kind'> | null {
  if (!source.startsWith('/service/')) return null;
  try {
    const url = new URL(source, 'https://openxiangda.invalid');
    const match = nativePath.exec(url.pathname);
    const keys = [...url.searchParams.keys()];
    if (!match || url.hash || url.origin !== 'https://openxiangda.invalid' ||
      new Set(keys).size !== keys.length || keys.some(key => !['disposition', 'perspective'].includes(key)) ||
      url.searchParams.get('disposition') !== 'inline' ||
      (url.searchParams.has('perspective') && !/^[a-z][a-z0-9._-]{0,127}$/.test(url.searchParams.get('perspective')!))) return null;
    return { appCode: match[1]!.toLowerCase(), resourceCode: match[2]!.toLowerCase(), fileId: match[3]!.toLowerCase() };
  } catch { return null; }
}
export function isPublicRichTextManagedSource(source: string): boolean {
  if (!source.startsWith('/service/')) return false;
  try {
    const url = new URL(source, 'https://openxiangda.invalid');
    const keys = [...url.searchParams.keys()];
    return publicPath.test(url.pathname) && !url.hash && url.origin === 'https://openxiangda.invalid' &&
      new Set(keys).size === keys.length && keys.every(key => ['policyCode', 'environmentKey', 'disposition', 'resourceCode', 'parentFieldCode'].includes(key)) &&
      /^[a-z][a-z0-9._-]{0,127}$/.test(url.searchParams.get('policyCode') || '') &&
      /^(preproduction|production)$/.test(url.searchParams.get('environmentKey') || '') &&
      url.searchParams.get('disposition') === 'inline' && new RegExp(`^${CODE}$`).test(url.searchParams.get('resourceCode') || '') &&
      (!url.searchParams.has('parentFieldCode') || /^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(url.searchParams.get('parentFieldCode') || ''));
  } catch { return false; }
}
const tags = new Set('p div br strong b em i u s del blockquote pre code ul ol li a h1 h2 h3 h4 h5 h6 table caption colgroup col thead tbody tfoot tr th td img span sup sub hr mark video label input'.split(' '));
const dropped = new Set('script style iframe object embed svg math template noscript'.split(' '));
const voidTags = new Set(['br', 'hr', 'img', 'col', 'input']);
const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, '&quot;');
const bounded = (v: string, min: number, max: number) => /^\d+(?:\.\d+)?$/.test(v) && Number(v) >= min && Number(v) <= max;
const length = (v: string, min: number, max: number, units = ['px', 'em', '%', 'pt']) => {
  const m = /^(\d+(?:\.\d+)?)(px|em|%|pt)$/.exec(v);
  return Boolean(m && units.includes(m[2]!) && bounded(m[1]!, min, m[2] === 'em' ? Math.min(max, 8) : max));
};
function color(v: string) {
  if (/^#[0-9a-f]{3,4}$|^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(v)) return true;
  if (/^(transparent|currentcolor|black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|brown|navy|teal|maroon|lime|silver|aqua|fuchsia|olive)$/i.test(v)) return true;
  const m = /^rgba?\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})(?:,\s*(0(?:\.\d+)?|1(?:\.0+)?))?\)$/.exec(v);
  return Boolean(m && m.slice(1, 4).every(n => Number(n) <= 255) && (v.startsWith('rgba(') === Boolean(m[4])));
}
/** CSS 是受限值，不是任意 stylesheet。无法解析的属性直接丢弃。 */
export function normalizeRichTextStyle(style: string): string {
  const result = new Map<string, string>();
  for (const declaration of style.split(';')) {
    const i = declaration.indexOf(':');
    if (i < 0) continue;
    const name = declaration.slice(0, i).trim().toLowerCase();
    const value = declaration.slice(i + 1).trim();
    const v = value.toLowerCase();
    if (/[\\<>@!]|url\s*\(|var\s*\(|expression|\/\*|\*\//i.test(v)) continue;
    let valid = false;
    switch (name) {
      case 'font-weight': valid = /^(normal|bold|[1-9]00)$/.test(v); break;
      case 'font-style': valid = /^(normal|italic|oblique)$/.test(v); break;
      case 'text-decoration': valid = /^(none|underline|line-through|underline line-through)$/.test(v); break;
      case 'text-align': valid = /^(left|center|right|justify)$/.test(v); break;
      case 'text-indent': case 'margin-left': case 'padding-left': valid = v === '0' || length(v, 0, 128, ['px', 'em']); break;
      case 'font-size': valid = length(v, 8, 72, ['px', 'pt']); break;
      case 'font-family': valid = value.split(',').every(font => (RICH_TEXT_POLICY_V2.fonts as readonly string[]).some(allowed => allowed.toLowerCase() === font.trim().replace(/^['"]|['"]$/g, '').toLowerCase())); break;
      case 'line-height': valid = bounded(v, 1, 3) || length(v, 12, 96, ['px', 'pt']); break;
      case 'color': case 'background-color': valid = color(v); break;
      case 'vertical-align': valid = /^(baseline|super|sub|top|middle|bottom)$/.test(v); break;
      case 'width': case 'height': valid = length(v, 1, v.endsWith('%') ? 100 : 4096, ['px', '%']); break;
      case 'max-width': valid = v === '100%'; break;
      case 'border-collapse': valid = /^(collapse|separate)$/.test(v); break;
      case 'border': {
        const m = /^([0-3]px) (solid|dashed|dotted) (.+)$/.exec(v); valid = Boolean(m && color(m[3]!)); break;
      }
      case 'border-color': valid = color(v); break;
      case 'border-width': valid = /^[0-3]px$/.test(v); break;
      case 'border-style': valid = /^(solid|dashed|dotted|none)$/.test(v); break;
    }
    if (valid) result.set(name, value);
  }
  return [...result].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${name}: ${value}`).join('; ');
}
export function isSafeRichTextLink(href: string) {
  return /^(?:https?:\/\/|mailto:|tel:)/i.test(href) && !/[\u0000-\u0020\u007f]/.test(href);
}
function attributes(tag: string, raw: Record<string, string>, display: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  const style = normalizeRichTextStyle(raw.style || '');
  if (style) out.style = style;
  if (tag === 'a') {
    if (isSafeRichTextLink(raw.href || '')) out.href = raw.href!;
    if (raw.target === '_blank') out.target = '_blank';
    out.rel = 'noopener noreferrer';
  }
  if (tag === 'img' || tag === 'video') {
    if (parseRichTextManagedSource(raw.src || '') || (display && isPublicRichTextManagedSource(raw.src || ''))) out.src = raw.src!;
    for (const name of ['alt', 'title']) if (raw[name]) out[name] = raw[name]!.slice(0, 512);
    for (const name of ['width', 'height']) if (bounded(raw[name] || '', 1, 4096)) out[name] = raw[name]!;
    if (tag === 'video') { out.controls = ''; out.preload = 'metadata'; out.playsinline = ''; }
  }
  if (tag === 'ul' && ['taskList', 'todo'].includes(raw['data-type'] || '')) out['data-type'] = 'taskList';
  if (tag === 'li') {
    if (['taskItem', 'todo'].includes(raw['data-type'] || '') || ['true', 'false'].includes(raw['data-checked'] || '')) {
      out['data-type'] = 'taskItem'; out['data-checked'] = raw['data-checked'] === 'true' ? 'true' : 'false';
    }
  }
  if (tag === 'input') { out.type = 'checkbox'; out.disabled = ''; if ('checked' in raw) out.checked = ''; }
  if (tag === 'ol' && bounded(raw.start || '', 1, 10000)) out.start = raw.start!;
  if (tag === 'td' || tag === 'th') {
    for (const name of ['colspan', 'rowspan']) if (/^\d+$/.test(raw[name] || '') && bounded(raw[name]!, 1, 100)) out[name] = raw[name]!;
    if (raw.colwidth && raw.colwidth.split(',').length <= 100 && raw.colwidth.split(',').every(n => bounded(n, 1, 4096))) out.colwidth = raw.colwidth;
  }
  if (tag === 'code' && /^language-[a-z0-9_+-]{1,32}$/i.test(raw.class || '')) out.class = raw.class!;
  return out;
}
export interface RichTextSanitizeOptions {
  /** Public sources are only accepted for rendering, never for Native writes. */
  display?: boolean;
  rewriteMedia?: (media: RichTextManagedMedia) => string;
}
export function sanitizeRichTextHtml(value: string, options: RichTextSanitizeOptions = {}): string {
  if (new TextEncoder().encode(value).byteLength > RICH_TEXT_POLICY_V2.maxBytes) throw new RichTextPolicyError('RICH_TEXT_TOO_LARGE');
  let count = 0;
  let applyRewrite = false;
  const render = (node: HtmlNode, depth: number): string => {
    if (++count > RICH_TEXT_POLICY_V2.maxNodes || depth > RICH_TEXT_POLICY_V2.maxDepth) throw new RichTextPolicyError('RICH_TEXT_COMPLEXITY_EXCEEDED');
    if (node.nodeName === '#text') return escapeText((node as DefaultTreeAdapterMap['textNode']).value);
    if (!('tagName' in node)) return '';
    const element = node as HtmlElement;
    const tag = element.tagName;
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || dropped.has(tag)) return '';
    const children = () => element.childNodes.map(child => render(child, depth + 1)).join('');
    if (!tags.has(tag)) return children();
    const raw = Object.fromEntries(element.attrs.filter(a => !a.namespace).map(a => [a.name, a.value]));
    if (tag === 'input' && raw.type !== 'checkbox') return '';
    const attrs = attributes(tag, raw, Boolean(options.display));
    if (tag === 'img' || tag === 'video') {
      if (!attrs.src) return '';
      const media = parseRichTextManagedSource(attrs.src);
      if (media && applyRewrite && options.rewriteMedia) {
        const rewritten = options.rewriteMedia({ ...media, kind: tag === 'img' ? 'image' : 'video' });
        if (!parseRichTextManagedSource(rewritten) && !(options.display && isPublicRichTextManagedSource(rewritten))) throw new RichTextPolicyError('RICH_TEXT_MEDIA_REWRITE_INVALID');
        attrs.src = rewritten;
      }
    }
    const serialized = Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b)).map(([name, val]) => ` ${name}="${escapeAttribute(val)}"`).join('');
    return `<${tag}${serialized}>${voidTags.has(tag) ? '' : children() + `</${tag}>`}`;
  };
  // HTML5 parsing eliminates mutation-XSS and invalid nested paragraph differences.
  const first = parseFragment(value).childNodes.map(n => render(n, 0)).join('');
  count = 0;
  applyRewrite = true;
  // Removed wrappers can change tree structure. Stabilize before any consumer uses HTML.
  return parseFragment(first).childNodes.map(n => render(n, 0)).join('');
}
export function richTextManagedMedia(value: string): RichTextManagedMedia[] {
  const media: RichTextManagedMedia[] = [];
  sanitizeRichTextHtml(value, { rewriteMedia: item => {
    if (!media.some(other => other.fileId === item.fileId && other.kind === item.kind)) media.push(item);
    return `/service/openxiangda-api/v2/applications/${item.appCode}/native/data/${item.resourceCode}/files/${item.fileId}/content?disposition=inline`;
  } });
  return media;
}
