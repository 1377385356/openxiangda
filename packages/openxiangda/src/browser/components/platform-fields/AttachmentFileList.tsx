import {
  CloseOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileWordOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { App, Button, Image, Space } from 'antd';
import type { DataFileRef } from 'openxiangda-contracts/browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  downloadDataFile,
  fetchDataFileBlob,
  loadDataFilePreview,
  type WorkflowFileBinding,
  downloadWorkflowDataFile,
  fetchWorkflowDataFileBlob,
  loadWorkflowDataFilePreview,
} from '../../platform-client';
import { Button as MobileButton, ImageViewer as MobileImageViewer } from '../../mobile';
import { attachmentPreviewPath } from '../../runtime-meta';

interface PreviewImage {
  id: string;
  name: string;
  src: string;
}

const IMAGE_EXTENSIONS = new Set([
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
]);

function extension(name: string) {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
}

function isImage(file: DataFileRef) {
  return (
    file.contentType.toLowerCase().startsWith('image/') ||
    IMAGE_EXTENSIONS.has(extension(file.name))
  );
}

function fileIcon(file: DataFileRef) {
  const suffix = extension(file.name);
  if (isImage(file)) return <FileImageOutlined />;
  if (suffix === 'pdf') return <FilePdfOutlined />;
  if (suffix === 'doc' || suffix === 'docx') return <FileWordOutlined />;
  if (suffix === 'xls' || suffix === 'xlsx') return <FileExcelOutlined />;
  if (suffix === 'txt' || suffix === 'csv') return <FileTextOutlined />;
  return <PaperClipOutlined />;
}

export function formatManagedFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function revokeImages(images: PreviewImage[]) {
  images.forEach(image => URL.revokeObjectURL(image.src));
}

function openIsolatedWindow(url: string) {
  const target = window.open('about:blank', '_blank');
  if (!target) return false;
  target.opener = null;
  target.location.replace(url);
  return true;
}

function ManagedImageThumbnail({
  file,
  resourceCode,
  workflowBinding,
}: {
  file: DataFileRef;
  resourceCode: string;
  workflowBinding?: WorkflowFileBinding;
}) {
  const [source, setSource] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const request = workflowBinding
      ? fetchWorkflowDataFileBlob(
          workflowBinding,
          file.id,
          file.thumbnailUrl ? 'thumbnail' : undefined,
        )
      : fetchDataFileBlob(
          resourceCode,
          file.id,
          file.thumbnailUrl ? 'thumbnail' : undefined,
        );
    void request
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (active) setSource('');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    file.id,
    file.thumbnailUrl,
    resourceCode,
    workflowBinding?.instanceId,
    workflowBinding?.resourceCode,
    workflowBinding?.recordId,
    workflowBinding?.fieldCode,
  ]);

  return source ? (
    <img
      alt=""
      className="oxa-file-thumbnail"
      height={file.height}
      src={source}
      width={file.width}
    />
  ) : (
    fileIcon(file)
  );
}

