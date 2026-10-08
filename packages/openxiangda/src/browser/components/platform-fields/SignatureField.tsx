import { PresentationTime } from '../../presentation-time';
import { browserSha256 } from '../../sha256';
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
const MAX_TASK_POINTS = 512;

function sampledPoints(input: StableSignaturePoint[], maximum: number) {
  if (input.length <= maximum) return input.slice();
  return Array.from({ length: maximum }, (_, index) =>
    input[Math.round(index * (input.length - 1) / (maximum - 1))]!
  );
}

async function sha256(blob: Blob) {
  return browserSha256(new Uint8Array(await blob.arrayBuffer()));
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
    setSource('');
    if (!resourceCode && !workflowBinding) { setLoading(false); return; }
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
    workflowBinding?.taskId,
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
  workflowBinding,
  disabled = false,
  mobile = false,
}: {
  value?: StableSignatureValue | null;
  onChange?: (value: StableSignatureValue | null) => void;
  onUpload?: (file: File, onRecovered?: (file: DataFileRef) => void) => Promise<DataFileRef>;
  signer?: UserReferenceValue;
  resourceCode?: string;
  workflowBinding?: WorkflowFileBinding;
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
  const scope = JSON.stringify([resourceCode, workflowBinding?.taskId, workflowBinding?.instanceId,
    workflowBinding?.resourceCode, workflowBinding?.recordId, workflowBinding?.fieldCode]);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setOpen(false); setSaving(false); setError(''); drawing.current = false;
    return () => { generation.current += 1; };
  }, [scope]);
  const locked = disabled || saving;

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
    if (locked) return;
    points.current = [];
    setDrawn(false);
    setError('');
    prepare();
  };

  const save = async () => {
    if (locked) return;
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
    const originalGeneration = generation.current;
    const signedAt = new Date().toISOString();
    const originalPoints = workflowBinding?.taskId
      ? sampledPoints(points.current, MAX_TASK_POINTS) : points.current.slice();
    let uploadStarted = false;
    try {
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.current?.toBlob(resolve, 'image/png')
      );
      if (!blob) throw new Error('生成签名 PNG 失败');
      const hash = await sha256(blob);
      const file = new File([blob], `signature-${Date.now()}.png`, {
        type: 'image/png',
      });
      const envelope = {
        ...(signer ? { signer } : {}),
        signedAt,
        points: originalPoints,
        hash,
      };
      const adopt = (uploaded: DataFileRef) => {
        if (generation.current !== originalGeneration) return;
        onChange?.({ ...envelope, file: managedFile(uploaded) });
        setOpen(false); setError('');
      };
      if (generation.current !== originalGeneration) return;
      uploadStarted = true;
      adopt(await onUpload(file, adopt));
    } catch (reason) {
      if (generation.current !== originalGeneration) return;
      if (workflowBinding?.taskId && uploadStarted) {
        // The task recovery panel owns upload failures and the original envelope.
        setOpen(false); setError('');
      } else setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (generation.current === originalGeneration) setSaving(false);
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
          if (locked) return;
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
          if (locked || !drawing.current) return;
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
          if (workflowBinding?.taskId && points.current.length > 4096) {
            points.current = sampledPoints(points.current, 2048);
          }
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
      {mobile ? <MobileButton disabled={locked} onClick={clear}>清空画布</MobileButton> : <Button disabled={locked} icon={<ClearOutlined />} onClick={clear}>清空画布</Button>}
    </div>
  );

  const dialog: ReactNode = mobile ? (
    <Popup visible={open} bodyClassName="oxa-mobile-signature-sheet" onMaskClick={() => !locked && setOpen(false)} destroyOnClose>
      <section role="dialog" aria-label="手写签名"><MobileSheetHeader title="手写签名" disabled={!drawn || locked} confirmText={saving ? '保存中…' : '保存签名'}
        onCancel={() => !locked && setOpen(false)} onConfirm={() => void save()} />{canvasContent}</section>
    </Popup>
  ) : (
    <Modal
      destroyOnHidden
      okButtonProps={{ disabled: !drawn || locked }}
      cancelButtonProps={{ disabled: locked }}
      closable={!locked}
      maskClosable={!locked}
      keyboard={!locked}
      okText="保存签名"
      onCancel={() => !locked && setOpen(false)}
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
    <MobileButton className="oxa-mobile-signature-preview" fill="none" disabled={locked} aria-label={value ? '重新签名' : '开始签名'} onClick={() => setOpen(true)}>
      {value ? <SignatureImage mobile resourceCode={resourceCode} workflowBinding={workflowBinding} value={value} /> : <span>点击手写签名</span>}
    </MobileButton>
    {value && <MobileButton disabled={locked} className="oxa-mobile-signature-clear" fill="none" aria-label="清除签名" onClick={() => onChange?.(null)}>×</MobileButton>}
    {dialog}
  </div>;
  return (
    <div className="oxa-signature-field">
      {value ? (
        <SignatureValueDisplay resourceCode={resourceCode} workflowBinding={workflowBinding} value={value} />
      ) : (
        <Typography.Text type="secondary">尚未签名</Typography.Text>
      )}
      {!disabled && (
        <Space>
          <Button disabled={locked} icon={<EditOutlined />} onClick={() => setOpen(true)}>
            {value ? '重新签名' : '开始签名'}
          </Button>
          {value && (
            <Button
              aria-label="清除签名"
              icon={<DeleteOutlined />}
              disabled={locked}
              onClick={() => onChange?.(null)}
            />
          )}
        </Space>
      )}
      {dialog}
    </div>
  );
}
