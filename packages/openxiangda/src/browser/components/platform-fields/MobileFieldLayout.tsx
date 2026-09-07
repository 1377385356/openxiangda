import type { ReactNode } from 'react';
import { CloseCircleFilled, RightOutlined } from '@ant-design/icons';
import { Button } from '../../mobile';

/** Presentation adapted from the 1.x SDK MobileField, with 2.0 controlled values. */
export function MobileFieldTrigger({
  id,
  title,
  value,
  placeholder = '请选择',
  disabled,
  onClick,
  onClear,
}: {
  id?: string;
  title: string;
  value?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  onClick: () => void;
  onClear?: () => void;
}) {
  return (
    <div className="oxa-mobile-field-trigger">
      <Button
        id={id}
        aria-label={title}
        fill="none"
        disabled={disabled}
        onClick={onClick}
      >
        <span className={!value ? 'is-placeholder' : undefined}>
          {value || placeholder}
        </span>
        {!value && <RightOutlined aria-hidden />}
      </Button>
      {value && onClear && !disabled && (
        <Button
          fill="none"
          aria-label={`清空${title.replace(/^选择/, '')}`}
          onClick={onClear}
        >
          <CloseCircleFilled />
        </Button>
      )}
    </div>
  );
}
export function MobileSheetHeader({
  title,
  cancelText = '取消',
  confirmText = '确定',
  disabled,
  onCancel,
  onConfirm,
}: {
  title?: string;
  cancelText?: string;
  confirmText?: string;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <header className="oxa-mobile-sheet-header">
      <Button fill="none" onClick={onCancel}>
        {cancelText}
      </Button>
      <span>{title}</span>
      <Button
        fill="none"
        color="primary"
        disabled={disabled}
        onClick={onConfirm}
      >
        {confirmText}
      </Button>
    </header>
  );
}
