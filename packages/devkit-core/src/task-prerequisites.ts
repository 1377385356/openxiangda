import type { NativeConfigurationCompilerResult } from 'openxiangda-contracts/native-compiler';

/** Projection only: validity and dependency closure belong to the sealed compiler. */
export function taskPrerequisiteContext(compiled: NativeConfigurationCompilerResult, selector: string, offset: number, limit: number) {
  const contract = compiled.projections.contracts.value as Record<string, any>;
  const groups = {
    platform: compiled.requiredPlatformCapabilities,
    resource: contract.resources || [],
    operation: contract.operations || [],
    workflow: contract.workflows || [],
    consumer: contract.eventConsumers || [],
  };
  const entries = Object.entries(groups).flatMap(([owner, values]) =>
    (values as Array<Record<string, unknown>>).map(value => {
      const code = String(value.code || value.resourceCode || value.id || '');
      return { selector: `prerequisites:${owner}:${code}`, owner, code, declaration: value };
    })
  );
  const selected = selector === 'prerequisites' ? entries.slice(offset, offset + limit) : entries.filter(entry => entry.selector === selector);
  if (selector !== 'prerequisites' && selected.length !== 1) throw new Error('CONTRACT_SELECTION_NOT_FOUND: 先读取 prerequisites 索引并使用原选择器');
  const result = {
    schemaVersion: 'openxiangda.task-prerequisites/v1',
    source: compiled.source, compilerAggregateDigest: compiled.aggregateDigest,
    validationOwner: 'sealed-native-compiler', localDeclarationValidation: 'passed',
    targetAvailability: 'not-observed', actorAuthorization: 'not-observed',
    total: entries.length, offset: selector === 'prerequisites' ? offset : 0, limit,
    nextOffset: selector === 'prerequisites' && offset + limit < entries.length ? offset + limit : null,
    entries: selected,
    interpretation: '原编译器声明闭包；任务间关系只采用声明中的明确引用。目标可用性与实际角色授权须由原平台预检和验收另证。',
  };
  if (Buffer.byteLength(JSON.stringify(result)) > 256 * 1024) throw new Error('CONTRACT_SELECTION_TOO_LARGE: 前提投影超过256KiB，请缩小limit或按原任务selector读取');
  return result;
}