export function AttachmentFileList({
  files,
  resourceCode = 'resources',
  workflowBinding,
  removable = false,
  mobile = false,
  imageTiles = false,
  uploadTile,
  onRemove,
}: {
  files: DataFileRef[];
  resourceCode?: string;
  workflowBinding?: WorkflowFileBinding;
  removable?: boolean;
  mobile?: boolean;
  imageTiles?: boolean;
  uploadTile?: import('react').ReactNode;
  onRemove?: (file: DataFileRef) => void;
}) {
  const { message } = App.useApp();
  const [openingId, setOpeningId] = useState('');
  const [downloadingId, setDownloadingId] = useState('');
  const [images, setImages] = useState<PreviewImage[]>([]);
  const [imageOpen, setImageOpen] = useState(false);
  const [currentImage, setCurrentImage] = useState(0);
  const previewRequest = useRef(0);
  useEffect(() => () => { previewRequest.current += 1; }, []);
  const imageFiles = useMemo(() => files.filter(isImage), [files]);

  useEffect(() => () => revokeImages(images), [images]);

  const closeImages = () => {
    previewRequest.current += 1;
    setImageOpen(false);
    setImages(current => {
      revokeImages(current);
      return [];
    });
  };

  const previewImage = async (file: DataFileRef) => {
    const request = ++previewRequest.current;
    let resolved: PreviewImage[] = [];
    setOpeningId(file.id);
    try {
      const settled = await Promise.allSettled(
        imageFiles.map(async candidate => {
          const preview = workflowBinding
            ? await loadWorkflowDataFilePreview(workflowBinding, candidate.id)
            : await loadDataFilePreview(resourceCode, candidate.id);
          if (!preview.canPreview || preview.previewType !== 'image') {
            throw new Error(
              preview.unsupportedReason || `${candidate.name} 暂不支持图片预览`
            );
          }
          const blob = workflowBinding
            ? await fetchWorkflowDataFileBlob(workflowBinding, candidate.id)
            : await fetchDataFileBlob(resourceCode, candidate.id);
          return {
            id: candidate.id,
            name: candidate.name,
            src: URL.createObjectURL(blob),
          };
        })
      );
      resolved = settled.flatMap(result =>
        result.status === 'fulfilled' ? [result.value] : []
      );
      if (request !== previewRequest.current) { revokeImages(resolved); return; }
      const current = resolved.findIndex(image => image.id === file.id);
      if (current < 0) {
        const failure = settled.find(
          result => result.status === 'rejected'
        ) as PromiseRejectedResult | undefined;
        throw failure?.reason || new Error('图片预览加载失败');
      }
      setImages(previous => {
        revokeImages(previous);
        return resolved;
      });
      setCurrentImage(current);
      setImageOpen(true);
    } catch (error) {
      revokeImages(resolved);
      if (request === previewRequest.current) message.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === previewRequest.current) setOpeningId('');
    }
  };

  const openPreview = (file: DataFileRef) => {
    if (isImage(file)) {
      void previewImage(file);
      return;
    }
    const basePath = attachmentPreviewPath(resourceCode, file.id);
    const path = workflowBinding
      ? `${basePath}?${new URLSearchParams({
          workflowInstanceId: workflowBinding.instanceId,
          workflowRecordId: workflowBinding.recordId,
          workflowFieldCode: workflowBinding.fieldCode,
        })}`
      : basePath;
    if (!openIsolatedWindow(path)) {
      void message.warning('浏览器阻止了预览窗口，请允许弹出窗口后重试');
    }
  };

  const download = async (file: DataFileRef) => {
    setDownloadingId(file.id);
    try {
      if (workflowBinding) {
        await downloadWorkflowDataFile(
          workflowBinding,
          file.id,
          file.name,
        );
      } else {
        await downloadDataFile(resourceCode, file.id, file.name);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setDownloadingId('');
    }
  };

  return (
    <>
      <div className={mobile ? `oxa-mobile-scope oxa-file-list oxa-mobile-file-list${imageTiles ? " oxa-mobile-image-grid" : ""}` : "oxa-file-list"}>
        {files.map(file => (
          <div className="oxa-file-item" key={file.id}>
            {imageTiles && mobile ? <MobileButton fill="none" aria-label={`预览${file.name}`} className="oxa-file-kind" onClick={() => openPreview(file)}>
              <ManagedImageThumbnail file={file} resourceCode={resourceCode} workflowBinding={workflowBinding} />
            </MobileButton> : imageTiles ? <Button type="text" aria-label={`预览${file.name}`} className="oxa-file-kind" onClick={() => openPreview(file)}>
              <ManagedImageThumbnail file={file} resourceCode={resourceCode} workflowBinding={workflowBinding} />
            </Button> : <span className="oxa-file-kind">
              {isImage(file) ? <ManagedImageThumbnail file={file} resourceCode={resourceCode} workflowBinding={workflowBinding} /> : fileIcon(file)}
            </span>}
            <button
              className="oxa-file-meta oxa-file-name-button"
              disabled={openingId === file.id}
              onClick={() => openPreview(file)}
              type="button"
            >
              <strong>{file.name}</strong>
              <small>{formatManagedFileSize(file.size)}{mobile ? "" : " · 已上传"}</small>
            </button>
            {mobile ? <div className="oxa-mobile-file-actions">
              <MobileButton aria-label={`预览${file.name}`} loading={openingId === file.id} fill="none" onClick={() => openPreview(file)}><EyeOutlined /></MobileButton>
              <MobileButton aria-label={`下载${file.name}`} loading={downloadingId === file.id} fill="none" onClick={() => void download(file)}><DownloadOutlined /></MobileButton>
              {removable && <MobileButton className="oxa-mobile-file-remove" aria-label={`移除${file.name}`} fill="none" onClick={() => onRemove?.(file)}><CloseOutlined /></MobileButton>}
            </div> : <Space size={2}>
              <Button
                aria-label={`预览${file.name}`}
                icon={<EyeOutlined />}
                loading={openingId === file.id}
                onClick={() => openPreview(file)}
                size="small"
                type="text"
              />
              <Button
                aria-label={`下载${file.name}`}
                icon={<DownloadOutlined />}
                loading={downloadingId === file.id}
                onClick={() => void download(file)}
                size="small"
                type="text"
              />
              {removable && (
                <Button
                  aria-label={`移除${file.name}`}
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => onRemove?.(file)}
                  size="small"
                  type="text"
                />
              )}
            </Space>}
          </div>
        ))}
        {uploadTile}
      </div>
      {mobile ? <div className="oxa-mobile-scope">
        {imageOpen && <MobileImageViewer visible images={images.map(image => image.src)} defaultIndex={currentImage}
          onClose={closeImages} renderFooter={(_src, index) => <div className="oxa-mobile-image-footer">
            <span>{images[index]?.name}</span>
            <MobileButton loading={Boolean(downloadingId)} onClick={() => {
              const file = files.find(item => item.id === images[index]?.id);
              if (file) void download(file);
            }}>下载</MobileButton>
            <MobileButton onClick={closeImages}>关闭预览</MobileButton>
          </div>} />}
      </div> : <Image.PreviewGroup
        items={images.map(image => ({ src: image.src, alt: image.name }))}
        preview={{
          open: imageOpen,
          current: currentImage,
          countRender: (current, total) => `${current}/${total}`,
          onChange: setCurrentImage,
          onOpenChange: open => {
            if (!open) closeImages();
          },
        }}
      >
        <span aria-hidden="true" style={{ display: 'none' }} />
      </Image.PreviewGroup>}
    </>
  );
}
