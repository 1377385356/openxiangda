import { PresentationTime } from '../../presentation-time';
import { Button as MobileButton, Popup } from '../../mobile';
import { MobileSheetHeader } from './MobileFieldLayout';
import {
  ClearOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Image,
  Modal,
  Space,
  Spin,
  Typography,
} from 'antd';
import type {
  DataFileRef,
  StableSignaturePoint,
  StableSignatureValue,
  UserReferenceValue,
} from 'openxiangda-contracts/browser';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  fetchDataFileBlob,
  fetchWorkflowDataFileBlob,
  type WorkflowFileBinding,
} from '../../platform-client';

const CANVAS_HEIGHT = 240;

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function managedFile(file: DataFileRef): StableSignatureValue['file'] {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    contentType: file.contentType,
  };
}

function SignatureImage({
  value,
  resourceCode,
  workflowBinding,
  mobile = false,
}: {
  value: StableSignatureValue;
  resourceCode?: string;
  workflowBinding?: WorkflowFileBinding;
  mobile?: boolean;
}) {
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(
    Boolean(resourceCode || workflowBinding),
  );

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (!resourceCode && !workflowBinding) return;
    setLoading(true);
    const request = workflowBinding
      ? fetchWorkflowDataFileBlob(workflowBinding, value.file.id)
      : fetchDataFileBlob(resourceCode!, value.file.id);
    request
      .then(blob => {
        if (active) { objectUrl = URL.createObjectURL(blob); setSource(objectUrl); }
      })
      .catch(() => {
        if (active) setSource('');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    resourceCode,
    value.file.id,
    workflowBinding?.instanceId,
    workflowBinding?.resourceCode,
    workflowBinding?.recordId,
    workflowBinding?.fieldCode,
  ]);

  if (loading) return <Spin size="small" />;
  return source ? (
    mobile ? <img alt="业务签名" className="oxa-signature-image" src={source} /> : <Image alt="业务签名" className="oxa-signature-image" preview src={source} />
  ) : (
    <Typography.Text>{value.file.name}</Typography.Text>
  );
}

export function SignatureValueDisplay({
  value,
  resourceCode,
  workflowBinding,
}: {
  value: StableSignatureValue;
  resourceCode?: string;
  workflowBinding?: WorkflowFileBinding;
}) {
  return (
    <div className="oxa-signature-value">
      <SignatureImage
        resourceCode={resourceCode}
        value={value}
        workflowBinding={workflowBinding}
      />
      <Typography.Text type="secondary">
        {value.signer?.label || '业务签名'} · <PresentationTime value={value.signedAt} />
      </Typography.Text>
      <Typography.Text className="oxa-signature-hash" type="secondary">
        SHA-256 {value.hash.slice(0, 16)}...
      </Typography.Text>
    </div>
  );
}

