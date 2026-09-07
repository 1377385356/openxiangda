import type { DataResourceSurface } from 'openxiangda-contracts/browser';

export interface GeneratedResourceDefinition {
  code: string;
  viewCode?: string;
  name: string;
  capabilities: {
    read: string;
    create: string;
    update: string;
    delete: string;
  };
  surface: DataResourceSurface;
}

export type GeneratedResourceDefinitions = Record<
  string,
  GeneratedResourceDefinition
>;

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

/** Compiler output is emitted with `as const`; the runtime never mutates it. */
export type GeneratedResourceDefinitionsInput = DeepReadonly<GeneratedResourceDefinitions>;
