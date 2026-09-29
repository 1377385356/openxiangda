import { AsyncLocalStorage } from 'node:async_hooks';
import type { ManagedCommandExecutionVerification } from 'openxiangda-contracts';
// Deliberately absent from public exports. Dedicated proofs never enter user request contexts.
const execution = new AsyncLocalStorage<{
    authorization: string;
    verification: ManagedCommandExecutionVerification;
}>();
export const managedExecution = () => execution.getStore();
export function runManagedExecution<T>(authorization: string, verification: ManagedCommandExecutionVerification, work: () => T): T {
    return execution.run({ authorization, verification }, work);
}
export function assertOutsideManagedExecution() {
    if (execution.getStore())
        throw new Error('OPENXIANGDA_MANAGED_COMMAND_SIDE_EFFECT_FORBIDDEN');
}
const controllers = new WeakSet<Function>();
export function ManagedExecutionController(): ClassDecorator { return target => { controllers.add(target); }; }
export function isManagedExecutionController(target: Function) { return controllers.has(target); }
