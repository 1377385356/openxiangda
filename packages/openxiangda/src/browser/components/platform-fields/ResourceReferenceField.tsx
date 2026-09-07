import { Form } from 'antd';
import type {
  DataFieldSurface,
  DataFieldSourceLaunchBinding,
  ResourceReferenceValue,
} from 'openxiangda-contracts/browser';
import { useRef } from 'react';
import {
  AuthoritativeSelector,
  MobileAuthoritativeSelector,
} from '../../AuthoritativeSelector';

export function ResourceReferenceField({
  id,
  field,
  fieldCode,
  resourceCode,
  operation,
  launch,
  disabled,
  mobile,
  value,
  onChange,
}: {
  id?: string;
  field: DataFieldSurface;
  fieldCode: string;
  resourceCode?: string;
  operation: 'create' | 'update';
  launch?: DataFieldSourceLaunchBinding;
  disabled?: boolean;
  mobile?: boolean;
  value?: ResourceReferenceValue | ResourceReferenceValue[];
  onChange?: (
    value: ResourceReferenceValue | ResourceReferenceValue[] | undefined
  ) => void;
}) {
  const form = Form.useFormInstance();
  const formValues = Form.useWatch([], form) as
    | Record<string, unknown>
    | undefined;
  const nextBindings = Object.fromEntries(
    (field.source?.filters || []).flatMap(filter =>
      'binding' in filter
        ? [[filter.binding.field, formValues?.[filter.binding.field]]]
        : []
    )
  );
  const bindingsKey = JSON.stringify(nextBindings);
  const stableBindings = useRef({ key: bindingsKey, value: nextBindings });
  if (stableBindings.current.key !== bindingsKey) {
    stableBindings.current = { key: bindingsKey, value: nextBindings };
  }
  const bindings = stableBindings.current.value;
  const Selector = mobile
    ? MobileAuthoritativeSelector
    : AuthoritativeSelector;
  return (
    <Selector
      id={id}
      bindings={bindings}
      disabled={disabled}
      fieldCode={fieldCode}
      multiple={field.type.endsWith('.multiple')}
      onChange={next =>
        onChange?.(
          next as
            | ResourceReferenceValue
            | ResourceReferenceValue[]
            | undefined
        )
      }
      operation={operation}
      launch={launch}
      placeholder={`搜索并选择${field.label}`}
      resourceCode={resourceCode}
      source="resource"
      value={value}
    />
  );
}
