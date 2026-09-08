import { createContext, useContext } from 'react';

export const PresentationTimeZoneContext = createContext<string | undefined>(undefined);

export function validatePresentationTimeZone(timeZone?: string) {
  if (timeZone === undefined) return undefined;
  try {
    if (!timeZone || /^[+-]/.test(timeZone)) throw new Error('invalid');
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
    return timeZone;
  } catch {
    throw new Error('OPENXIANGDA_TIME_ZONE_INVALID');
  }
}

export function usePresentationTimeZone(override?: string) {
  const inherited = useContext(PresentationTimeZoneContext);
  return validatePresentationTimeZone(override ?? inherited);
}

export function formatPresentationTime(value: unknown, timeZone?: string,
  options?: Intl.DateTimeFormatOptions) {
  if (value === null || value === undefined || value === '') return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('zh-CN', { hour12: false, ...options, timeZone });
}

export function PresentationTime({ value, timeZone, options }: {
  value: unknown; timeZone?: string; options?: Intl.DateTimeFormatOptions;
}) {
  const zone = usePresentationTimeZone(timeZone);
  return <>{formatPresentationTime(value, zone, options)}</>;
}
