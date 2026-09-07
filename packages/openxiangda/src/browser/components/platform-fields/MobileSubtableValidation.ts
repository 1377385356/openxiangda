import { createContext, useCallback, useRef } from 'react';

type ValidateRow = () => Promise<void>;
export const MobileSubtableValidationContext = createContext<
  ((key: string, validate: ValidateRow) => () => void) | null
>(null);

/** Inline row forms remain the sole field/validation owners, including collapsed rows. */
export function useMobileSubtableValidation() {
  const rows = useRef(new Map<string, ValidateRow>());
  const register = useCallback((key: string, validate: ValidateRow) => {
    rows.current.set(key, validate);
    return () => {
      rows.current.delete(key);
    };
  }, []);
  const validator = useCallback(async () => {
    await Promise.all([...rows.current.values()].map(validate => validate()));
  }, []);
  return { register, validator };
}
