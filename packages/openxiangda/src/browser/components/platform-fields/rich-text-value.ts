import { sanitizeRichTextHtml, parseRichTextManagedSource, isPublicRichTextManagedSource } from 'openxiangda-contracts/rich-text';

export const MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE = 'data-openxiangda-managed-image-source';
const TRANSPARENT_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
export function managedRichTextImageFileId(source: string) { return parseRichTextManagedSource(source)?.fileId; }
export function sanitizeRichText(value: string): string { return sanitizeRichTextHtml(value, { display: true }); }
/** Protected paths are replaced before markup enters the display DOM. */
export function richTextHydrationHtml(value: string) {
  const sanitized = sanitizeRichText(value);
  if (typeof DOMParser === 'undefined') return sanitized;
  const doc = new DOMParser().parseFromString(sanitized, 'text/html');
  for (const media of [...doc.body.querySelectorAll('img,video')]) {
    const source = media.getAttribute('src') || '';
    if (!parseRichTextManagedSource(source)) continue;
    media.setAttribute(MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE, source);
    if (media.tagName === 'IMG') media.setAttribute('src', TRANSPARENT_IMAGE);
    else media.removeAttribute('src');
  }
  // Public paths are already authorized by the public policy route.
  return doc.body.innerHTML;
}
export { isPublicRichTextManagedSource };

export function richTextPlainText(value: string) {
  if (typeof DOMParser === 'undefined') {
    return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return new DOMParser()
    .parseFromString(value, 'text/html')
    .body.textContent?.replace(/\s+/g, ' ')
    .trim() || '';
}

export { sanitizeRichTextHtml, richTextManagedMedia, RICH_TEXT_POLICY_V2 } from 'openxiangda-contracts/rich-text';
