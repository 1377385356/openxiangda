import {
  CloseOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { Alert, Button, Empty, Result, Segmented, Spin, Typography } from 'antd';
import type { DataFilePreview } from 'openxiangda-contracts/browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  downloadDataFile,
  downloadWorkflowDataFile,
  fetchDataFileBlob,
  fetchWorkflowDataFileBlob,
  loadDataFilePreview,
  loadWorkflowDataFilePreview,
  type WorkflowFileBinding,
} from './platform-client';
import { formatManagedFileSize } from './components/platform-fields/AttachmentFileList';

const MAX_SPREADSHEET_ROWS = 5_000;
const MAX_SPREADSHEET_COLUMNS = 200;

function DocxDocument({ blob }: { blob: Blob }) {
  const styleRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const body = bodyRef.current;
    const style = styleRef.current;
    if (!body || !style) return;
    body.replaceChildren();
    style.replaceChildren();
    setError('');
    void import('docx-preview')
      .then(({ renderAsync }) =>
        renderAsync(blob, body, style, {
          className: 'oxa-docx-document',
          inWrapper: true,
          ignoreFonts: false,
          ignoreHeight: false,
          ignoreWidth: false,
          renderChanges: false,
          renderHeaders: true,
          renderFooters: true,
        })
      )
      .catch(reason => {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      active = false;
      body.replaceChildren();
      style.replaceChildren();
    };
  }, [blob]);
  if (error) {
    return <Alert title="Word 文档解析失败" description={error} type="error" showIcon />;
  }
  return (
    <div className="oxa-docx-preview">
      <div ref={styleRef} />
      <div ref={bodyRef} />
    </div>
  );
}

function SpreadsheetDocument({ blob }: { blob: Blob }) {
  const [sheetName, setSheetName] = useState('');
  const [sheets, setSheets] = useState<Record<string, unknown[][]>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    setSheets({});
    void Promise.all([blob.arrayBuffer(), import('xlsx')])
      .then(([buffer, XLSX]) => {
        const workbook = XLSX.read(buffer, {
          type: 'array',
          cellFormula: false,
          cellHTML: false,
          cellText: true,
        });
        if (!active) return;
        setSheets(
          Object.fromEntries(
            workbook.SheetNames.slice(0, 50).map(name => [
              name,
              (
                XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name]!, {
                  header: 1,
                  raw: false,
                  blankrows: false,
                  defval: '',
                }) as unknown[][]
              )
                .slice(0, MAX_SPREADSHEET_ROWS)
                .map(row => row.slice(0, MAX_SPREADSHEET_COLUMNS)),
            ])
          )
        );
        setSheetName(workbook.SheetNames[0] || '');
      })
      .catch(reason => {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      active = false;
    };
  }, [blob]);
  const rows = sheets[sheetName] || [];
  if (error) {
    return <Alert title="Excel 文件解析失败" description={error} type="error" showIcon />;
  }
  const sheetNames = Object.keys(sheets);
  if (!sheetNames.length) return <Spin description="正在解析 Excel 文件" />;
  return (
    <div className="oxa-spreadsheet-preview">
      {sheetNames.length > 1 && (
        <Segmented
          block
          onChange={value => setSheetName(String(value))}
          options={sheetNames}
          value={sheetName}
        />
      )}
      <div className="oxa-spreadsheet-scroll">
        {rows.length ? (
          <table>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th>{rowIndex + 1}</th>
                  {row.map((cell, columnIndex) => (
                    <td key={columnIndex}>{String(cell ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty description="当前工作表没有可显示的数据" />
        )}
      </div>
      {(rows.length >= MAX_SPREADSHEET_ROWS ||
        rows.some(row => row.length >= MAX_SPREADSHEET_COLUMNS)) && (
        <Alert
          banner
          title={`为保证浏览器稳定，仅展示前 ${MAX_SPREADSHEET_ROWS} 行、${MAX_SPREADSHEET_COLUMNS} 列`}
          type="warning"
        />
      )}
    </div>
  );
}

function PreviewBody({ preview, blob }: { preview: DataFilePreview; blob?: Blob }) {
  const objectUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : ''), [blob]);
  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl]
  );
  if (!preview.canPreview || preview.renderMode === 'download') {
    return (
      <Empty
        description={
          <div>
            <Typography.Text strong>当前文件无法在线预览</Typography.Text>
            <br />
            <Typography.Text type="secondary">
              {preview.unsupportedReason || '请下载后使用本地应用打开'}
            </Typography.Text>
          </div>
        }
      />
    );
  }
  if (!blob) return <Spin description="正在读取文件内容" />;
  if (preview.previewType === 'image') {
    return <img alt={preview.file.name} className="oxa-preview-image" src={objectUrl} />;
  }
  if (preview.renderMode === 'pdfjs') {
    return (
      <iframe
        className="oxa-preview-frame"
        src={objectUrl}
        title={`${preview.file.name} PDF 预览`}
      />
    );
  }
  if (preview.renderMode === 'docx-html') return <DocxDocument blob={blob} />;
  if (
    preview.renderMode === 'excel-client' ||
    preview.renderMode === 'excel-basic'
  ) {
    return <SpreadsheetDocument blob={blob} />;
  }
  return (
    <Empty description={preview.unsupportedReason || '当前文件没有可用的预览器'} />
  );
}

