import { useEffect, useRef, useState } from 'react';
import { TextArea } from '../../mobile';
import type { FieldProps } from './MobileFieldControls';

function textFromHtml(value: unknown) {
  if (!value) return '';
  const document = new DOMParser().parseFromString(String(value), 'text/html');
  document.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  document
    .querySelectorAll('p,div,li,h1,h2,h3')
    .forEach(node => node.append('\n'));
  return (document.body.textContent || '').trimEnd();
}
function paragraphHtml(text: string) {
  return text
    .split('\n')
    .map(
      line =>
        `<p>${
          line
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;') || '<br>'
        }</p>`
    )
    .join('');
}
/** Preserve existing HTML until the user edits its mobile plain-text projection. */
export function MobileRichTextField({
  field,
  value,
  id,
  disabled,
  onChange,
}: FieldProps) {
  const [draft, setDraft] = useState(() => textFromHtml(value));
  const lastEmitted = useRef<unknown>(value);
  useEffect(() => {
    if (value !== lastEmitted.current) setDraft(textFromHtml(value));
  }, [value]);
  return (
    <TextArea
      id={id}
      aria-label={field.label}
      disabled={disabled}
      placeholder="请输入"
      value={draft}
      autoSize={{ minRows: 5, maxRows: 12 }}
      onChange={text => {
        setDraft(text);
        lastEmitted.current = paragraphHtml(text);
        onChange?.(lastEmitted.current);
      }}
    />
  );
}
