import { Button, Tooltip } from 'antd';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type RefObject } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { DataFileRef } from 'openxiangda-contracts/browser';
import { RICH_TEXT_POLICY_V2, sanitizeRichTextHtml } from 'openxiangda-contracts/rich-text';
import { dataRichTextImageSource, dataFileContentUrl, workflowDataFileContentUrl, fetchDataFileBlob, fetchWorkflowDataFileBlob, type WorkflowFileBinding } from '../../platform-client';
import { managedRichTextImageFileId, MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE, richTextHydrationHtml } from './rich-text-value';
import { createRichTextExtensions } from './rich-text-extensions';

function useHydratedManagedImages(
  root: RefObject<HTMLElement | null>,
  html: string,
  resourceCode?: string,
  workflowBinding?: WorkflowFileBinding,
) {
  const objectUrls = useRef(new Map<string, string>());
  const pendingBlobs = useRef(new Map<string, Promise<Blob>>());
  const scope = JSON.stringify([resourceCode, workflowBinding?.taskId, workflowBinding?.instanceId,
    workflowBinding?.resourceCode, workflowBinding?.recordId, workflowBinding?.fieldCode]);
  const previousScope = useRef(scope);

  useEffect(() => () => {
    objectUrls.current.forEach(source => URL.revokeObjectURL(source));
    objectUrls.current.clear();
    pendingBlobs.current.clear();
  }, []);

  useEffect(() => {
    const container = root.current;
    if (previousScope.current !== scope) {
      objectUrls.current.forEach(source => URL.revokeObjectURL(source));
      objectUrls.current.clear(); pendingBlobs.current.clear();
      container?.querySelectorAll('img').forEach(image => {
        if (image.getAttribute('src')?.startsWith('blob:')) image.removeAttribute('src');
      });
      previousScope.current = scope;
    }
    if (!container || (!resourceCode && !workflowBinding)) return;
    let active = true;
    for (const video of [...container.querySelectorAll('video')]) {
      const source = video.getAttribute(MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE) || '';
      const fileId = managedRichTextImageFileId(source);
      if (fileId) video.src = workflowBinding ? workflowDataFileContentUrl(workflowBinding, fileId, 'inline') : dataFileContentUrl(resourceCode!, fileId, 'inline');
    }
    const images = [...container.querySelectorAll('img')];
    const activeSources = new Set(
      images
        .map(image => image.getAttribute(MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE) || '')
        .filter(source => Boolean(managedRichTextImageFileId(source)))
    );
    for (const [source, objectUrl] of objectUrls.current) {
      if (activeSources.has(source)) continue;
      URL.revokeObjectURL(objectUrl);
      objectUrls.current.delete(source);
    }
    for (const image of images) {
      const source = image.getAttribute(MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE) || '';
      const fileId = managedRichTextImageFileId(source);
      if (!fileId) continue;
      const current = image.getAttribute('src') || '';
      if (current.startsWith('blob:')) {
        // The editor owns freshly inserted previews and revokes them when the
        // value is normalized. Never cache or reclaim another owner's URL.
        continue;
      }
      const known = objectUrls.current.get(source);
      if (known) {
        image.setAttribute('src', known);
        continue;
      }
      let pending = pendingBlobs.current.get(source);
      if (!pending) {
        pending = workflowBinding
          ? fetchWorkflowDataFileBlob(workflowBinding, fileId)
          : fetchDataFileBlob(resourceCode!, fileId);
        pendingBlobs.current.set(source, pending);
        void pending.then(
          () => {
            if (pendingBlobs.current.get(source) === pending) {
              pendingBlobs.current.delete(source);
            }
          },
          () => {
            if (pendingBlobs.current.get(source) === pending) {
              pendingBlobs.current.delete(source);
            }
          }
        );
      }
      void pending
        .then(blob => {
          if (!active || !container.contains(image)) return;
          const existing = objectUrls.current.get(source);
          const objectUrl = existing || URL.createObjectURL(blob);
          objectUrls.current.set(source, objectUrl);
          image.setAttribute('src', objectUrl);
        })
        .catch(() => {
          // The alt text remains visible; protected file failures stay local to
          // the image instead of crashing the rich-text surface.
        });
    }
    return () => {
      active = false;
    };
  }, [
    html,
    scope,
    resourceCode,
    root,
    workflowBinding?.instanceId,
    workflowBinding?.resourceCode,
    workflowBinding?.recordId,
    workflowBinding?.fieldCode,
  ]);
}

