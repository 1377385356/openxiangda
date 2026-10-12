/** Scheduling is owned by the durable workflow deadline worker, never a browser timer. */
export interface WorkflowReminders { afterSeconds: number; everySeconds: number; max: number; to: ['handlers'] }
export function validateWorkflowReminders(definition: { nodes?: Record<string, any> }): string[] {
  const errors: string[] = [];
  for (const [id,node] of Object.entries(definition?.nodes || {})) {
    if (node?.reminders === undefined) continue;
    const rule = node.reminders;
    if (!['approval','handle','correction'].includes(node.kind) || !rule || typeof rule !== 'object' || Array.isArray(rule) || Object.keys(rule).length !== 4 || Object.keys(rule).some(key => !['afterSeconds','everySeconds','max','to'].includes(key)) || !Number.isInteger(rule.afterSeconds) || rule.afterSeconds < 1 || rule.afterSeconds > 2592000 || !Number.isInteger(rule.everySeconds) || rule.everySeconds < 1 || rule.everySeconds > 2592000 || !Number.isInteger(rule.max) || rule.max < 1 || rule.max > 10 || !Array.isArray(rule.to) || rule.to.length !== 1 || rule.to[0] !== 'handlers') errors.push(`WORKFLOW_REMINDERS_INVALID:${id}`);
  }
  return errors;
}
