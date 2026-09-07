export const NATIVE_DATA_POLICY_EXPRESSION_MAX_DEPTH = 5;
export const NATIVE_DATA_POLICY_EXPRESSION_MAX_GROUP_ITEMS = 20;
export const NATIVE_DATA_POLICY_EXPRESSION_MAX_LEAVES = 50;
export const NATIVE_DATA_POLICY_EXPRESSION_MAX_CLAUSES = 50;
export const NATIVE_DATA_POLICY_EXPRESSION_MAX_OCCURRENCES = 100;

type JsonObject = Record<string, any>;

export class NativeDataPolicyExpressionV2Error extends Error {
  constructor(readonly code: string, readonly pointer: string) {
    super(code);
    this.name = 'NativeDataPolicyExpressionV2Error';
  }
}

export function nativeDataPolicyExpressionLeavesV2(
  expression: unknown,
  pointer: string
) {
  const leaves: Array<{ rule: JsonObject; pointer: string }> = [];
  const visit = (value: unknown, currentPointer: string, depth: number) => {
    if (depth > NATIVE_DATA_POLICY_EXPRESSION_MAX_DEPTH) {
      failure('NATIVE_DATA_POLICY_EXPRESSION_DEPTH_EXCEEDED', currentPointer);
    }
    const node = object(value, currentPointer);
    const groupKeys = ['allOf', 'anyOf'].filter(key => key in node);
    if (groupKeys.length === 0) {
      leaves.push({ rule: node, pointer: currentPointer });
      if (leaves.length > NATIVE_DATA_POLICY_EXPRESSION_MAX_LEAVES) {
        failure(
          'NATIVE_DATA_POLICY_EXPRESSION_LEAVES_EXCEEDED',
          currentPointer
        );
      }
      return;
    }
    const key = groupKeys[0]!;
    const children = node[key];
    if (
      groupKeys.length !== 1 ||
      Object.keys(node).length !== 1 ||
      !Array.isArray(children) ||
      children.length < 1 ||
      children.length > NATIVE_DATA_POLICY_EXPRESSION_MAX_GROUP_ITEMS
    ) {
      failure('NATIVE_DATA_POLICY_EXPRESSION_GROUP_INVALID', currentPointer);
    }
    children.forEach((child, index) =>
      visit(child, `${currentPointer}/${key}/${index}`, depth + 1)
    );
  };
  visit(expression, pointer, 1);
  return leaves;
}

export function nativeDataPolicyExpressionToCnfV2(
  expression: unknown,
  pointer: string
): JsonObject[][] {
  nativeDataPolicyExpressionLeavesV2(expression, pointer);
  const visit = (value: unknown, currentPointer: string): JsonObject[][] => {
    const node = object(value, currentPointer);
    if (Array.isArray(node.allOf)) {
      return bounded(
        node.allOf.flatMap((child, index) =>
          visit(child, `${currentPointer}/allOf/${index}`)
        ),
        currentPointer
      );
    }
    if (Array.isArray(node.anyOf)) {
      let clauses: JsonObject[][] = [[]];
      node.anyOf.forEach((child, index) => {
        const childClauses = visit(child, `${currentPointer}/anyOf/${index}`);
        clauses = bounded(
          clauses.flatMap(left =>
            childClauses.map(right => [...left, ...right])
          ),
          currentPointer
        );
      });
      return clauses;
    }
    return [[node]];
  };
  return bounded(visit(expression, pointer), pointer);
}

function bounded(clauses: JsonObject[][], pointer: string) {
  const occurrences = clauses.reduce(
    (count, clause) => count + clause.length,
    0
  );
  if (
    clauses.length > NATIVE_DATA_POLICY_EXPRESSION_MAX_CLAUSES ||
    occurrences > NATIVE_DATA_POLICY_EXPRESSION_MAX_OCCURRENCES
  ) {
    failure('NATIVE_DATA_POLICY_EXPRESSION_EXPANSION_EXCEEDED', pointer);
  }
  return clauses;
}

function object(value: unknown, pointer: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failure('NATIVE_DATA_POLICY_EXPRESSION_NODE_INVALID', pointer);
  }
  return value as JsonObject;
}

function failure(code: string, pointer: string): never {
  throw new NativeDataPolicyExpressionV2Error(code, pointer);
}