function previewIcon(preview?: DataFilePreview) {
  if (preview?.previewType === 'image') return <FileImageOutlined />;
  if (preview?.previewType === 'pdf') return <FilePdfOutlined />;
  if (preview?.previewType === 'spreadsheet') return <FileExcelOutlined />;
  if (preview?.previewType === 'office') return <FileWordOutlined />;
  return <PaperClipOutlined />;
}

export function FilePreviewPage() {
  const { resourceCode = '', fileId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const workflowBinding = useMemo<WorkflowFileBinding | null>(() => {
    const instanceId = searchParams.get('workflowInstanceId')?.trim() || '';
    const recordId = searchParams.get('workflowRecordId')?.trim() || '';
    const fieldCode = searchParams.get('workflowFieldCode')?.trim() || '';
    return instanceId && recordId && fieldCode && resourceCode
      ? { instanceId, recordId, fieldCode, resourceCode }
      : null;
  }, [resourceCode, searchParams]);
  const [preview, setPreview] = useState<DataFilePreview>();
  const [blob, setBlob] = useState<Blob>();
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    let active = true;
    setPreview(undefined);
    setBlob(undefined);
    setError('');
    if (!resourceCode || !fileId) {
      setError('OPENXIANGDA_NATIVE_DATA_FILE_PREVIEW_PATH_INVALID');
      return () => {
        active = false;
      };
    }
    const previewRequest = workflowBinding
      ? loadWorkflowDataFilePreview(workflowBinding, fileId)
      : loadDataFilePreview(resourceCode, fileId);
    void previewRequest
      .then(async metadata => {
        if (!active) return;
        setPreview(metadata);
        document.title = `${metadata.file.name} - 文件预览`;
        if (metadata.canPreview && metadata.renderMode !== 'download') {
          const content = workflowBinding
            ? await fetchWorkflowDataFileBlob(workflowBinding, fileId)
            : await fetchDataFileBlob(resourceCode, fileId);
          if (active) setBlob(content);
        }
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [
    fileId,
    resourceCode,
    workflowBinding?.instanceId,
    workflowBinding?.recordId,
    workflowBinding?.fieldCode,
  ]);

  const download = async () => {
    if (!resourceCode || !fileId) return;
    setDownloading(true);
    try {
      if (workflowBinding) {
        await downloadWorkflowDataFile(
          workflowBinding,
          fileId,
          preview?.file.name || 'attachment',
        );
      } else {
        await downloadDataFile(
          resourceCode,
          fileId,
          preview?.file.name || 'attachment'
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="oxa-file-preview-page">
      <header className="oxa-file-preview-toolbar">
        <div className="oxa-file-preview-title">
          {previewIcon(preview)}
          <div>
            <strong>{preview?.file.name || '文件预览'}</strong>
            <span>
              {preview
                ? `${preview.extension.toUpperCase() || '文件'} · ${formatManagedFileSize(preview.file.size)} · 只读预览`
                : '正在加载预览信息'}
            </span>
          </div>
        </div>
        <div>
          {resourceCode && fileId && (
            <Button
              icon={<DownloadOutlined />}
              loading={downloading}
              onClick={() => void download()}
            >
              下载文件
            </Button>
          )}
          <Button icon={<CloseOutlined />} onClick={() => window.close()}>
            关闭
          </Button>
        </div>
      </header>
      <main className="oxa-file-preview-body">
        {error ? (
          <Result
            status="error"
            title="文件预览加载失败"
            subTitle={error}
            extra={
              resourceCode && fileId ? (
                <Button
                  icon={<DownloadOutlined />}
                  loading={downloading}
                  onClick={() => void download()}
                  type="primary"
                >
                  下载文件
                </Button>
              ) : undefined
            }
          />
        ) : preview ? (
          <PreviewBody blob={blob} preview={preview} />
        ) : (
          <Spin description="正在确认文件权限与预览能力" />
        )}
      </main>
    </div>
  );
}
