import type { WorkflowTaskFormSurface } from 'openxiangda-contracts/browser';
import { applyWorkflowTaskPageValues } from 'openxiangda-contracts/browser';

/** Reconcile only errors owned by the task page's top-level required check. */
export function workflowTaskRequiredErrorUpdates(
  source: WorkflowTaskFormSurface,
  current: Record<string, unknown>,
  owned: ReadonlyMap<string, string>,
  readErrors: (field: string) => string[],
) {
  const release: string[] = [];
  const fields: Array<{ name: string; errors: string[] }> = [];
  for (const [code, message] of owned) {
    const errors = readErrors(code);
    if (!errors.includes(message)) { release.push(code); continue; }
    const field = source.page.fields.find(item => item.code === code);
    if (field) {
      try {
        // Keep the full value context for expressions and reuse the contract's
        // empty/subtable rules, while checking this one owned error only.
        applyWorkflowTaskPageValues({ ...source.page, fields: [field] }, current, {}, true);
      } catch { continue; }
    }
    release.push(code);
    fields.push({ name: code, errors: errors.filter(error => error !== message) });
  }
  return { release, fields };
}
