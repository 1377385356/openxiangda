import type { WorkflowExpression } from '../types.js';
/** One pure evaluator for kernel decisions and read-only condition examples. */
export function evaluateWorkflowExpression(expression: WorkflowExpression, facts: Record<string,unknown>): unknown {
  let remaining=1024;
  const evaluate=(node:WorkflowExpression,depth=0):unknown=>{
    if(--remaining<0 || depth>32) throw new Error('WORKFLOW_V2_EXPRESSION_LIMIT');
    const child=(value:WorkflowExpression)=>evaluate(value,depth+1);
    switch(node?.op) {
      case 'literal':return node.value;
      case 'path': {
        if(!/^[A-Za-z][A-Za-z0-9_.]{0,254}$/.test(node.path || '') || node.path.split('.').some(key=>['__proto__','prototype','constructor'].includes(key))) throw new Error('WORKFLOW_V2_EXPRESSION_PATH_INVALID');
        return node.path.split('.').reduce<unknown>((value,key)=>!value || typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,key)?undefined:(value as Record<string,unknown>)[key],facts);
      }
      case 'eq':return child(node.left)===child(node.right);
      case 'neq':return child(node.left)!==child(node.right);
      case 'gt':case 'gte':case 'lt':case 'lte': {
        const left:any=child(node.left),right:any=child(node.right);if(left===undefined||right===undefined)return false;
        const comparison=left===right?0:left>right?1:-1;
        return node.op==='gt'?comparison>0:node.op==='gte'?comparison>=0:node.op==='lt'?comparison<0:comparison<=0;
      }
      case 'in':{const left=child(node.left),right=child(node.right);return Array.isArray(right)&&right.includes(left);}
      case 'contains':{const left=child(node.left),right=child(node.right);return Array.isArray(left)?left.includes(right):typeof left==='string'&&left.includes(String(right));}
      case 'and':return node.values.every(value=>Boolean(child(value)));
      case 'or':return node.values.some(value=>Boolean(child(value)));
      case 'not':return !Boolean(child(node.value));
      case 'exists':{const value=child(node.value);return value!==undefined&&value!==null;}
      default:throw new Error('WORKFLOW_V2_EXPRESSION_OPERATOR_INVALID');
    }
  };
  return evaluate(expression);
}
