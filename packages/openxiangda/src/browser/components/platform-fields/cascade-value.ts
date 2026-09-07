import type { DataFieldOption, LabeledValue } from 'openxiangda-contracts/browser';

export type CascadeStoredValue = LabeledValue[] | LabeledValue[][];

function optionSnapshot(option: DataFieldOption): LabeledValue {
  return {
    value: option.value,
    label: option.label,
    ...(option.description ? { description: option.description } : {}),
    ...(option.color ? { color: option.color } : {}),
  };
}

function resolvePath(
  options: DataFieldOption[],
  ids: string[],
  index = 0
): LabeledValue[] | undefined {
  const option = options.find(item => item.value === ids[index]);
  if (!option) return undefined;
  if (index === ids.length - 1) return [optionSnapshot(option)];
  const child = resolvePath(option.children || [], ids, index + 1);
  return child ? [optionSnapshot(option), ...child] : undefined;
}

export function cascadeControlValue(
  value: CascadeStoredValue | undefined,
  multiple: boolean
) {
  if (multiple) {
    return (Array.isArray(value) ? value : [])
      .filter((path): path is LabeledValue[] => Array.isArray(path))
      .map(path => path.map(item => item.value));
  }
  return (Array.isArray(value) ? value : [])
    .filter((item): item is LabeledValue => !Array.isArray(item))
    .map(item => item.value);
}

export function cascadeStoredValue(
  options: DataFieldOption[],
  value: unknown,
  multiple: boolean
) {
  const paths = multiple
    ? (Array.isArray(value) ? value : []).filter(Array.isArray) as string[][]
    : Array.isArray(value) && value.length ? [value.map(String)] : [];
  const snapshots = paths
    .map(path => resolvePath(options, path.map(String)))
    .filter((path): path is LabeledValue[] => Boolean(path));
  return multiple ? snapshots : snapshots[0];
}

export function cascadeTerminalValues(
  value: CascadeStoredValue | undefined,
  multiple: boolean
) {
  const paths = multiple
    ? (Array.isArray(value) ? value : []).filter(Array.isArray) as LabeledValue[][]
    : [Array.isArray(value)
        ? value.filter(item => !Array.isArray(item)) as LabeledValue[]
        : []];
  return paths
    .map(path => path[path.length - 1]?.value)
    .filter((item): item is string => Boolean(item));
}
