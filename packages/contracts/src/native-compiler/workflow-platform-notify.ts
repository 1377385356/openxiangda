export const WORKFLOW_PLATFORM_NOTIFY_HANDLER = 'platform-notify-v1';
export const WORKFLOW_PLATFORM_NOTIFY_CAPABILITY = 'platform.notify';
export const WORKFLOW_PLATFORM_NOTIFY_INPUT_SCHEMA = { type: 'object', additionalProperties: false, properties: { text: { type: 'string', minLength: 1, maxLength: 2048 } }, required: ['text'] };
export const WORKFLOW_PLATFORM_NOTIFY_OUTPUT_SCHEMA = { type: 'object', additionalProperties: false, properties: {} };
export type WorkflowNotificationRecipient =
  | { provider: 'initiator' }
  | { provider: 'fixed_users'; users: string[] }
  | { provider: 'app_role'; roleCode: string }
  | { provider: 'form_field_users'; inputPath: string };
export interface WorkflowPlatformNotification { template: 'workflow_message'; recipients: WorkflowNotificationRecipient }
const plain = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value);
const canonical = (value: any): string => JSON.stringify(value, (_,item) => plain(item) ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])) : item);
export function isWorkflowPlatformNotify(node: any): boolean {
  return node?.kind === 'action' && node.handler?.code === WORKFLOW_PLATFORM_NOTIFY_HANDLER && node.notification !== undefined;
}
export function workflowNotificationBinding(node: any) {
  return { ...node.notification.recipients, min: 1, max: 50, delegatable: false };
}
export function validateWorkflowPlatformNotify(definition: { nodes?: Record<string, any> }): string[] {
  const errors: string[] = [];
  for (const [id,node] of Object.entries(definition?.nodes || {})) {
    if (node?.notification === undefined) continue;
    if (!isWorkflowPlatformNotify(node) || node.handler.version !== 1 || node.handler.mode !== 'reconciled-effect' || node.handler.dataTransaction !== undefined || canonical(node.inputSchema) !== canonical(WORKFLOW_PLATFORM_NOTIFY_INPUT_SCHEMA) || canonical(node.outputSchema) !== canonical(WORKFLOW_PLATFORM_NOTIFY_OUTPUT_SCHEMA)) errors.push(`WORKFLOW_NOTIFY_PRESET_INVALID:${id}`);
    if (node.inputs?.text?.source === 'literal' && (typeof node.inputs.text.value !== 'string' || !node.inputs.text.value.trim())) errors.push(`WORKFLOW_NOTIFY_TEXT_INVALID:${id}`);
    const notification=node.notification, recipient=notification?.recipients;
    if (!plain(notification) || Object.keys(notification).some(key=>!['template','recipients'].includes(key)) || notification.template !== 'workflow_message' || !plain(recipient)) { errors.push(`WORKFLOW_NOTIFY_RECIPIENT_INVALID:${id}`); continue; }
    const keys=Object.keys(recipient);
    if (recipient.provider === 'initiator') { if(keys.length!==1) errors.push(`WORKFLOW_NOTIFY_RECIPIENT_INVALID:${id}`); }
    else if(recipient.provider==='fixed_users') {
      if(keys.some(key=>!['provider','users'].includes(key)) || !Array.isArray(recipient.users) || recipient.users.length<1 || recipient.users.length>50 || new Set(recipient.users).size!==recipient.users.length || recipient.users.some((user:any)=>typeof user!=='string' || !user.trim() || user.length>255)) errors.push(`WORKFLOW_NOTIFY_RECIPIENT_INVALID:${id}`);
    } else if(recipient.provider==='app_role') {
      if(keys.some(key=>!['provider','roleCode'].includes(key)) || typeof recipient.roleCode!=='string' || !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(recipient.roleCode)) errors.push(`WORKFLOW_NOTIFY_RECIPIENT_INVALID:${id}`);
    } else if(recipient.provider==='form_field_users') {
      if(keys.some(key=>!['provider','inputPath'].includes(key)) || typeof recipient.inputPath!=='string' || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/.test(recipient.inputPath) || recipient.inputPath.length > 256 || recipient.inputPath.split('.').length > 8 || recipient.inputPath.split('.').some((key:string)=>['prototype','constructor','__proto__'].includes(key))) errors.push(`WORKFLOW_NOTIFY_RECIPIENT_INVALID:${id}`);
    } else errors.push(`WORKFLOW_NOTIFY_RECIPIENT_INVALID:${id}`);
  }
  return errors;
}
