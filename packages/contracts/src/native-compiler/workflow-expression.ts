import type { WorkflowExpression } from '../types.js';
import { workflowBusinessStepValueMatches } from './workflow-business-step.js';

export interface WorkflowExpressionEvaluationOptions {
  /** Opt-in only: legacy branch/example semantics remain unchanged. */
  strict?: boolean;
  schemaForPath?: (path: string) => Record<string, unknown> | undefined;
  requiredForPath?: (path: string) => boolean;
  /** Called only for operands actually visited (AND/OR remain short-circuiting). */
  onPathRead?: (path: string, value: unknown) => void;
}
/** One pure evaluator for kernel decisions and read-only condition examples. */
export function evaluateWorkflowExpression(expression: WorkflowExpression, facts: Record<string,unknown>, options: WorkflowExpressionEvaluationOptions = {}): unknown {
  let remaining=1024;
  const invalidType = (): never => { throw new Error('WORKFLOW_V2_EXPRESSION_TYPE_INVALID'); };
  const scalar = (value: unknown) => value === null || ['string', 'number', 'boolean'].includes(typeof value);
  const boolean = (value: unknown): boolean => options.strict ? typeof value === 'boolean' ? value : invalidType() : Boolean(value);
  const evaluate=(node:WorkflowExpression,depth=0,presence=false):unknown=>{
    if(--remaining<0 || depth>32) throw new Error('WORKFLOW_V2_EXPRESSION_LIMIT');
    const child=(value:WorkflowExpression)=>evaluate(value,depth+1);
    switch(node?.op) {
      case 'literal':if(options.strict && typeof node.value === 'number' && !Number.isFinite(node.value)) invalidType();return node.value;
      case 'path': {
        if(!/^[A-Za-z][A-Za-z0-9_.]{0,254}$/.test(node.path || '') || node.path.split('.').some(key=>['__proto__','prototype','constructor'].includes(key))) throw new Error('WORKFLOW_V2_EXPRESSION_PATH_INVALID');
        const value = node.path.split('.').reduce<unknown>((value,key)=>!value || typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,key)?undefined:(value as Record<string,unknown>)[key],facts);
        if (options.strict) {
          if (value === undefined && (!presence || options.requiredForPath?.(node.path))) throw new Error('WORKFLOW_V2_EXPRESSION_FACT_MISSING');
          const schema = options.schemaForPath?.(node.path);
          if (!schema || value !== undefined && !workflowBusinessStepValueMatches(schema, value)) invalidType();
        }
        options.onPathRead?.(node.path, value);
        return value;
      }
      case 'eq':case 'neq': {
        const left = child(node.left), right = child(node.right);
        if (options.strict && (!scalar(left) || !scalar(right) || left !== null && right !== null && typeof left !== typeof right)) invalidType();
        return node.op === 'eq' ? left === right : left !== right;
      }
      case 'gt':case 'gte':case 'lt':case 'lte': {
        const left:any=child(node.left),right:any=child(node.right);if(left===undefined||right===undefined)return false;
        if (options.strict && (typeof left !== typeof right || !['string','number'].includes(typeof left) || typeof left === 'number' && (!Number.isFinite(left) || !Number.isFinite(right)))) invalidType();
        const comparison=left===right?0:left>right?1:-1;
        return node.op==='gt'?comparison>0:node.op==='gte'?comparison>=0:node.op==='lt'?comparison<0:comparison<=0;
      }
      case 'in':{const left=child(node.left),right=child(node.right);if(options.strict && (!scalar(left) || !Array.isArray(right) || right.some(value => !scalar(value) || typeof value !== typeof left))) invalidType();return Array.isArray(right)&&right.includes(left);}
      case 'contains':{const left=child(node.left),right=child(node.right);if(options.strict && !(typeof left === 'string' && typeof right === 'string' || Array.isArray(left) && scalar(right) && left.every(value => scalar(value) && typeof value === typeof right))) invalidType();return Array.isArray(left)?left.includes(right):typeof left==='string'&&left.includes(String(right));}
      case 'and':return node.values.every(value=>boolean(child(value)));
      case 'or':return node.values.some(value=>boolean(child(value)));
      case 'not':return !boolean(child(node.value));
      case 'exists':{const value=evaluate(node.value,depth+1,options.strict && node.value.op === 'path');return value!==undefined&&value!==null;}
      default:throw new Error('WORKFLOW_V2_EXPRESSION_OPERATOR_INVALID');
    }
  };
  return evaluate(expression);
}
