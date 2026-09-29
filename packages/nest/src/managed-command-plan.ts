import type { ReadonlyManagedCommandExecution, ManagedCommandPlan } from 'openxiangda-contracts';
const operators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'startsWith', 'endsWith', 'between', 'has', 'hasAny', 'hasAll', 'overlaps', 'containedBy', 'jsonContains', 'isEmpty', 'isNotEmpty'];
const comparisons = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'];
/** Early SDK rejection; the platform independently validates the same plan at commit. */
export function validateManagedCommandPlan(value: unknown, execution: ReadonlyManagedCommandExecution): ManagedCommandPlan {
    const fail = (): never => { throw new Error('OPENXIANGDA_MANAGED_PLAN_INVALID'); };
    let encoded: string;
    try {
        encoded = JSON.stringify(value);
    }
    catch {
        return fail();
    }
    if (!encoded || Buffer.byteLength(encoded) > 65536)
        return fail();
    const plan = JSON.parse(encoded);
    const object = (v: any, keys: string[]) => { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k)))
        fail(); };
    object(plan, ['schemaVersion', 'guards', 'operations', 'result']);
    if (plan.schemaVersion !== 'openxiangda.managed-command-plan/v1' || !Array.isArray(plan.guards) || plan.guards.length > 20 || !Array.isArray(plan.operations) || !plan.operations.length || plan.operations.length > 99)
        fail();
    const access = (code: string) => execution.resources.find(r => r.resourceCode === code) || fail();
    const id = (v: any) => { if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))
        fail(); };
    const fields = (value: any, allowed: readonly string[]) => { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k) || ['id', 'revision', 'created_by', 'updated_by', 'created_at', 'updated_at'].includes(k)))
        fail(); };
    for (const op of plan.operations) {
        const a = access(op.resourceCode);
        if (!a.writeOperations.includes(op.operation))
            fail();
        if (op.operation === 'create') {
            object(op, ['operation', 'resourceCode', 'data']);
            fields(op.data, a.writeFields);
        }
        else if (op.operation === 'update') {
            object(op, ['operation', 'resourceCode', 'id', 'expectedRevision', 'data']);
            id(op.id);
            if (!Number.isSafeInteger(op.expectedRevision) || op.expectedRevision < 1)
                fail();
            fields(op.data, a.writeFields);
        }
        else if (op.operation === 'increment') {
            object(op, ['operation', 'resourceCode', 'id', 'field', 'amount']);
            id(op.id);
            if (!a.writeFields.includes(op.field) || ['id', 'revision', 'created_by', 'updated_by', 'created_at', 'updated_at'].includes(op.field) || typeof op.amount !== 'number' || !Number.isFinite(op.amount))
                fail();
        }
        else
            fail();
    }
    for (const guard of plan.guards) {
        if (guard.kind === 'operation-time') {
            object(guard, ['kind', 'operationIndex', 'field', 'operator', 'offsetMilliseconds', 'errorCode']);
            const op = plan.operations[guard.operationIndex];
            if (!Number.isSafeInteger(guard.operationIndex) || guard.operationIndex < 0 || !op || !['create', 'update'].includes(op.operation) || !access(op.resourceCode).writeFields.includes(guard.field) || !Number.isSafeInteger(guard.offsetMilliseconds) || !comparisons.includes(guard.operator))
                fail();
        }
        else {
            const a = access(guard.resourceCode);
            if (guard.kind === 'query-empty') {
                object(guard, ['kind', 'resourceCode', 'lockKey', 'errorCode', 'where']);
                checkWhere(guard.where, a.readFields, fail);
            }
            else if (['record-assert', 'record-match', 'record-exists'].includes(guard.kind)) {
                object(guard, guard.kind === 'record-exists' ? ['kind', 'resourceCode', 'lockKey', 'errorCode', 'id'] : ['kind', 'resourceCode', 'lockKey', 'errorCode', 'id', 'assertions']);
                id(guard.id);
                if (guard.kind !== 'record-exists') {
                    if (!Array.isArray(guard.assertions) || !guard.assertions.length || guard.assertions.length > 20)
                        fail();
                    for (const assertion of guard.assertions) {
                        if (typeof assertion.operator !== 'string' || !operators.includes(assertion.operator))
                            fail();
                        if (assertion.kind === 'field') {
                            if (!comparisons.includes(assertion.operator))
                                fail();
                            object(assertion, ['kind', 'leftField', 'rightField', 'operator']);
                            if (!a.readFields.includes(assertion.leftField) || !a.readFields.includes(assertion.rightField))
                                fail();
                        }
                        else if (['value', 'database-now', 'command-accepted-at'].includes(assertion.kind)) {
                            object(assertion, assertion.kind === 'value' ? ['kind', 'field', 'operator', 'value', 'path'] : ['kind', 'field', 'operator']);
                            if (!a.readFields.includes(assertion.field))
                                fail();
                            if (assertion.kind === 'database-now' && !comparisons.includes(assertion.operator))
                                fail();
                            if (assertion.kind === 'command-accepted-at' && !['lt', 'lte', 'gt', 'gte'].includes(assertion.operator))
                                fail();
                        }
                        else
                            fail();
                    }
                }
            }
            else
                fail();
            if (typeof guard.lockKey !== 'string' || !guard.lockKey || guard.lockKey.length > 255)
                fail();
        }
        if (typeof guard.errorCode !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/.test(guard.errorCode))
            fail();
    }
    if (!plan.result || typeof plan.result !== 'object' || Array.isArray(plan.result))
        fail();
    const walk = (v: any, depth = 0, maxIndex = plan.operations.length) => {
        if (depth > 16)
            fail();
        if (!v || typeof v !== 'object')
            return;
        if (Object.hasOwn(v, 'operationIndex')) {
            object(v, ['operationIndex', 'field']);
            if (v.field !== 'id' || !Number.isSafeInteger(v.operationIndex) || v.operationIndex < 0 || v.operationIndex >= maxIndex || plan.operations[v.operationIndex]?.operation !== 'create')
                fail();
            return;
        }
        for (const item of Object.values(v))
            walk(item, depth + 1, maxIndex);
    };
    plan.operations.forEach((op: any, index: number) => walk(op.data, 0, index));
    walk(plan.result);
    return plan;
}
function checkWhere(where: any, fields: readonly string[], fail: () => never, depth = 0): void {
    if (!where || typeof where !== 'object' || Array.isArray(where) || depth > 8)
        fail();
    if (where.field !== undefined) {
        if (Object.keys(where).some(k => !['field', 'operator', 'value', 'path'].includes(k)) || !fields.includes(where.field) || !operators.includes(where.operator))
            fail();
        return;
    }
    if (Object.keys(where).length !== 1)
        fail();
    for (const [key, value] of Object.entries(where)) {
        if (!['and', 'or', 'not'].includes(key))
            fail();
        if (Array.isArray(value)) {
            if (value.length > 32)
                fail();
            for (const item of value)
                checkWhere(item, fields, fail, depth + 1);
        }
        else
            checkWhere(value, fields, fail, depth + 1);
    }
}
