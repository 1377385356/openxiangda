import {
  BoldOutlined,
  FileImageOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  StrikethroughOutlined,
  UnderlineOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Button, Space, Tooltip } from 'antd';
import { Button as MobileButton } from '../../mobile';
import type { DataFileRef } from 'openxiangda-contracts/browser';
import { useEffect, useMemo, useRef, useState, type RefObject, type ReactNode } from 'react';
import {
  dataRichTextImageSource,
  fetchDataFileBlob,
  fetchWorkflowDataFileBlob,
  type WorkflowFileBinding,
} from '../../platform-client';
import {
  managedRichTextImageFileId,
  MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE,
  richTextHydrationHtml,
  sanitizeRichText,
} from './rich-text-value';

const INLINE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const INLINE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const INLINE_IMAGE_MAX_COUNT = 20;

const TOOLS = [
  { command: 'bold', label: '加粗', icon: <BoldOutlined /> },
  { command: 'italic', label: '斜体', icon: <ItalicOutlined /> },
  { command: 'underline', label: '下划线', icon: <UnderlineOutlined /> },
  { command: 'strikeThrough', label: '删除线', icon: <StrikethroughOutlined /> },
  { command: 'insertOrderedList', label: '有序列表', icon: <OrderedListOutlined /> },
  { command: 'insertUnorderedList', label: '无序列表', icon: <UnorderedListOutlined /> },
] as const;

function editableRichTextValue(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const image of [...clone.querySelectorAll('img')]) {
    const source = image.getAttribute(MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE);
    if (source) image.setAttribute('src', source);
    image.removeAttribute(MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE);
  }
  return sanitizeRichText(clone.innerHTML);
}

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
        if (!objectUrls.current.has(source)) {
          objectUrls.current.set(source, current);
        }
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

