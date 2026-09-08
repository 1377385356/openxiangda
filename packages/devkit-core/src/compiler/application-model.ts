import { SCHEMA_VERSIONS, type Diagnostic } from 'openxiangda-contracts';
import type {
  AppDataFieldDeclaration,
  AppDataResourceDeclaration,
} from './config.js';

/** Storage and access facts; screen-specific choices belong to views. */
export type AppModelFieldDeclaration = Omit<
  AppDataFieldDeclaration,
  'widget' | 'section' | 'list' | 'filter' | 'searchable' | 'sortable'
>;

export interface AppDataModelDeclaration {
  code: string;
  name: string;
  fields: readonly AppModelFieldDeclaration[];
  audit?: AppDataResourceDeclaration['audit'];
  mutationOwner?: AppDataResourceDeclaration['mutationOwner'];
  invariants?: AppDataResourceDeclaration['invariants'];
  dataPolicyCode?: string | null;
}

export interface AppResourceFormDeclaration {
  model: string;
  fields?: readonly string[];
  layout?: 'flat' | 'sections';
}

export interface AppResourceListDeclaration {
  actions?: NonNullable<AppDataResourceDeclaration['list']>['actions'];
  model: string;
  fields?: readonly string[];
  filterFields?: readonly string[];
  searchableFields?: readonly string[];
  defaultPageSize?: number;
  defaultSort?: { field: string; order?: 'asc' | 'desc' };
}

export interface AppCrudViewDeclaration {
  model: string;
  /** Omit for the existing default page; named views need a stable code and name. */
  code?: string;
  name?: string;
  /** Shared form/detail grouping; field selection and order remain view-owned. */
  sections?: readonly { title: string; fields: readonly string[] }[];
  list?: AppResourceListDeclaration;
  form?: AppResourceFormDeclaration;
  detail?: AppResourceFormDeclaration;
  generated?: AppDataResourceDeclaration['generated'];
  mobile?: AppDataResourceDeclaration['mobile'];
}

export interface AppModuleDeclaration {
  code: string;
  models: readonly AppDataModelDeclaration[];
  /** Only selected models receive standard pages. Navigation remains explicit. */
  crud?: readonly AppCrudViewDeclaration[];
}

export function defineDataModel<const Model extends AppDataModelDeclaration>(model: Model): Model {
  return Object.freeze(model);
}

export function defineResourceForm(
  model: AppDataModelDeclaration,
  form: Omit<AppResourceFormDeclaration, 'model'> = {}
): AppResourceFormDeclaration {
  return Object.freeze({ ...form, model: model.code });
}

export function defineResourceList(
  model: AppDataModelDeclaration,
  list: Omit<AppResourceListDeclaration, 'model'> = {}
): AppResourceListDeclaration {
  return Object.freeze({ ...list, model: model.code });
}

export function defineApplicationModule<const Module extends AppModuleDeclaration>(module: Module): Module {
  return Object.freeze(module);
}

