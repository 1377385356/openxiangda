import type {
  DepartmentReferenceValue,
  DirectoryEntry,
  UserReferenceValue,
} from 'openxiangda-contracts/browser';
import type { DirectoryKind } from '../../platform-client';

export type DirectoryStoredValue = UserReferenceValue | DepartmentReferenceValue;

export function directoryStoredValues(
  value?: DirectoryStoredValue | DirectoryStoredValue[]
) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

export function directoryEntryFromStored(
  kind: DirectoryKind,
  value: DirectoryStoredValue
): DirectoryEntry {
  const description = kind === 'user'
    ? [
        (value as UserReferenceValue).employeeNo,
        (value as UserReferenceValue).departments?.map(item => item.label).join(' / '),
      ].filter(Boolean).join(' · ')
    : (value as DepartmentReferenceValue).fullPath || '';
  return {
    kind,
    id: value.value,
    label: value.label,
    snapshot: value,
    ...(description ? { description } : {}),
    ...(kind === 'department' && (value as DepartmentReferenceValue).parent
      ? { parentId: (value as DepartmentReferenceValue).parent!.value }
      : {}),
    ...(kind === 'department' && (value as DepartmentReferenceValue).path?.length
      ? {
          path: (value as DepartmentReferenceValue).path!.map(item => ({
            id: item.value,
            label: item.label,
          })),
        }
      : {}),
    selectable: true,
  };
}

export function directoryStoredValueFromEntries(
  entries: DirectoryEntry[],
  multiple: boolean
) {
  const snapshots = entries.map(entry => entry.snapshot);
  return multiple ? snapshots : snapshots[0];
}
