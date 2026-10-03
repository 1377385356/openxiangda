import Schema from '@rc-component/async-validator';
import type { DataFieldSurface } from 'openxiangda-contracts/browser';
import { rangeValueValidationMessage } from './field-form-codec';

// The validator publishes CJS plus a bundler entry; Node ESM wraps its default.
const Validator = typeof Schema === 'function' ? Schema : (Schema as unknown as { default: typeof Schema }).default;

/** One rule set for mounted controls and unmounted subtable rows. */
export function surfaceFieldValidationRules(field: DataFieldSurface, mobile = false, disabled = false) {
  if (disabled || field.widget === 'readonly') return [];
  return [
    ...(field.requiredHint ? [{ required: true, message: `请填写或选择${field.label}` }] : []),
    ...(!mobile && field.widget === 'email' ? [{ type: 'email' as const, message: '邮箱格式不正确' }] : []),
    ...(!mobile && field.widget === 'phone' ? [{ pattern: /^1\d{10}$/, message: '请输入 11 位手机号' }] : []),
    ...(field.type === 'date-range' || field.type === 'datetime-range' ? [{
      validator: (_rule: unknown, value: unknown) => {
        const message = rangeValueValidationMessage(field, value);
        return message ? Promise.reject(new Error(message)) : Promise.resolve();
      },
    }] : []),
    ...(mobile && field.type.startsWith('number.') ? [{
      validator: (_rule: unknown, value: unknown) => {
        if (value == null || value === '') return Promise.resolve();
        const valid = typeof value === 'number' && Number.isFinite(value) &&
          (field.type !== 'number.integer' || Number.isSafeInteger(value)) &&
          (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max);
        return valid ? Promise.resolve() : Promise.reject(new Error(
          `请填写有效${field.type === 'number.integer' ? '整数' : '数字'}${field.min === undefined ? '' : `，最小 ${field.min}`}${field.max === undefined ? '' : `，最大 ${field.max}`}`
        ));
      },
    }] : []),
  ];
}

export async function validateSurfaceFieldValues(fields: (DataFieldSurface & { key: string })[], values: Record<string, unknown>, mobile = false) {
  const rules = Object.fromEntries(fields.map(field => [field.key, surfaceFieldValidationRules(field, mobile)
    .map(({ validator, ...rule }) => validator ? { ...rule, asyncValidator: validator } : rule)]));
  await new Validator(rules).validate(values, { first: true });
}