/** One authoring projection into the platform's existing execution contract. */
export function materializeApplicationModules(modules: readonly AppModuleDeclaration[]) {
  const diagnostics: Diagnostic[] = [];
  const resources: AppDataResourceDeclaration[] = [];
  const moduleCodes = new Set<string>();
  const issue = (code: string, message: string, path: string) => {
    diagnostics.push({ schemaVersion: SCHEMA_VERSIONS.diagnostic, code, severity: 'error', message, path, retryable: false });
  };
  modules.forEach((module, moduleIndex) => {
    const path = `modules[${moduleIndex}]`;
    if (!module.code || moduleCodes.has(module.code)) {
      issue('APP_MODULE_CODE_INVALID', '模块需要唯一的 code', `${path}.code`);
    }
    moduleCodes.add(module.code);
    const models = new Map(module.models.map(model => [model.code, model]));
    const views = new Map<string, AppCrudViewDeclaration[]>();
    (module.crud || []).forEach((view, viewIndex) => {
      const viewPath = `${path}.crud[${viewIndex}]`;
      const model = models.get(view.model);
      if (!model) {
        issue('APP_CRUD_MODEL_INVALID', '标准 CRUD 必须引用本模块的数据模型', `${viewPath}.model`);
        return;
      }
      const siblings = views.get(view.model) || [];
      if (siblings.some(item => item.code === view.code) ||
        (view.code !== undefined && (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(view.code) || view.code.length > 64 || !view.name?.trim() || view.name.length > 255)) ||
        siblings.filter(item => item.code !== undefined).length >= 20) {
        issue('APP_VIEW_CODE_INVALID', '视图需要唯一的 code 和名称，每个模型最多 20 个命名视图', `${viewPath}.code`);
      }
      views.set(view.model, [...siblings, view]);
      const fields = new Map(model.fields.map(field => [field.code, field]));
      const validateSelection = (selection: readonly string[] | undefined, pointer: string) => {
        if (!selection) return;
        const seen = new Set<string>();
        selection.forEach((code, index) => {
          const field = fields.get(code);
          if (!field || seen.has(code) || (field.hidden ?? field.system) === true) {
            issue('APP_VIEW_FIELD_INVALID', '视图字段必须存在、不重复且不是内部隐藏字段', `${pointer}[${index}]`);
          }
          seen.add(code);
        });
      };
      for (const kind of ['list', 'form', 'detail'] as const) {
        const definition = view[kind];
        if (definition && definition.model !== model.code) {
          issue('APP_VIEW_MODEL_MISMATCH', '列表/表单必须绑定当前 CRUD 的数据模型', `${viewPath}.${kind}.model`);
        }
        validateSelection(definition?.fields, `${viewPath}.${kind}.fields`);
      }
      validateSelection(view.list?.filterFields, `${viewPath}.list.filterFields`);
      validateSelection(view.list?.searchableFields, `${viewPath}.list.searchableFields`);
      if (view.list?.defaultSort) validateSelection([view.list.defaultSort.field], `${viewPath}.list.defaultSort.field`);
      validateSelection(view.sections?.flatMap(section => [...section.fields]), `${viewPath}.sections.fields`);
      if (view.sections?.some(section => !section.title.trim() || section.title.length > 255)) {
        issue('APP_VIEW_SECTION_INVALID', '分组标题不能为空或超过 255 个字符', `${viewPath}.sections`);
      }
      const create = view.generated?.create ?? (!model.mutationOwner || model.mutationOwner === 'native');
      if (view.code !== undefined && create && view.form?.fields) {
        const missing = model.fields.filter(field => field.required && !field.system && field.type !== 'serial-number' && field.access?.create !== false && !view.form!.fields!.includes(field.code));
        if (missing.length) issue('APP_VIEW_CREATE_REQUIRED_FIELD_MISSING', `新建视图缺少必填字段：${missing.map(field => field.code).join('、')}；请补齐字段或关闭 create`, `${viewPath}.form.fields`);
      }
    });
    module.models.forEach(model => {
      const selected = views.get(model.code) || [];
      const view = selected.find(item => item.code === undefined);
      const publicFields = model.fields.filter(field => (field.hidden ?? field.system) !== true);
      const listFields = view?.list?.fields || publicFields.slice(0, 8).map(field => field.code);
      const formFields = view?.form?.fields || publicFields.filter(field => !field.system).map(field => field.code);
      const detailFields = view?.detail?.fields || publicFields.map(field => field.code);
      const native = !model.mutationOwner || model.mutationOwner === 'native';
      const sections = new Map(view?.sections?.flatMap(section =>
        section.fields.map(code => [code, section.title.trim()] as const)));
      resources.push({
        code: model.code,
        name: model.name,
        ...(selected.some(item => item.code !== undefined) ? { views: selected.filter(item => item.code !== undefined).map(item => {
          const groups = item.sections?.map(section => ({ title: section.title.trim(), fields: [...section.fields] }));
          return {
            code: item.code!, name: item.name?.trim() || item.code!,
            generated: { list: true, detail: true, create: native, update: native, delete: native, ...item.generated },
            list: { fieldOrder: [...(item.list?.fields || publicFields.slice(0, 8).map(field => field.code))],
              ...(item.list?.actions !== undefined ? { actions: item.list.actions } : {}),
              defaultPageSize: item.list?.defaultPageSize || 20,
              searchableFields: [...(item.list?.searchableFields || [])], filterFields: [...(item.list?.filterFields || [])],
              ...(item.list?.defaultSort ? { defaultSort: item.list.defaultSort } : {}) },
            form: { layout: item.form?.layout || (groups?.length ? 'sections' as const : 'flat' as const),
              fieldOrder: [...(item.form?.fields || publicFields.filter(field => !field.system).map(field => field.code))] },
            detail: { layout: item.detail?.layout || (groups?.length ? 'sections' as const : 'flat' as const),
              fieldOrder: [...(item.detail?.fields || publicFields.map(field => field.code))] },
            mobile: { enabled: item.mobile?.enabled ?? true }, ...(groups?.length ? { sections: groups } : {}),
          };
        }) } : {}),
        ...(model.mutationOwner ? { mutationOwner: model.mutationOwner } : {}),
        ...(model.invariants ? { invariants: model.invariants } : {}),
        ...(model.dataPolicyCode ? { dataPolicyCode: model.dataPolicyCode } : {}),
        ...(model.audit !== undefined ? { audit: model.audit } : {}),
        generated: {
          list: Boolean(view), detail: Boolean(view),
          create: Boolean(view) && native, update: Boolean(view) && native,
          delete: Boolean(view) && native, ...view?.generated,
        },
        fields: model.fields.map(field => {
          const section = sections.get(field.code);
          return {
            ...field,
            ...(section ? { section } : {}),
            // Display filters never silently turn every column into an index.
            indexed: field.indexed ?? false,
            list: Boolean(view) && listFields.includes(field.code),
            filter: selected.some(item => item.list?.filterFields?.includes(field.code)),
            searchable: selected.some(item => item.list?.searchableFields?.includes(field.code)),
            sortable: selected.some(item => item.list?.defaultSort?.field === field.code),
          };
        }),
        list: {
          fields: view ? [...listFields] : [],
          ...(view?.list?.actions !== undefined ? { actions: view.list.actions } : {}),
          ...(view?.list?.defaultPageSize ? { defaultPageSize: view.list.defaultPageSize } : {}),
          ...(view?.list?.defaultSort ? { defaultSort: view.list.defaultSort } : {}),
        },
        form: { layout: view?.form?.layout || (sections.size ? 'sections' : 'flat'), fields: [...formFields] },
        detail: { layout: view?.detail?.layout || (sections.size ? 'sections' : 'flat'), fields: [...detailFields] },
        mobile: view?.mobile || { enabled: Boolean(view) },
      });
    });
  });
  return { resources, diagnostics };
}