export function RichTextField({
  value = '',
  onChange,
  disabled = false,
  mobile = false,
  onUpload,
  resourceCode,
  workflowBinding,
}: {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  mobile?: boolean;
  onUpload?: (file: File, onRecovered?: (file: DataFileRef) => void) => Promise<DataFileRef>;
  resourceCode?: string;
  workflowBinding?: WorkflowFileBinding;
}) {
  const editor = useRef<HTMLDivElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const insertedImageUrls = useRef(new Set<string>());
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  const selectedImageRange = useRef<Range | null>(null);
  const generation = useRef(0);
  const scope = JSON.stringify([resourceCode, workflowBinding?.taskId, workflowBinding?.instanceId,
    workflowBinding?.resourceCode, workflowBinding?.recordId, workflowBinding?.fieldCode]);
  useEffect(() => {
    generation.current += 1;
    selectedImageRange.current = null;
    insertedImageUrls.current.forEach(source => URL.revokeObjectURL(source));
    insertedImageUrls.current.clear();
    setImageUploading(false); setImageError('');
    return () => { generation.current += 1; };
  }, [scope]);
  const locked = disabled || imageUploading;
  const uploadResource = resourceCode || workflowBinding?.resourceCode;

  useEffect(() => {
    if (editor.current && editableRichTextValue(editor.current) !== value) {
      insertedImageUrls.current.forEach(source => URL.revokeObjectURL(source));
      insertedImageUrls.current.clear();
      editor.current.innerHTML = richTextHydrationHtml(value);
    }
  }, [value]);
  useEffect(() => () => {
    insertedImageUrls.current.forEach(source => URL.revokeObjectURL(source));
    insertedImageUrls.current.clear();
  }, []);
  useHydratedManagedImages(editor, value, resourceCode, workflowBinding);

  const emit = () => {
    if (!editor.current) return;
    const normalized = editableRichTextValue(editor.current);
    const liveObjectUrls = new Set(
      [...editor.current.querySelectorAll('img')]
        .map(image => image.getAttribute('src') || '')
        .filter(source => source.startsWith('blob:'))
    );
    for (const source of insertedImageUrls.current) {
      if (liveObjectUrls.has(source)) continue;
      URL.revokeObjectURL(source);
      insertedImageUrls.current.delete(source);
    }
    onChange?.(normalized);
  };

  const command = (name: string, argument?: string) => {
    if (locked) return;
    editor.current?.focus();
    document.execCommand(name, false, argument);
    emit();
  };

  const insertLink = () => {
    if (locked) return;
    const url = window.prompt('链接地址');
    if (url && /^(?:https?:|mailto:|tel:)/i.test(url.trim())) {
      command('createLink', url.trim());
    }
  };

  const chooseImage = () => {
    if (locked) return;
    const selection = window.getSelection();
    selectedImageRange.current =
      selection?.rangeCount && editor.current?.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
    imageInput.current?.click();
  };

  const insertImage = async (file: File) => {
    if (locked || !editor.current || !onUpload || !uploadResource) return;
    const container = editor.current;
    const selectedRange = selectedImageRange.current;
    selectedImageRange.current = null;
    const originalGeneration = generation.current;
    let uploadStarted = false;
    try {
      setImageError('');
      setImageUploading(true);
      if (!INLINE_IMAGE_ACCEPT.split(',').includes(file.type)) {
        throw new Error('仅支持 PNG、JPEG、WebP 或 GIF 图片');
      }
      if (file.size > INLINE_IMAGE_MAX_BYTES) {
        throw new Error('单张图片不能超过 10MB');
      }
      if (editor.current.querySelectorAll('img').length >= INLINE_IMAGE_MAX_COUNT) {
        throw new Error('每个富文本最多插入 20 张图片');
      }
      let adopted = false;
      const adopt = (uploaded: DataFileRef) => {
        if (adopted || generation.current !== originalGeneration || editor.current !== container) return;
        const image = document.createElement('img');
        const source = dataRichTextImageSource(uploadResource, uploaded.id);
        image.setAttribute(MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE, source);
        const range = selectedRange || document.createRange();
        if (selectedRange && !container.contains(range.commonAncestorContainer)) {
          throw new Error('原插入位置已变更，请保留当前文字并重新核对。');
        }
        if (!selectedRange) { range.selectNodeContents(container); range.collapse(false); }
        const objectUrl = URL.createObjectURL(file);
        insertedImageUrls.current.add(objectUrl);
        image.src = objectUrl; image.alt = file.name;
        range.deleteContents(); range.insertNode(image);
        range.setStartAfter(image); range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges(); selection?.addRange(range);
        adopted = true; setImageError(''); emit();
      };
      uploadStarted = true;
      adopt(await onUpload(file, adopt));
    } catch (error) {
      if (generation.current === originalGeneration) {
        setImageError(workflowBinding?.taskId && uploadStarted ? '' : error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (generation.current === originalGeneration) setImageUploading(false);
    }
  };

  const toolbarButton = (label: string, icon: ReactNode, action: () => void) => mobile ? (
    <span key={label} onPointerDown={event => event.preventDefault()}><MobileButton aria-label={label} disabled={locked} fill="none" size="small"
      onClick={action}>{icon}</MobileButton></span>
  ) : <Tooltip key={label} title={label}><Button aria-label={label} disabled={locked} icon={icon}
    onMouseDown={event => event.preventDefault()} onClick={action} size="small" /></Tooltip>;
  const toolbar = <>
    {TOOLS.map(tool => toolbarButton(tool.label, tool.icon, () => command(tool.command)))}
    {toolbarButton('插入链接', <LinkOutlined />, insertLink)}
    {onUpload && uploadResource && toolbarButton('插入图片', <FileImageOutlined />, chooseImage)}
  </>;

  return (
    <div className={`oxa-rich-text-field${mobile ? ' oxa-mobile-rich-text-field oxa-mobile-scope' : ''}`}>
      {mobile ? <div className="oxa-rich-text-toolbar">{toolbar}</div> : <Space className="oxa-rich-text-toolbar" size={4} wrap>{toolbar}</Space>}
      <input
        disabled={locked}
        accept={INLINE_IMAGE_ACCEPT}
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void insertImage(file);
        }}
        ref={imageInput}
        style={{ display: 'none' }}
        type="file"
      />
      {imageError && <div className="oxa-rich-text-error" role="alert">{imageError}</div>}
      <div
        aria-label="富文本内容"
        aria-disabled={locked}
        aria-multiline="true"
        className="oxa-rich-text-editor"
        contentEditable={!locked}
        onBlur={emit}
        onInput={emit}
        ref={editor}
        role="textbox"
        suppressContentEditableWarning
      />
    </div>
  );
}
