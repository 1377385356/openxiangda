import type {
  DataFieldDefinition,
  DataFieldSurfaceWidget,
} from 'openxiangda-contracts';

export type SurfaceWidgetSource = Pick<DataFieldDefinition, 'type'> & {
  widget?: DataFieldSurfaceWidget;
};

const WIDGETS_BY_TYPE: Record<
  DataFieldDefinition['type'],
  readonly DataFieldSurfaceWidget[]
> = {
  'text.short': ['text', 'email', 'phone'],
  'text.long': ['textarea'],
  'text.rich': ['rich-text'],
  'number.integer': ['number', 'rating'],
  'number.decimal': ['number', 'money', 'percent'],
  boolean: ['switch'],
  date: ['date'],
  time: ['time'],
  datetime: ['datetime'],
  'date-range': ['date-range'],
  'datetime-range': ['datetime-range'],
  'option.single': ['select', 'radio'],
  'option.multiple': ['multi-select', 'checkbox'],
  'cascade.single': ['cascade'],
  'cascade.multiple': ['cascade'],
  'user.single': ['directory-user'],
  'user.multiple': ['directory-user'],
  'department.single': ['directory-department', 'scope'],
  'department.multiple': ['directory-department', 'scope'],
  'resource-ref.single': ['select', 'radio', 'resource'],
  'resource-ref.multiple': ['multi-select', 'checkbox', 'resource'],
  file: ['attachment'],
  image: ['image'],
  signature: ['signature'],
  address: ['address'],
  location: ['location'],
  uuid: ['readonly'],
  json: ['json'],
  'serial-number': ['readonly'],
  subtable: ['subtable'],
};

export function compatibleWidgets(type: DataFieldDefinition['type']) {
  return WIDGETS_BY_TYPE[type];
}

export function isCompatibleFieldWidget(field: SurfaceWidgetSource) {
  return !field.widget || compatibleWidgets(field.type).includes(field.widget);
}

/**
 * Resolve the complete presentation contract from the authored field.
 *
 * Semantic type remains the source of truth. An explicit
 * widget is only a presentation override; generated Surfaces must never leave
 * widget resolution to an application renderer.
 */
export function resolveDataFieldSurfaceWidget(
  field: SurfaceWidgetSource
): DataFieldSurfaceWidget {
  if (field.widget && isCompatibleFieldWidget(field)) return field.widget;
  return compatibleWidgets(field.type)[0]!;
}
