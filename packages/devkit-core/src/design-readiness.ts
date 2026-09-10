import { createHash } from 'node:crypto';
import { SCHEMA_VERSIONS, type Diagnostic } from 'openxiangda-contracts';
import type { AppSpecContext, AppSpecDocument } from './app-spec.js';

/** 只检查可证伪的资料结构；语义质量与实际用户确认仍需人工/Skill 评审。 */
export const DESIGN_SECTIONS = {
  sources: ['来源与事实', '建议与问题'],
  product: ['目标与范围', '角色与任务', '模块与取舍', '业务规则', '验收标准'],
  journey: ['角色与场景', '主流程与交接', '异常与恢复', '页面与入口'],
  page: ['任务与入口', '信息与字段', '操作与反馈', '页面状态', '写入与恢复', '权限与多端', '原型与验收'],
  visual: ['界面模式', '布局与多端', '原型与状态', '可访问性'],
  permissions: ['角色与范围', '页面与操作', '行与字段', '多角色与反例'],
  architecture: ['所有者与边界', '模型与状态', '契约与能力', '失败与并发', '容量与回滚'],
  review: ['范围与覆盖', '一致性评审', '用户确认'],
} as const;

export function designSection(content: string, title: string) {
  const source = content.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n/g, '\n');
  const marker = `\n## ${title}\n`;
  const start = source.indexOf(marker);
  return start < 0 ? '' : source.slice(start + marker.length).split(/\n## /)[0] || '';
}

function substantive(content: string) {
  return content.split('\n').map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !/^[|\s:-]+$/.test(line)
      && !/^(?:[-*]\s*)?(?:\[[ x]\]\s*)?(?:待补充|待确认|TBD|TODO|无。?)$/i.test(line))
    .join('\n').length >= 16;
}

export function designBaselineDigest(documents: AppSpecDocument[]) {
  return createHash('sha256').update(JSON.stringify([...documents]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ id, path, content, assets }) => ({ id, path, content, ...(assets ? { assets } : {}) })))).digest('hex');
}

export function inspectDesignReadiness(context: AppSpecContext, change?: AppSpecDocument) {
  const diagnostics: Diagnostic[] = [];
  const issue = (code: string, message: string, path = 'appspec/reviews') => diagnostics.push({
    schemaVersion: SCHEMA_VERSIONS.diagnostic, severity: 'error', code, message, path, retryable: false,
    remediation: '按 docs product-design 补齐受影响设计并记录实际确认；不可用空模板或自动确认绕过',
  });
  const reviews = context.designs.filter(item => item.metadata.type === 'review' && change?.references.documents.includes(item.id));
  const review = reviews.length === 1 ? reviews[0] : undefined;
  if (!review) issue('APPSPEC_DESIGN_REVIEW_REQUIRED', '本轮变更 documents 需要引用一份明确的设计评审；先完成设计基线再制定实施计划', change?.path);
  const all = [context.application, ...context.capabilities, ...context.decisions, ...context.designs].filter((item): item is AppSpecDocument => !!item);
  const documents: AppSpecDocument[] = [];
  const pending = [...(review?.references.documents || [])];
  // 首发总纲本身也拥有目标、角色和当前规则，不能在评审外静默改写。
  if (review?.metadata.scope === 'initial' && context.application) pending.push(context.application.id);
  const seen = new Set<string>();
  for (let i = 0; i < pending.length; i++) {
    const id = pending[i]!;
    if (seen.has(id)) continue;
    seen.add(id);
    const document = all.find(item => item.id === id);
    if (!document) { issue('APPSPEC_DESIGN_DOCUMENT_UNAVAILABLE', `评审引用 ${id} 缺失或正文超预算；按稳定 ID 检查并缩小资料范围`); continue; }
    if (document.metadata.type === 'review') { issue('APPSPEC_DESIGN_REVIEW_NESTED', '评审不能引用评审；引用其受评设计，避免循环基线', document.path); continue; }
    documents.push(document);
    pending.push(...document.references.documents);
  }
  const baselineDigest = documents.length ? designBaselineDigest(documents) : null;
  if (review) {
    if (!documents.length) issue('APPSPEC_DESIGN_DOCUMENTS_REQUIRED', '评审必须引用实际设计材料', review.path);
    if (!['initial', 'change'].includes(String(review.metadata.scope))) issue('APPSPEC_DESIGN_SCOPE_REQUIRED', '评审 scope 必须是 initial（完整首发）或 change（受影响范围）', review.path);
    if (review.metadata.scope === 'initial') {
      const types = new Set(documents.map(item => item.kind === 'decision' ? 'architecture' : item.metadata.type));
      for (const type of ['product', 'journey', 'page', 'visual', 'permissions', 'architecture']) {
        if (!types.has(type)) issue('APPSPEC_DESIGN_COVERAGE_INCOMPLETE', `完整首发设计缺少 ${type}；适用范围和标准模式必须具体说明`, review.path);
      }
    }
    if (review.status !== 'confirmed' || !String(review.metadata.confirmedBy || '').trim()
      || !Number.isFinite(Date.parse(String(review.metadata.confirmedAt || '')))
      || !substantive(String(review.metadata.confirmationSource || ''))) {
      issue('APPSPEC_DESIGN_CONFIRMATION_REQUIRED', '设计评审需要实际确认人、时间、答复来源及 confirmed 状态；AI 自查不是用户确认', review.path);
    }
    if (review.metadata.baselineDigest !== baselineDigest) issue('APPSPEC_DESIGN_BASELINE_STALE', '设计正文与评审基线不一致；检查变化的业务含义并更新受影响确认，不能只盲改摘要', review.path);
  }
  for (const document of [...documents, ...(review ? [review] : [])]) {
    if (['draft', 'proposed', 'superseded', 'rejected', 'retired'].includes(document.status)) issue('APPSPEC_DESIGN_DOCUMENT_NOT_READY', '受评设计仍是草稿或已失效，先解决其未决内容', document.path);
    if (/^\s*[-*] \[ \]/m.test(designSection(document.content, '未确认问题'))) issue('APPSPEC_DESIGN_BLOCKING_QUESTIONS', '设计仍有阻断问题；可继续无依赖的设计工作', document.path);
    if (document.kind !== 'design') continue;
    const titles = DESIGN_SECTIONS[document.metadata.type as keyof typeof DESIGN_SECTIONS] || [];
    for (const title of titles) {
      if (!substantive(designSection(document.content, title))) issue('APPSPEC_DESIGN_SECTION_INCOMPLETE', `设计“${title}”缺少具体内容或适用性说明`, `${document.path}#${title}`);
    }
  }
  return { readyForImplementation: !!review && !diagnostics.length, reviewId: review?.id || null,
    scope: review?.metadata.scope === 'initial' ? 'initial' as const : review?.metadata.scope === 'change' ? 'change' as const : null, baselineDigest, documentIds: documents.map(item => item.id), diagnostics };
}
