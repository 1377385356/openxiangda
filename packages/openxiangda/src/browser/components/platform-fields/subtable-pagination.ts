import type { DataFieldSurface } from 'openxiangda-contracts/browser';
import type { SubtableDraftRow } from './subtable-value';
import { validateSurfaceFieldValues } from './surface-field-validation';

export const SUBTABLE_PAGE_SIZE = 10;

export function subtablePage(rows: SubtableDraftRow[], requested: number) {
  const visible = rows.filter(row => row.state !== 'deleted');
  const pages = Math.max(1, Math.ceil(visible.length / SUBTABLE_PAGE_SIZE));
  const page = Math.max(1, Math.min(requested, pages));
  const start = (page - 1) * SUBTABLE_PAGE_SIZE;
  return { page, pages, start, visible, rows: visible.slice(start, start + SUBTABLE_PAGE_SIZE) };
}

export function moveSubtableRow(rows: SubtableDraftRow[], index: number, direction: -1 | 1) {
  const { visible } = subtablePage(rows, 1);
  const target = index + direction;
  if (target < 0 || target >= visible.length) return rows;
  [visible[index], visible[target]] = [visible[target]!, visible[index]!];
  return [...visible, ...rows.filter(row => row.state === 'deleted')];
}

export class SubtableRowValidationError extends Error {
  constructor(public rowIndex: number, public fieldCode: string | undefined, detail: string) {
    super(`第 ${rowIndex + 1} 项：${detail}`);
  }
}

export async function validateSubtableRows(rows: SubtableDraftRow[], fieldsForRow: (row: SubtableDraftRow) => (DataFieldSurface & { key: string })[], mobile = false) {
  const visible = rows.filter(row => row.state !== 'deleted');
  for (const [index, row] of visible.entries()) {
    try { await validateSurfaceFieldValues(fieldsForRow(row), row.data, mobile); }
    catch (error) {
      const first = (error as { errors?: { field?: string; message?: string }[] }).errors?.[0];
      throw new SubtableRowValidationError(index, first?.field, first?.message || '请核对此项内容');
    }
  }
}
