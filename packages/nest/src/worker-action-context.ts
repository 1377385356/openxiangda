import { AsyncLocalStorage } from 'node:async_hooks';
import type { OpenXiangdaWorkerActionContext } from './types.js';
/** Private execution storage, never accepts browser request metadata. */
const storage = new AsyncLocalStorage<OpenXiangdaWorkerActionContext>();
export const currentWorkerAction = () => storage.getStore();
export function runWorkerAction<T>(context: OpenXiangdaWorkerActionContext, work: () => Promise<T>): Promise<T> {
  return storage.run(Object.freeze({...context}), work);
}
