import { Extension, Node, mergeAttributes, type Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { normalizeRichTextStyle, parseRichTextManagedSource, isSafeRichTextLink } from 'openxiangda-contracts/rich-text';
import { dataFileContentUrl, workflowDataFileContentUrl, fetchDataFileBlob, fetchWorkflowDataFileBlob, type WorkflowFileBinding } from '../../platform-client';

/** Keep block styles from other editors, independently of inline text marks. */
const BlockFormatting = Extension.create({
  name: 'platformBlockFormatting',
  addGlobalAttributes() {
    const properties = ['font-size', 'font-family', 'line-height', 'text-indent', 'margin-left', 'padding-left', 'color', 'background-color', 'vertical-align', 'border', 'border-collapse'];
    return [{ types: ['paragraph', 'heading', 'table', 'tableCell', 'tableHeader', 'blockquote'], attributes: Object.fromEntries(properties.map(property => [property, {
      default: null,
      parseHTML: (element: HTMLElement) => element.style.getPropertyValue(property) || null,
      renderHTML: (attrs: Record<string, string>) => {
        const style = normalizeRichTextStyle(`${property}: ${attrs[property] || ''}`);
        return style ? { style } : {};
      },
    }])) }];
  },
});
function managedMediaView(kind: 'image' | 'video', binding?: WorkflowFileBinding) {
  return ({ node }: { node: { attrs: Record<string, any> } }) => {
    const dom = document.createElement(kind === 'image' ? 'img' : 'video');
    let disposed = false, url: string | undefined;
    const source = String(node.attrs.src || '');
    const media = parseRichTextManagedSource(source);
    dom.setAttribute('alt', node.attrs.alt || '');
    if (node.attrs.width) dom.setAttribute('width', String(node.attrs.width));
    if (node.attrs.height) dom.setAttribute('height', String(node.attrs.height));
    if (kind === 'video') {
      const video = dom as HTMLVideoElement;
      video.controls = true; video.playsInline = true; video.preload = 'metadata';
      if (media) video.src = binding ? workflowDataFileContentUrl(binding, media.fileId, 'inline') : dataFileContentUrl(media.resourceCode, media.fileId, 'inline');
    } else if (media) {
      void (binding ? fetchWorkflowDataFileBlob(binding, media.fileId) : fetchDataFileBlob(media.resourceCode, media.fileId)).then(blob => {
        if (disposed) return;
        url = URL.createObjectURL(blob); (dom as HTMLImageElement).src = url;
      }).catch(() => dom.setAttribute('alt', '图片暂时无法读取'));
    }
    return {
      dom, ignoreMutation: () => true,
      destroy() { disposed = true; if (url) URL.revokeObjectURL(url); if (kind === 'video') { dom.removeAttribute('src'); (dom as HTMLVideoElement).load(); } },
    };
  };
}
/** Free MIT extensions only. All imported HTML passes the shared policy first. */
export function createRichTextExtensions(binding?: WorkflowFileBinding): Extensions {
  return [
    StarterKit.configure({ link: { openOnClick: false, autolink: false, isAllowedUri: url => isSafeRichTextLink(url) } }),
    TextStyleKit, BlockFormatting,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TableKit.configure({ table: { resizable: true } }),
    TaskList, TaskItem.configure({ nested: true }), Superscript, Subscript,
    Image.extend({ addAttributes() { return { ...this.parent?.(), width: { default: null }, height: { default: null } }; }, addNodeView() { return managedMediaView('image', binding); } }),
    Node.create({
      name: 'managedVideo', group: 'block', atom: true, draggable: true,
      addAttributes() { return { src: { default: null }, width: { default: null }, height: { default: null }, title: { default: null } }; },
      parseHTML() { return [{ tag: 'video[src]' }]; },
      renderHTML({ HTMLAttributes }) { return ['video', mergeAttributes(HTMLAttributes, { controls: '', playsinline: '', preload: 'metadata' })]; },
      addNodeView() { return managedMediaView('video', binding); },
    }),
  ];
}