export function SignatureField({
  value,
  onChange,
  onUpload,
  signer,
  resourceCode,
  disabled = false,
  mobile = false,
}: {
  value?: StableSignatureValue;
  onChange?: (value: StableSignatureValue | undefined) => void;
  onUpload?: (file: File) => Promise<DataFileRef>;
  signer?: UserReferenceValue;
  resourceCode?: string;
  disabled?: boolean;
  mobile?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const points = useRef<StableSignaturePoint[]>([]);
  const [open, setOpen] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const prepare = useCallback(() => {
    const element = canvas.current;
    if (!element) return;
    const width = Math.max(1, element.getBoundingClientRect().width || 640);
    const ratio = window.devicePixelRatio || 1;
    element.width = Math.floor(width * ratio);
    element.height = Math.floor(CANVAS_HEIGHT * ratio);
    const context = element.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, CANVAS_HEIGHT);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = mobile ? 3 : 2.4;
    context.strokeStyle = '#111827';
  }, [mobile]);

  useEffect(() => {
    if (!open) return;
    points.current = [];
    setDrawn(false);
    setError('');
    requestAnimationFrame(() => requestAnimationFrame(prepare));
  }, [open, prepare]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      t: Date.now(),
    };
  };

  const clear = () => {
    points.current = [];
    setDrawn(false);
    setError('');
    prepare();
  };

  const save = async () => {
    if (!canvas.current || !points.current.length) {
      setError('请先完成签名');
      return;
    }
    if (!onUpload) {
      setError('当前签名字段未配置托管文件上传能力');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.current?.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('生成签名 PNG 失败');
      const hash = await sha256(blob);
      const file = new File([blob], `signature-${Date.now()}.png`, {
        type: 'image/png',
      });
      const uploaded = await onUpload(file);
      onChange?.({
        file: managedFile(uploaded),
        ...(signer ? { signer } : {}),
        signedAt: new Date().toISOString(),
        points: points.current.slice(),
        hash,
      });
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const canvasContent = (
    <div className="oxa-signature-pad">
      <canvas
        aria-label="手写签名画布"
        className="oxa-signature-canvas"
        onPointerCancel={() => { drawing.current = false; }}
        onPointerDown={event => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          const next = point(event);
          points.current.push(next);
          const context = event.currentTarget.getContext('2d');
          if (context) {
            context.beginPath();
            context.arc(next.x, next.y, 1, 0, Math.PI * 2);
            context.fillStyle = '#111827';
            context.fill();
          }
          setDrawn(true);
        }}
        onPointerMove={event => {
          event.preventDefault();
          if (!drawing.current) return;
          const previous = points.current[points.current.length - 1];
          const next = point(event);
          const context = event.currentTarget.getContext('2d');
          if (context && previous) {
            context.beginPath();
            context.moveTo(previous.x, previous.y);
            context.lineTo(next.x, next.y);
            context.stroke();
          }
          points.current.push(next);
        }}
        onPointerUp={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          drawing.current = false;
        }}
        ref={canvas}
      />
      {error && <Alert showIcon title={error} type="error" />}
      {mobile ? <MobileButton disabled={saving} onClick={clear}>清空画布</MobileButton> : <Button disabled={saving} icon={<ClearOutlined />} onClick={clear}>清空画布</Button>}
    </div>
  );

  const dialog: ReactNode = mobile ? (
    <Popup visible={open} bodyClassName="oxa-mobile-signature-sheet" onMaskClick={() => !saving && setOpen(false)} destroyOnClose>
      <section role="dialog" aria-label="手写签名"><MobileSheetHeader title="手写签名" disabled={!drawn || saving} confirmText={saving ? '保存中…' : '保存签名'}
        onCancel={() => !saving && setOpen(false)} onConfirm={() => void save()} />{canvasContent}</section>
    </Popup>
  ) : (
    <Modal
      destroyOnHidden
      okButtonProps={{ disabled: !drawn }}
      okText="保存签名"
      onCancel={() => setOpen(false)}
      onOk={() => void save()}
      open={open}
      confirmLoading={saving}
      title="手写签名"
      width={720}
    >
      {canvasContent}
    </Modal>
  );

  if (mobile) return <div className="oxa-mobile-signature-field oxa-mobile-scope">
    <MobileButton className="oxa-mobile-signature-preview" fill="none" disabled={disabled} aria-label={value ? '重新签名' : '开始签名'} onClick={() => setOpen(true)}>
      {value ? <SignatureImage mobile resourceCode={resourceCode} value={value} /> : <span>点击手写签名</span>}
    </MobileButton>
    {value && !disabled && <MobileButton className="oxa-mobile-signature-clear" fill="none" aria-label="清除签名" onClick={() => onChange?.(undefined)}>×</MobileButton>}
    {dialog}
  </div>;
  return (
    <div className="oxa-signature-field">
      {value ? (
        <SignatureValueDisplay resourceCode={resourceCode} value={value} />
      ) : (
        <Typography.Text type="secondary">尚未签名</Typography.Text>
      )}
      {!disabled && (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => setOpen(true)}>
            {value ? '重新签名' : '开始签名'}
          </Button>
          {value && (
            <Button
              aria-label="清除签名"
              icon={<DeleteOutlined />}
              onClick={() => onChange?.(undefined)}
            />
          )}
        </Space>
      )}
      {dialog}
    </div>
  );
}
