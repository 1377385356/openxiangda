import type { Diagnostic } from './types.js';
import { diagnostic, isRecord } from './validation-common.js';

const emptyArrayTypes = new Set([
  'option.multiple',
  'cascade.multiple',
  'user.multiple',
  'department.multiple',
  'resource-ref.multiple',
  'file',
  'image',
  'subtable',
]);

/** Named views may select existing presentation fields, never redefine data facts. */
export function validateDataResourceViews(
  resource: Record<string, unknown>
): Diagnostic[] {
  const surface = isRecord(resource.surface) ? resource.surface : {};
  if (surface.views === undefined) return [];
  const diagnostics: Diagnostic[] = [];
  const issue = (message: string, path: string) =>
    diagnostics.push(diagnostic('DATA_RESOURCE_VIEW_INVALID', message, path));
  if (!Array.isArray(surface.views) || surface.views.length > 20) {
    issue('每个资源最多声明 20 个命名视图', 'surface.views');
    return diagnostics;
  }
  const fields = isRecord(surface.fields) ? surface.fields : {};
  const schema = isRecord(resource.schema) ? resource.schema : {};
  const dataFields = Array.isArray(schema.fields)
    ? schema.fields.filter(isRecord)
    : [];
  const codes = new Set<string>();
  const exact = (
    value: Record<string, unknown>,
    keys: string[],
    path: string
  ) => {
    for (const key of Object.keys(value))
      if (!keys.includes(key))
        issue('视图不能重定义字段或权限', `${path}.${key}`);
  };
  const selection = (value: unknown, path: string, maximum = 500): string[] => {
    if (
      !Array.isArray(value) ||
      value.length > maximum ||
      new Set(value).size !== value.length
    ) {
      issue('字段选择必须是不重复的有界数组', path);
      return [];
    }
    for (const key of value) {
      const field =
        typeof key === 'string' && isRecord(fields[key])
          ? fields[key]
          : undefined;
      if (!field || (field.hidden ?? field.system) === true)
        issue('视图字段不存在或为内部隐藏字段', path);
    }
    return value.filter((key): key is string => typeof key === 'string');
  };
  surface.views.forEach((raw, index) => {
    const path = `surface.views[${index}]`;
    if (!isRecord(raw)) {
      issue('视图必须是对象', path);
      return;
    }
    exact(
      raw,
      [
        'code',
        'name',
        'generated',
        'list',
        'form',
        'detail',
        'mobile',
        'sections',
      ],
      path
    );
    if (
      typeof raw.code !== 'string' ||
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(raw.code) ||
      raw.code.length > 64 ||
      codes.has(raw.code)
    )
      issue('视图 code 必须是唯一 lower kebab-case', `${path}.code`);
    else codes.add(raw.code);
    if (
      typeof raw.name !== 'string' ||
      !raw.name.trim() ||
      raw.name.length > 255
    )
      issue('视图需要名称', `${path}.name`);
    const generated = isRecord(raw.generated) ? raw.generated : {};
    if (!isRecord(raw.generated))
      issue('视图必须声明生成操作', `${path}.generated`);
    exact(
      generated,
      ['list', 'detail', 'create', 'update', 'delete'],
      `${path}.generated`
    );
    for (const key of ['list', 'detail', 'create', 'update', 'delete']) {
      const enabled = generated[key];
      if (
        typeof enabled !== 'boolean' ||
        ((surface.mutationOwner || 'native') !== 'native' &&
          ['create', 'update', 'delete'].includes(key) &&
          enabled)
      )
        issue('视图操作与资源写入归属冲突', `${path}.generated.${key}`);
    }
    for (const kind of ['list', 'form', 'detail'] as const) {
      const layout = raw[kind];
      if (!isRecord(layout)) {
        issue('视图必须声明字段选择', `${path}.${kind}`);
        continue;
      }
      exact(
        layout,
        kind === 'list'
          ? [
              'fieldOrder',
              'defaultPageSize',
              'searchableFields',
              'filterFields',
              'defaultSort',
            ]
          : ['layout', 'fieldOrder'],
        `${path}.${kind}`
      );
      selection(layout.fieldOrder, `${path}.${kind}.fieldOrder`);
      if (
        kind !== 'list' &&
        layout.layout !== undefined &&
        !['flat', 'sections'].includes(String(layout.layout))
      )
        issue('布局无效', `${path}.${kind}.layout`);
      if (kind === 'list') {
        if (
          layout.defaultPageSize !== undefined &&
          (!Number.isInteger(layout.defaultPageSize) ||
            Number(layout.defaultPageSize) < 1 ||
            Number(layout.defaultPageSize) > 200)
        )
          issue('页大小必须为 1 到 200', `${path}.list.defaultPageSize`);
        for (const key of ['searchableFields', 'filterFields'])
          if (layout[key] !== undefined)
            selection(
              layout[key],
              `${path}.list.${key}`,
              key === 'searchableFields' ? 20 : 50
            );
        if (layout.defaultSort !== undefined) {
          const sort = layout.defaultSort;
          if (!isRecord(sort))
            issue('排序必须声明字段', `${path}.list.defaultSort`);
          else {
            exact(sort, ['field', 'order'], `${path}.list.defaultSort`);
            selection([sort.field], `${path}.list.defaultSort.field`);
            if (
              sort.order !== undefined &&
              !['asc', 'desc'].includes(String(sort.order))
            )
              issue('排序方向无效', `${path}.list.defaultSort.order`);
          }
        }
      }
    }
    if (!isRecord(raw.mobile))
      issue('视图必须声明移动可用性', `${path}.mobile`);
    else {
      exact(raw.mobile, ['enabled'], `${path}.mobile`);
      if (typeof raw.mobile.enabled !== 'boolean')
        issue('移动可用性必须为 boolean', `${path}.mobile.enabled`);
    }
    const grouped = new Set<string>();
    if (raw.sections !== undefined) {
      if (!Array.isArray(raw.sections) || raw.sections.length > 100)
        issue('分组必须是有界数组', `${path}.sections`);
      else
        raw.sections.forEach((section, groupIndex) => {
          const groupPath = `${path}.sections[${groupIndex}]`;
          if (!isRecord(section)) {
            issue('分组必须是对象', groupPath);
            return;
          }
          exact(section, ['title', 'fields'], groupPath);
          if (
            typeof section.title !== 'string' ||
            !section.title.trim() ||
            section.title.length > 255
          )
            issue('分组需要标题', `${groupPath}.title`);
          for (const field of selection(
            section.fields,
            `${groupPath}.fields`,
            100
          )) {
            if (grouped.has(field))
              issue('字段不能重复分组', `${groupPath}.fields`);
            grouped.add(field);
          }
        });
    }
    if (
      generated.create !== false &&
      (surface.mutationOwner || 'native') === 'native' &&
      isRecord(raw.form) &&
      Array.isArray(raw.form.fieldOrder)
    ) {
      for (const field of dataFields) {
        const key = String(field.code);
        const presentation = isRecord(fields[key]) ? fields[key] : {};
        const required =
          field.nullable === false &&
          (!emptyArrayTypes.has(String(field.type)) ||
            presentation.requiredHint === true);
        if (
          required &&
          !presentation.system &&
          field.type !== 'serial-number' &&
          Array.isArray(presentation.createCapabilities) &&
          presentation.createCapabilities.length > 0 &&
          !raw.form.fieldOrder.includes(key)
        )
          issue(`新建视图缺少必填字段 ${key}`, `${path}.form.fieldOrder`);
      }
    }
  });
  return diagnostics;
}
