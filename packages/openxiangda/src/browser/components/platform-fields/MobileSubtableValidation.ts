import { createContext, useCallback, useRef } from 'react';

// Local lifecycle observation; each control owns its unfinished edits and pending Files.
export const SubtableEditActivityContext = createContext<((key: string, pending: boolean) => void) | null>(null);

type ValidateRow = () => Promise<void>;
export const MobileSubtableValidationContext = createContext<
  ((key: string, validate: ValidateRow) => () => void) | null
>(null);

/** Field Kit registers complete-value validation as well as current-page inline feedback. */
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
