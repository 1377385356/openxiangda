import type {
  AppDataPolicyExpressionDeclaration,
  AppDataPolicyRuleDeclaration,
} from 'openxiangda-contracts';

export const DATA_POLICY_EXPRESSION_MAX_DEPTH = 5;
export const DATA_POLICY_EXPRESSION_MAX_GROUP_ITEMS = 20;
export const DATA_POLICY_EXPRESSION_MAX_LEAVES = 50;
export const DATA_POLICY_EXPRESSION_MAX_CLAUSES = 50;
export const DATA_POLICY_EXPRESSION_MAX_OCCURRENCES = 100;

export class DataPolicyExpressionExpansionError extends Error {
  readonly code = 'APP_CONFIG_AUTHZ_POLICY_EXPRESSION_EXPANSION_EXCEEDED';
}

export function dataPolicyExpressionLeaves(
  expression: AppDataPolicyExpressionDeclaration
): AppDataPolicyRuleDeclaration[] {
  if ('allOf' in expression) {
    return expression.allOf.flatMap(dataPolicyExpressionLeaves);
  }
  if ('anyOf' in expression) {
    return expression.anyOf.flatMap(dataPolicyExpressionLeaves);
  }
  return [expression];
}

export function dataPolicyExpressionToCnf(
  expression: AppDataPolicyExpressionDeclaration
): AppDataPolicyRuleDeclaration[][] {
  const visit = (
    node: AppDataPolicyExpressionDeclaration
  ): AppDataPolicyRuleDeclaration[][] => {
    if ('allOf' in node) {
      return bounded(node.allOf.flatMap(visit));
    }
    if ('anyOf' in node) {
      let clauses: AppDataPolicyRuleDeclaration[][] = [[]];
      for (const child of node.anyOf) {
        const childClauses = visit(child);
        clauses = bounded(
          clauses.flatMap(left =>
            childClauses.map(right => [...left, ...right])
          )
        );
      }
      return clauses;
    }
    return [[node]];
  };
  return bounded(visit(expression));
}

function bounded(clauses: AppDataPolicyRuleDeclaration[][]) {
  const occurrences = clauses.reduce(
    (count, clause) => count + clause.length,
    0
  );
  if (
    clauses.length > DATA_POLICY_EXPRESSION_MAX_CLAUSES ||
    occurrences > DATA_POLICY_EXPRESSION_MAX_OCCURRENCES
  ) {
    throw new DataPolicyExpressionExpansionError();
  }
  return clauses;
}
