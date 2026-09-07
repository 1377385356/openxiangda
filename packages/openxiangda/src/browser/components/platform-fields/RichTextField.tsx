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
import type { DataFileRef } from 'openxiangda-contracts/browser';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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

  useEffect(() => () => {
    objectUrls.current.forEach(source => URL.revokeObjectURL(source));
    objectUrls.current.clear();
    pendingBlobs.current.clear();
  }, []);

  useEffect(() => {
    const container = root.current;
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
}: {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  mobile?: boolean;
  onUpload?: (file: File) => Promise<DataFileRef>;
  resourceCode?: string;
}) {
  const editor = useRef<HTMLDivElement | null>(null);
  const imageInput = useRef<HTMLInputElement | null>(null);
  const insertedImageUrls = useRef(new Set<string>());
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');

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
  useHydratedManagedImages(editor, value, resourceCode);

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
    editor.current?.focus();
    document.execCommand(name, false, argument);
    emit();
  };

  const insertLink = () => {
    const url = window.prompt('链接地址');
    if (url && /^(?:https?:|mailto:|tel:)/i.test(url.trim())) {
      command('createLink', url.trim());
    }
  };

  const insertImage = async (file: File) => {
    if (!editor.current || !onUpload || !resourceCode) return;
    const selection = window.getSelection();
    const selectedRange =
      selection?.rangeCount && editor.current.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
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
      const uploaded = await onUpload(file);
      const image = document.createElement('img');
      const source = dataRichTextImageSource(resourceCode, uploaded.id);
      image.setAttribute(MANAGED_RICH_TEXT_SOURCE_ATTRIBUTE, source);
      const objectUrl = URL.createObjectURL(file);
      insertedImageUrls.current.add(objectUrl);
      image.src = objectUrl;
      image.alt = file.name;
      const range = selectedRange || document.createRange();
      if (!selectedRange) {
        range.selectNodeContents(editor.current);
        range.collapse(false);
      }
      range.deleteContents();
      range.insertNode(image);
      range.setStartAfter(image);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      emit();
    } catch (error) {
      setImageError(error instanceof Error ? error.message : String(error));
    } finally {
      setImageUploading(false);
    }
  };

  return (
    <div className={`oxa-rich-text-field${mobile ? ' oxa-mobile-rich-text-field' : ''}`}>
      <Space className="oxa-rich-text-toolbar" size={4} wrap>
        {TOOLS.map(tool => (
          <Tooltip key={tool.command} title={tool.label}>
            <Button
              aria-label={tool.label}
              disabled={disabled}
              icon={tool.icon}
              onMouseDown={event => {
                event.preventDefault();
                command(tool.command);
              }}
              size="small"
            />
          </Tooltip>
        ))}
        <Tooltip title="插入链接">
          <Button
            aria-label="插入链接"
            disabled={disabled}
            icon={<LinkOutlined />}
            onMouseDown={event => {
              event.preventDefault();
              insertLink();
            }}
            size="small"
          />
        </Tooltip>
        {onUpload && resourceCode && (
          <Tooltip title="插入图片">
            <Button
              aria-label="插入图片"
              disabled={disabled}
              icon={<FileImageOutlined />}
              loading={imageUploading}
              onMouseDown={event => {
                event.preventDefault();
                imageInput.current?.click();
              }}
              size="small"
            />
          </Tooltip>
        )}
      </Space>
      <input
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
        className="oxa-rich-text-editor"
        contentEditable={!disabled}
        onBlur={emit}
        onInput={emit}
        ref={editor}
        role="textbox"
        suppressContentEditableWarning
      />
    </div>
  );
}
