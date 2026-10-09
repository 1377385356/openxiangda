import type { WorkflowBusinessDetail } from 'openxiangda-contracts/browser';
import type { WorkflowDetailBehavior, WorkflowDetailFieldContext } from '../../workflow-definitions';
import type { SurfaceField } from '../resource/SurfaceFields';

/** Group only the readable detail surface; conditions cannot conceal old data. */
export function workflowDetailGroups(detail: WorkflowBusinessDetail, presentation?: {
  behavior?: WorkflowDetailBehavior;
  context: Pick<WorkflowDetailFieldContext, 'workflowCode' | 'definitionVersion' | 'bindingVersion'>;
}) {
  const groups = new Map<string, SurfaceField[]>();
  for (const key of detail.surface?.detail?.fieldOrder || []) {
    const field = detail.surface?.fields[key];
    if (!field || field.system === true) continue;
    const value = detail.record[key];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (empty && !((detail.subtables[key]?.total ?? 0) > 0) && presentation?.behavior?.fieldVisibility) {
      try {
        if (presentation.behavior.fieldVisibility({ ...presentation.context,
          resourceCode: detail.resourceCode, fieldCode: key, record: detail.record }) === false) continue;
      } catch {
        // A presentation error must not make readable historical data disappear.
      }
    }
    const section = field.section || '申请信息';
    groups.set(section, [...(groups.get(section) || []), { key, ...field }]);
  }
  return [...groups.entries()].map(([section, fields]) => ({ section, fields }));
}
