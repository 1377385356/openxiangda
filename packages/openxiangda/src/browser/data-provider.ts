import type { DataProvider } from '@refinedev/core';
import { createNativeResourceClient, type GenericResourceQuery } from './platform-client';
import { applicationCode } from './runtime-meta';
import type { GeneratedResourceDefinitions } from './components/resource/generated-resource-definition';

type ListParams = Parameters<NonNullable<DataProvider['getList']>>[0];
type OneParams = Parameters<NonNullable<DataProvider['getOne']>>[0];
type CreateParams = Parameters<NonNullable<DataProvider['create']>>[0];
type UpdateParams = Parameters<NonNullable<DataProvider['update']>>[0];
type DeleteParams = Parameters<NonNullable<DataProvider['deleteOne']>>[0];

export function createApplicationProvider(
  declaredDefinitions: GeneratedResourceDefinitions
) {
  const clientFor = (resource: string) => {
    const definition = declaredDefinitions[resource];
    if (!definition) {
      throw new Error(
        `OPENXIANGDA_GENERATED_RESOURCE_NOT_DECLARED:${resource}`
      );
    }
    return createNativeResourceClient(resource, definition.surface);
  };

  return {
    getApiUrl: () =>
      `/service/openxiangda-api/v2/applications/${applicationCode()}/native/data`,
    getList: async ({ resource, pagination, sorters, meta }: ListParams) => {
      const query = (meta?.query || {}) as Partial<GenericResourceQuery>;
      const result = await clientFor(resource).list({
        page: pagination?.currentPage || 1,
        pageSize: pagination?.pageSize || 20,
        ...query,
        ...(sorters ? { sorts: sorters.map(sorter => ({ field: String(sorter.field), order: sorter.order })) } : {}),
      });
      return { data: result.rows, total: result.total };
    },
    getOne: async ({ resource, id }: OneParams) => ({
      data: await clientFor(resource).get(String(id)),
    }),
    create: async ({ resource, variables }: CreateParams) => ({
      data: await clientFor(resource).create(
        variables as Record<string, unknown>
      ),
    }),
    update: async ({ resource, id, variables, meta }: UpdateParams) => ({
      data: await clientFor(resource).update(
        String(id),
        Number(meta?.expectedRevision),
        variables as Record<string, unknown>
      ),
    }),
    deleteOne: async ({ resource, id, meta }: DeleteParams) => ({
      data: await clientFor(resource).remove(
        String(id),
        Number(meta?.expectedRevision)
      ),
    }),
  } as unknown as DataProvider;
}
