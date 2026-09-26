import type { DataPage, DataQuery, DataRecord, DataWhere } from 'openxiangda-contracts';

export interface OpenXiangdaResourceTypes {
  record: { id: string; revision: number };
  create: object;
  update: object;
}

/** 字段权限可以隐藏业务字段，不能把生成模型当成无条件完整的读取结果。 */
export type OpenXiangdaReadableRecord<T extends OpenXiangdaResourceTypes['record']> =
  Pick<T, 'id' | 'revision'> & Partial<Omit<T, 'id' | 'revision'>>;

type Field<T> = Extract<keyof T, string>;
type BoundWhere<T> =
  | { and: BoundWhere<T>[] }
  | { or: BoundWhere<T>[] }
  | { not: BoundWhere<T> }
  | (Omit<Extract<DataWhere, { field: string }>, 'field'> & { field: Field<T> });

export type OpenXiangdaResourceQuery<T> = Omit<DataQuery, 'where' | 'select' | 'order'> & {
  where?: BoundWhere<T>;
  select?: Field<T>[];
  order?: Array<{ field: Field<T>; direction?: 'asc' | 'desc'; nulls?: 'first' | 'last' }>;
};

export type OpenXiangdaResourceRecord<T extends OpenXiangdaResourceTypes, C extends string> =
  Omit<DataRecord, 'data' | 'resourceCode'> & {
    resourceCode: C;
    data: OpenXiangdaReadableRecord<T['record']>;
  };

export interface OpenXiangdaBoundResource<T extends OpenXiangdaResourceTypes, C extends string> {
  readonly resourceCode: C;
  query(query: OpenXiangdaResourceQuery<T['record']>): Promise<Omit<DataPage, 'items' | 'resourceCode'> & {
    resourceCode: C;
    items: OpenXiangdaReadableRecord<T['record']>[];
  }>;
  get(id: string): Promise<OpenXiangdaResourceRecord<T, C>>;
  create(data: T['create']): Promise<OpenXiangdaResourceRecord<T, C>>;
  update(id: string, input: { expectedRevision: number; data: T['update'] }): Promise<OpenXiangdaResourceRecord<T, C>>;
  delete(id: string, expectedRevision: number): Promise<OpenXiangdaResourceRecord<T, C>>;
}

interface ResourceTransport {
  query(resourceCode: string, query: DataQuery): Promise<DataPage>;
  get(resourceCode: string, id: string): Promise<DataRecord>;
  create(resourceCode: string, data: Record<string, unknown>): Promise<DataRecord>;
  update(resourceCode: string, id: string, input: { expectedRevision: number; data: Record<string, unknown> }): Promise<DataRecord>;
  delete(resourceCode: string, id: string, expectedRevision: number): Promise<DataRecord>;
}

/** 仅绑定类型/资源；每次调用仍由原 DataApiService 解析其主体和权限。 */
export function bindOpenXiangdaResources<M extends { [K in keyof M]: OpenXiangdaResourceTypes }>(
  transport: ResourceTransport,
) {
  return <C extends Extract<keyof M, string>>(resourceCode: C): OpenXiangdaBoundResource<M[C], C> => {
    const checked = <T extends { resourceCode: string }>(result: T): T => {
      if (result.resourceCode !== resourceCode) throw new Error('OPENXIANGDA_RESOURCE_RESPONSE_MISMATCH');
      return result;
    };
    // Type assertions only connect the generated schema to the existing wire contract.
    // They never manufacture a record, revision, permission or successful response.
    return {
      resourceCode,
      query: async query => checked(await transport.query(resourceCode, query)),
      get: async id => checked(await transport.get(resourceCode, id)),
      create: async data => checked(await transport.create(resourceCode, data as Record<string, unknown>)),
      update: async (id, input) => checked(await transport.update(resourceCode, id, {
        expectedRevision: input.expectedRevision, data: input.data as Record<string, unknown>,
      })),
      delete: async (id, revision) => checked(await transport.delete(resourceCode, id, revision)),
    } as OpenXiangdaBoundResource<M[C], C>;
  };
}
