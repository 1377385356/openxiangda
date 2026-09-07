import { Form } from 'antd';
import type { DataFieldSurface } from 'openxiangda-contracts/browser';
import { cloneElement, isValidElement, type ReactNode } from 'react';

/** Shares the form controller only; labels, errors and input UI are mobile-owned. */
export function MobileFieldFrame({ field, children, extra, ...control }: {
  field: DataFieldSurface;
  children: ReactNode;
  extra?: ReactNode;
  id?: string;
  value?: unknown;
  checked?: boolean;
  onChange?: (...values: unknown[]) => void;
}) {
  const { errors } = Form.Item.useStatus();
  return <div className="oxa-mobile-field" data-platform-field="mobile">
    <label htmlFor={control.id}>{field.label}{field.requiredHint && <span aria-hidden="true"> *</span>}</label>
    {isValidElement<Record<string, unknown>>(children) ? cloneElement(children, { ...control, 'aria-invalid': errors.length > 0 }) : children}
    {errors.length > 0 && <div className="oxa-mobile-field-errors" role="alert">{errors.map((error, index) => <div key={index}>{error}</div>)}</div>}
    {extra && <div className="oxa-mobile-field-extra">{extra}</div>}
  </div>;
}
