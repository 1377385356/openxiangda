const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table',
  'thead', 'tbody', 'tr', 'th', 'td', 'img',
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  th: new Set(['colspan', 'rowspan']),
  td: new Set(['colspan', 'rowspan']),
};

const MANAGED_IMAGE =
  /^\/service\/openxiangda-api\/v2\/applications\/[^/?#]+\/native\/data\/[^/?#]+\/files\/([0-9a-f-]+)\/content\?disposition=inline(?:&perspective=[a-z][a-z0-9._-]{0,127})?$/i;

const PUBLIC_MANAGED_IMAGE =
  /^\/service\/openxiangda-api\/v2\/applications\/[^/?#]+\/anonymous-public\/files\/[0-9a-f-]+\/content\?(?:policyCode=[^&]+&environmentKey=(?:preproduction|production)&disposition=inline&resourceCode=[^&]+(?:&parentFieldCode=[^&]+)?)$/i;

export const MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE =
  'data-openxiangda-managed-image-source';

const TRANSPARENT_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

function safeLink(value: string) {
  return /^(?:https?:|mailto:|tel:)/i.test(value.trim());
}

export function managedRichTextImageFileId(source: string) {
  return source.match(MANAGED_IMAGE)?.[1]?.toLowerCase();
}

function isPublicManagedRichTextImageSource(source: string) {
  return PUBLIC_MANAGED_IMAGE.test(source);
}

/**
 * Replaces protected managed-image paths before they enter the DOM. The
 * renderer later materializes each file through an authorized fetch and an
 * ephemeral blob URL.
 */
export function richTextHydrationHtml(value: string) {
  const sanitized = sanitizeRichText(value);
  if (typeof DOMParser === 'undefined') return sanitized;
  const document = new DOMParser().parseFromString(sanitized, 'text/html');
  for (const image of [...document.body.querySelectorAll('img')]) {
    const source = image.getAttribute('src') || '';
    if (!managedRichTextImageFileId(source)) continue;
    image.setAttribute(MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE, source);
    image.setAttribute('src', TRANSPARENT_IMAGE);
  }
  return document.body.innerHTML;
}

/** Browser-side defense in depth. The platform repeats this allowlist on write. */
export function sanitizeRichText(value: string): string {
  if (typeof DOMParser === 'undefined') return value;
  const document = new DOMParser().parseFromString(value, 'text/html');
  let convertedParagraph = false;
  for (const element of [...document.body.querySelectorAll('*')]) {
    const tag = element.tagName.toLowerCase();
    if (tag === 'div') {
      const paragraph = document.createElement('p');
      paragraph.append(...element.childNodes);
      element.replaceWith(paragraph);
      convertedParagraph = true;
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      if (tag === 'script' || tag === 'style') element.remove();
      else element.replaceWith(...element.childNodes);
      continue;
    }
    const attributes = ALLOWED_ATTRIBUTES[tag] || new Set<string>();
    for (const attribute of [...element.attributes]) {
      if (!attributes.has(attribute.name.toLowerCase())) {
        element.removeAttribute(attribute.name);
      }
    }
    if (tag === 'a') {
      const href = element.getAttribute('href');
      if (href && !safeLink(href)) element.removeAttribute('href');
      element.setAttribute('rel', 'noopener noreferrer');
    }
    if (tag === 'img') {
      const source = element.getAttribute('src') || '';
      if (!MANAGED_IMAGE.test(source) && !isPublicManagedRichTextImageSource(source)) {
        element.remove();
      }
    }
  }
  const normalized = document.body.innerHTML;
  // 再解析一次以闭合嵌套块转换产生的 p；已无 div，不会无限递归。
  return convertedParagraph ? sanitizeRichText(normalized) : normalized;
}

export function richTextPlainText(value: string) {
  if (typeof DOMParser === 'undefined') {
    return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return new DOMParser()
    .parseFromString(value, 'text/html')
    .body.textContent?.replace(/\s+/g, ' ')
    .trim() || '';
}
