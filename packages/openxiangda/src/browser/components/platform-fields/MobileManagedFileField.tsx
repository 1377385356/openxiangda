import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { DataFileRef } from 'openxiangda-contracts/browser';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../mobile';
import {
  AttachmentFileList,
  formatManagedFileSize,
} from './AttachmentFileList';

type Pending = {
  id: string;
  file: File;
  status: 'uploading' | 'error';
  error?: string;
};

/** Upload tasks are transient; the form remains the owner of completed refs. */
export function MobileManagedFileField({
  value = [],
  onChange,
  upload,
  disabled,
  multiple,
  maxCount,
  maxSizeMb,
  accept,
  resourceCode,
  image = false,
}: {
  value?: DataFileRef[];
  onChange?: (value: DataFileRef[]) => void;
  upload: (file: File) => Promise<DataFileRef>;
  disabled?: boolean;
  multiple?: boolean;
  maxCount: number;
  maxSizeMb: number;
  accept?: string | string[];
  resourceCode?: string;
  image?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const tasks = useRef(new Map<string, Pending>());
  const active = useRef(true);
  const current = useRef(value);
  const [pending, setPending] = useState<Pending[]>([]);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    current.current = value;
  }, [value]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      tasks.current.clear();
    };
  }, []);
  const refresh = () => {
    if (active.current) setPending([...tasks.current.values()]);
  };
  const run = async (item: Pending) => {
    if (disabled || tasks.current.get(item.id)?.status === 'uploading') return;
    const task: Pending = { ...item, status: 'uploading' };
    tasks.current.set(task.id, task);
    refresh();
    try {
      if (item.file.size > maxSizeMb * 1024 * 1024)
        throw new Error(`单个文件不能超过 ${maxSizeMb}MB`);
      const uploaded = await upload(item.file);
      if (!active.current || tasks.current.get(task.id) !== task) return;
      if (current.current.length >= maxCount)
        throw new Error(`最多上传 ${maxCount} 个文件，请先移除已有文件`);
      const next = multiple ? [...current.current, uploaded] : [uploaded];
      current.current = next;
      tasks.current.delete(task.id);
      onChange?.(next);
    } catch (error) {
      if (active.current && tasks.current.get(task.id) === task)
        tasks.current.set(task.id, {
          ...task,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      refresh();
    }
  };
  const select = (files: File[]) => {
    if (disabled || !files.length) return;
    const available = Math.max(
      0,
      maxCount - current.current.length - tasks.current.size
    );
    if (files.length > available || (!multiple && files.length > 1)) {
      setNotice(`还可选择 ${available} 个文件，请重新选择`);
      return;
    }
    setNotice('');
    for (const file of files) {
      const task: Pending = { id: crypto.randomUUID(), file, status: 'error' };
      tasks.current.set(task.id, task);
      void run(task);
    }
  };
  return (
    <div className="oxa-mobile-scope oxa-file-field oxa-mobile-file-field">
      <input
        ref={input}
        type="file"
        hidden
        style={{ display: 'none' }}
        accept={Array.isArray(accept) ? accept.join(',') : accept}
        multiple={multiple}
        disabled={disabled}
        onChange={event => {
          select(Array.from(event.target.files || []));
          event.currentTarget.value = '';
        }}
      />
      {!image && value.length + pending.length < maxCount && (
        <Button
          className="oxa-mobile-upload-button"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <UploadOutlined /> 上传文件
        </Button>
      )}
      {notice && <div role="alert">{notice}</div>}
      <div className="oxa-mobile-pending-files" aria-live="polite">
        {pending.map(item => (
          <div className="oxa-mobile-upload-card" key={item.id}>
            <strong>{item.file.name}</strong>
            <small>
              {formatManagedFileSize(item.file.size)} ·{' '}
              {item.status === 'error' ? '上传失败' : '上传中…'}
            </small>
            {item.error && <div role="alert">{item.error}</div>}
            <div className="oxa-mobile-file-actions">
              {item.status === 'error' && (
                <Button disabled={disabled} onClick={() => void run(item)}>
                  重试
                </Button>
              )}
              <Button
                disabled={disabled}
                onClick={() => {
                  tasks.current.delete(item.id);
                  refresh();
                }}
              >
                移除
              </Button>
            </div>
          </div>
        ))}
      </div>
      <AttachmentFileList
        mobile
        imageTiles={image}
        uploadTile={
          image && value.length + pending.length < maxCount ? (
            <Button
              className="oxa-mobile-image-upload"
              aria-label="上传图片"
              disabled={disabled}
              onClick={() => input.current?.click()}
            >
              <PlusOutlined />
              <span>图片上传</span>
            </Button>
          ) : undefined
        }
        files={value}
        resourceCode={resourceCode}
        removable={!disabled}
        onRemove={file => {
          const next = current.current.filter(item => item.id !== file.id);
          current.current = next;
          onChange?.(next);
        }}
      />
    </div>
  );
}