export function RichTextValueDisplay({
  value,
  resourceCode,
  workflowBinding,
}: {
  value: string;
  resourceCode?: string;
  workflowBinding?: WorkflowFileBinding;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  // Preserve hydrated blob URLs when a parent form rerenders unchanged content.
  const markup = useMemo(() => ({ __html: richTextHydrationHtml(value) }), [value]);
  useHydratedManagedImages(root, markup.__html, resourceCode, workflowBinding);
  return (
    <div
      className="oxa-rich-text-value"
      dangerouslySetInnerHTML={markup}
      ref={root}
    />
  );
}

export interface RichTextFieldProps {
  recordId?: string; fieldCode?: string;
  value?: string; onChange?: (value: string) => void; disabled?: boolean; mobile?: boolean;
  onUpload?: (file: File, onRecovered?: (file: DataFileRef) => void) => Promise<DataFileRef>;
  resourceCode?: string; workflowBinding?: WorkflowFileBinding;
}
const RichTextEditorContext = createContext<ComponentType<RichTextFieldProps> | null>(null);
/** Custom editors receive the same field, upload and workflow boundaries. */
export const RichTextEditorProvider = RichTextEditorContext.Provider;
export function RichTextField(props: RichTextFieldProps) {
  const Editor = useContext(RichTextEditorContext) || DefaultRichTextField;
  return <Editor {...props} />;
}
export function DefaultRichTextField({ value = '', onChange, disabled = false, mobile = false, onUpload, resourceCode, workflowBinding, recordId, fieldCode }: RichTextFieldProps) {
  const [uploading, setUploading] = useState(false), [error, setError] = useState('');
  const [fullScreen, setFullScreen] = useState(false);
  const fieldRoot = useRef<HTMLDivElement>(null);
  const generation = useRef(0), input = useRef<HTMLInputElement>(null), uploadKind = useRef<'image' | 'video'>('image');
  const scope = JSON.stringify([resourceCode, recordId, fieldCode, workflowBinding]);
  const change = useRef(onChange); change.current = onChange;
  const editor = useEditor({
    extensions: createRichTextExtensions(workflowBinding),
    content: sanitizeRichTextHtml(value),
    immediatelyRender: false,
    editorProps: { attributes: { class: 'oxa-rich-text-editor', role: 'textbox', 'aria-label': '富文本内容', 'aria-multiline': 'true' },
      transformPastedHTML: html => sanitizeRichTextHtml(html),
    },
    onUpdate: ({ editor }) => {
      try { change.current?.(editor.isEmpty ? '' : sanitizeRichTextHtml(editor.getHTML())); setError(''); }
      catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    },
  }, [scope]);
  useEditorState({ editor, selector: context => context.editor?.state });
  const locked = disabled || uploading;
  const disabledNow = useRef(disabled); disabledNow.current = disabled;
  useEffect(() => { editor?.setEditable(!locked); }, [editor, locked]);
  useEffect(() => {
    if (editor && sanitizeRichTextHtml(editor.getHTML()) !== sanitizeRichTextHtml(value)) editor.commands.setContent(sanitizeRichTextHtml(value), { emitUpdate: false });
  }, [editor, value]);
  useEffect(() => { generation.current++; setUploading(false); setError(''); setFullScreen(false); return () => { generation.current++; }; }, [scope]);
  useEffect(() => {
    const element = fieldRoot.current;
    if (!element) return;
    if (fullScreen) {
      if (!element.showPopover) { setError('当前浏览器不支持全屏编辑，请使用较新的浏览器。'); setFullScreen(false); return; }
      element.setAttribute('popover', 'manual'); element.showPopover(); editor?.commands.focus();
    } else {
      if (element.hidePopover && element.matches(':popover-open')) element.hidePopover();
      element.removeAttribute('popover');
    }
    return () => { if (element.hidePopover && element.matches(':popover-open')) element.hidePopover(); element.removeAttribute('popover'); };
  }, [fullScreen, editor]);
  const uploadResource = resourceCode || workflowBinding?.resourceCode;
  const button = (label: string, action: () => void, active = false) => <Tooltip title={label} key={label}><Button
    aria-label={label} aria-pressed={active} type={active ? 'primary' : 'text'} size="small" disabled={locked || !editor}
    onMouseDown={e => e.preventDefault()} onClick={action}>{label}</Button></Tooltip>;
  const choose = (kind: 'image' | 'video') => {
    uploadKind.current = kind;
    if (input.current) { input.current.accept = (kind === 'image' ? RICH_TEXT_POLICY_V2.imageTypes : RICH_TEXT_POLICY_V2.videoTypes).join(','); input.current.click(); }
  };
  const insertFile = async (file: File) => {
    if (!editor || locked || !onUpload || !uploadResource) return;
    const original = generation.current, kind = uploadKind.current, position = editor.state.selection.from;
    const contentAtUpload = editor.getHTML();
    let adopted = false;
    try {
      setUploading(true); setError('');
      const types: readonly string[] = kind === 'image' ? RICH_TEXT_POLICY_V2.imageTypes : RICH_TEXT_POLICY_V2.videoTypes;
      if (!types.includes(file.type)) throw new Error(kind === 'image' ? '支持 PNG、JPEG、WebP、GIF 图片' : '支持 MP4、WebM 视频');
      if (file.size === 0) throw new Error('不能上传空文件');
      if (file.size > (kind === 'image' ? RICH_TEXT_POLICY_V2.imageMaxBytes : RICH_TEXT_POLICY_V2.videoMaxBytes)) throw new Error(kind === 'image' ? '单张图片不能超过 10MB' : '单个视频不能超过 100MB');
      let count = 0; editor.state.doc.descendants(node => { if (node.type.name === (kind === 'image' ? 'image' : 'managedVideo')) count++; });
      if (count >= (kind === 'image' ? RICH_TEXT_POLICY_V2.maxImages : RICH_TEXT_POLICY_V2.maxVideos)) throw new Error(kind === 'image' ? '最多插入 20 张图片' : '最多插入 4 个视频');
      const adopt = (uploaded: DataFileRef) => {
        if (adopted || generation.current !== original || editor.isDestroyed) return;
        if (disabledNow.current || editor.getHTML() !== contentAtUpload) { setError('上传已完成，原内容已变更，请重新选择插入位置。'); return; }
        adopted = true;
        editor.chain().focus().insertContentAt(Math.min(position, editor.state.doc.content.size), { type: kind === 'image' ? 'image' : 'managedVideo', attrs: { src: dataRichTextImageSource(uploadResource, uploaded.id), alt: file.name, title: file.name } }).run();
        setError('');
      };
      adopt(await onUpload(file, adopt));
    } catch (reason) { if (generation.current === original) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (generation.current === original) setUploading(false); }
  };
  const select = (label: string, values: string[], action: (value: string) => void) => <label className="oxa-rich-text-choice" key={label}>{label}<select
    aria-label={label} disabled={locked || !editor} defaultValue="" onChange={e => { action(e.target.value); e.target.value = ''; }}>
    <option value="" disabled>选择</option>{values.map(v => <option value={v} key={v}>{v}</option>)}
  </select></label>;
  return <div ref={fieldRoot} role={fullScreen ? 'region' : undefined} aria-label={fullScreen ? '富文本全屏编辑' : undefined}
    onKeyDown={event => { if (fullScreen && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setFullScreen(false); } }}
    className={`oxa-rich-text-field${mobile ? ' oxa-mobile-rich-text-field' : ''}${fullScreen ? ' oxa-rich-text-fullscreen' : ''}`}>
    <div className="oxa-rich-text-toolbar" role="toolbar" aria-label="富文本工具栏">
      {select('段落', ['正文', '标题1', '标题2', '标题3'], v => v === '正文' ? editor?.chain().focus().setParagraph().run() : editor?.chain().focus().setHeading({ level: Number(v.slice(-1)) as 1 | 2 | 3 }).run())}
      {select('字体', [...RICH_TEXT_POLICY_V2.fonts], v => editor?.chain().focus().setFontFamily(v).run())}
      {select('字号', ['12px', '14px', '16px', '18px', '20px', '24px', '32px', '48px'], v => editor?.chain().focus().setFontSize(v).run())}
      {select('行高', ['1', '1.5', '2', '2.5', '3'], v => editor?.chain().focus().updateAttributes(editor.isActive('heading') ? 'heading' : 'paragraph', { 'line-height': v }).run())}
      {button('加粗', () => editor?.chain().focus().toggleBold().run(), editor?.isActive('bold'))}
      {button('斜体', () => editor?.chain().focus().toggleItalic().run(), editor?.isActive('italic'))}
      {button('下划线', () => editor?.chain().focus().toggleUnderline().run(), editor?.isActive('underline'))}
      {button('删除线', () => editor?.chain().focus().toggleStrike().run(), editor?.isActive('strike'))}
      {button('上标', () => editor?.chain().focus().toggleSuperscript().run(), editor?.isActive('superscript'))}
      {button('下标', () => editor?.chain().focus().toggleSubscript().run(), editor?.isActive('subscript'))}
      {(['文字颜色', '背景色'] as const).map(label => <label className="oxa-rich-text-choice" key={label}>{label}<input type="color" aria-label={label} disabled={locked} onChange={e => label === '文字颜色' ? editor?.chain().focus().setColor(e.target.value).run() : editor?.chain().focus().setBackgroundColor(e.target.value).run()} /></label>)}
      {select('对齐', ['left', 'center', 'right', 'justify'], v => editor?.chain().focus().setTextAlign(v).run())}
      {button('首行缩进', () => editor?.chain().focus().updateAttributes(editor.isActive('heading') ? 'heading' : 'paragraph', { 'text-indent': '2em' }).run())}
      {button('取消缩进', () => editor?.chain().focus().updateAttributes(editor.isActive('heading') ? 'heading' : 'paragraph', { 'text-indent': null, 'margin-left': null, 'padding-left': null }).run())}
      {button('有序列表', () => editor?.chain().focus().toggleOrderedList().run(), editor?.isActive('orderedList'))}
      {button('无序列表', () => editor?.chain().focus().toggleBulletList().run(), editor?.isActive('bulletList'))}
      {button('待办列表', () => editor?.chain().focus().toggleTaskList().run(), editor?.isActive('taskList'))}
      {button('引用', () => editor?.chain().focus().toggleBlockquote().run(), editor?.isActive('blockquote'))}
      {button('代码块', () => editor?.chain().focus().toggleCodeBlock().run(), editor?.isActive('codeBlock'))}
      {button('分割线', () => editor?.chain().focus().setHorizontalRule().run())}
      {button('插入链接', () => { const url = window.prompt('链接地址', editor?.getAttributes('link').href || 'https://'); if (url) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run(); })}
      {button('取消链接', () => editor?.chain().focus().unsetLink().run())}
      {select('表情', ['😀', '😊', '👍', '🎉', '❤️', '🌹', '🙏', '✅'], v => editor?.chain().focus().insertContent(v).run())}
      {button('插入表格', () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      {editor?.isActive('table') && <>{button('添加行', () => editor.chain().focus().addRowAfter().run())}{button('添加列', () => editor.chain().focus().addColumnAfter().run())}{button('删除行', () => editor.chain().focus().deleteRow().run())}{button('删除列', () => editor.chain().focus().deleteColumn().run())}{button('合并单元格', () => editor.chain().focus().mergeCells().run())}{button('拆分单元格', () => editor.chain().focus().splitCell().run())}{button('删除表格', () => editor.chain().focus().deleteTable().run())}</>}
      {onUpload && uploadResource && <>{button('插入图片', () => choose('image'))}{button('插入视频', () => choose('video'))}</>}
      {button('清除格式', () => editor?.chain().focus().unsetAllMarks().clearNodes().run())}
      {button('撤销', () => editor?.chain().focus().undo().run())}{button('重做', () => editor?.chain().focus().redo().run())}
      {button(fullScreen ? '退出全屏' : '全屏编辑', () => setFullScreen(previous => !previous))}
    </div>
    <input type="file" ref={input} hidden style={{ display: 'none' }} disabled={locked} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void insertFile(file); }} />
    {error && <div className="oxa-rich-text-error" role="alert">{error}</div>}
    <EditorContent editor={editor} />
  </div>;
}
