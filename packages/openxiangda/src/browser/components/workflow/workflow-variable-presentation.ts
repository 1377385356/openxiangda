import { formatWorkflowExpression, type WorkflowGraphVariable, type WorkflowExpression, type WorkflowGraphProjection } from 'openxiangda-contracts/browser';

/** Display metadata only: values remain the application's original typed facts. */
export type WorkflowVariableChoice = { label: string; value: string | number | boolean };
export type WorkflowVariableChoices = Readonly<Record<string, readonly WorkflowVariableChoice[]>>;
export type WorkflowConditionVariable = WorkflowGraphVariable & { choices?: readonly WorkflowVariableChoice[] };

export function workflowVariablesWithChoices(variables: readonly WorkflowGraphVariable[], supplied: WorkflowVariableChoices = {}): WorkflowConditionVariable[] {
  return variables.map(variable => {
    const choices = Object.hasOwn(supplied, variable.path) ? supplied[variable.path] : undefined;
    if (!Array.isArray(choices) || !choices.length || choices.length > 64 || Object.keys(supplied).length > 128) return variable;
    const types = variable.type.split(',');
    const valid = choices.every((choice, index) => choice && typeof choice.label === 'string' && !!choice.label.trim() && choice.label.length <= 160 &&
      ((typeof choice.value === 'string' && types.includes('string') && choice.value.length <= 255) ||
       (typeof choice.value === 'boolean' && types.includes('boolean')) ||
       (typeof choice.value === 'number' && Number.isFinite(choice.value) && (types.includes('number') || types.includes('integer') && Number.isSafeInteger(choice.value)))) &&
      choices.findIndex(other => other?.value === choice.value) === index);
    return valid ? { ...variable, choices: choices.map(choice => ({ label: choice.label, value: choice.value })) } : variable;
  });
}

/** Presentation-only projection shared by editor, read-only diagram and AI preview. */
export function workflowGraphWithChoices(graph: WorkflowGraphProjection, supplied: WorkflowVariableChoices = {}): WorkflowGraphProjection {
  const variables = workflowVariablesWithChoices(graph.variables, supplied);
  return { ...graph, variables, edges: graph.edges.map(edge => edge.expression && edge.label === formatWorkflowExpression(edge.expression, graph.variables)
    ? { ...edge, label: formatWorkflowCondition(edge.expression, variables) } : edge) };
}

export function workflowChoiceLabel(value: unknown, variable?: WorkflowConditionVariable): string | undefined {
  return variable?.choices?.find(choice => choice.value === value)?.label;
}

/** Exact known literals get names; unknown values are never guessed or changed. */
export function formatWorkflowCondition(expression: WorkflowExpression, variables: readonly WorkflowConditionVariable[], depth = 0): string {
  if (!expression || depth > 20) return '无法识别的条件';
  if (expression.op === 'and' || expression.op === 'or') return expression.values.slice(0, 128).map(child => `（${formatWorkflowCondition(child, variables, depth + 1)}）`).join(expression.op === 'and' ? ' 且 ' : ' 或 ');
  if (expression.op === 'not' || expression.op === 'exists') return `${expression.op === 'not' ? '不满足' : '存在'}（${formatWorkflowCondition(expression.value, variables, depth + 1)}）`;
  if (!('left' in expression)) return formatWorkflowExpression(expression, variables);
  const describe = (operand: WorkflowExpression, other: WorkflowExpression) => {
    const variable = other.op === 'path' ? variables.find(item => item.path === other.path) : undefined;
    if (operand.op === 'literal') {
      const named = workflowChoiceLabel(operand.value, variable);
      if (named) return named;
      if (expression.op === 'in' && Array.isArray(operand.value) && variable?.choices) return operand.value.map(value => workflowChoiceLabel(value, variable) || JSON.stringify(value)).join('、');
    }
    return formatWorkflowCondition(operand, variables, depth + 1);
  };
  const labels = { eq: '等于', neq: '不等于', gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于', in: '属于', contains: '包含' };
  const leftPath = expression.left.op === 'path' ? expression.left.path : undefined;
  const unit = leftPath && expression.right.op === 'literal' && typeof expression.right.value === 'number'
    ? variables.find(variable => variable.path === leftPath)?.unit : undefined;
  return `${describe(expression.left, expression.right)} ${labels[expression.op]} ${describe(expression.right, expression.left)}${unit ? ` ${unit}` : ''}`;
}
