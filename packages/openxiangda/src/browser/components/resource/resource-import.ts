import type {
  DataFieldSurface,
  DataResourceSurface,
  DataTransactionOperation,
} from 'openxiangda-contracts/browser';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 100;
const MANAGED_OR_NON_TABULAR_TYPES = new Set([
  'file',
  'image',
  'signature',
  'location',
  'serial-number',
  'subtable',
]);

export interface ResourceImportRow {
  rowNumber: number;
  data: Record<string, unknown>;
  errors: string[];
}

export interface ResourceImportPreview {
  fileName: string;
  rows: ResourceImportRow[];
  errors: string[];
  operations: DataTransactionOperation[];
}

export interface ResourceImportWorkbook {
  fileName: string;
  headers: string[];
  matrix: unknown[][];
}

export interface ResourceImportParseOptions {
  /** A field code per source column; null explicitly skips that column. */
  fieldMapping?: Array<string | null>;
  /** Parsing budget only. Native atomic transactions remain limited to 100 operations. */
  maxRows?: number;
  requiredFields?: 'all' | 'mapped' | 'none';
  blankCells?: 'skip' | 'null';
}

/** Reads bounded, untrusted file contents. It never grants permission or performs a write. */
export async function readResourceImportWorkbook(file: File): Promise<ResourceImportWorkbook> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('导入文件不能超过 5MB');
  if (!/\.(?:csv|xls|xlsx)$/i.test(file.name)) throw new Error('仅支持 CSV、XLS 或 XLSX 文件');
  const XLSX = await import('xlsx');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const csv = /\.csv$/i.test(file.name);
  let content: string | Uint8Array = bytes;
  if (csv) {
    const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
    try { content = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
    catch { throw new Error('CSV 编码无法读取，请另存为 UTF-8 CSV 或 XLSX 后导入'); }
  }
  const workbook = XLSX.read(content, { cellDates: true, type: csv ? 'string' : 'array', raw: csv, sheetRows: 5002 });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('文件中没有可读取的工作表');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('文件中的首个工作表不可读取');
  const range = XLSX.utils.decode_range(sheet['!fullref'] || sheet['!ref'] || 'A1');
  if (range.e.r > 5000 || range.e.c > 255) throw new Error('首个工作表最多支持 5000 数据行和 256 列');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { defval: '', header: 1, raw: true, range: 0 });
  return { fileName: file.name, headers: (matrix[0] || []).map(value => String(value ?? '').trim()), matrix };
}

export interface ResourceImportFieldGuide {
  code: string;
  header: string;
  label: string;
  type: string;
  required: boolean;
  importable: boolean;
  format: string;
  example: string;
  note: string;
}

export interface ResourceImportTemplate {
  fileName: string;
  content: ArrayBuffer;
  fields: ResourceImportFieldGuide[];
}

export async function buildResourceImportTemplate(
  resourceName: string,
  surface: DataResourceSurface,
  writableFieldCodes: string[]
): Promise<ResourceImportTemplate> {
  const fields = resourceImportFieldGuides(surface, writableFieldCodes);
  const importableFields = fields.filter((field) => field.importable);
  if (!importableFields.length) {
    throw new Error('当前角色没有可通过表格导入的字段');
  }
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([
    importableFields.map((field) => field.header),
  ]);
  dataSheet['!cols'] = importableFields.map((field) => ({
    wch: Math.max(14, Math.min(36, field.header.length * 2 + 4)),
  }));
  XLSX.utils.book_append_sheet(workbook, dataSheet, '导入数据');
  const guideSheet = XLSX.utils.json_to_sheet(
    fields.map((field) => ({
      字段代码: field.code,
      字段名称: field.label,
      数据类型: field.type,
      是否必填: field.required ? '是' : '否',
      是否可导入: field.importable ? '是' : '否',
      填写格式: field.format,
      示例: field.example,
      说明: field.note,
    }))
  );
  guideSheet['!cols'] = [
    { wch: 24 },
    { wch: 22 },
    { wch: 22 },
    { wch: 10 },
    { wch: 12 },
    { wch: 46 },
    { wch: 54 },
    { wch: 52 },
  ];
  XLSX.utils.book_append_sheet(workbook, guideSheet, '字段说明');
  const content = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
  }) as ArrayBuffer;
  return {
    fileName: `${safeFileName(resourceName)}导入模板.xlsx`,
    content,
    fields,
  };
}

export function resourceImportFieldGuides(
  surface: DataResourceSurface,
  writableFieldCodes: string[]
): ResourceImportFieldGuide[] {
  const writable = new Set(writableFieldCodes);
  const labelCounts = new Map<string, number>();
  for (const field of Object.values(surface.fields)) {
    if (!field.system && field.label) {
      labelCounts.set(field.label, (labelCounts.get(field.label) || 0) + 1);
    }
  }
  return Object.entries(surface.fields)
    .filter(([code, field]) => !field.system && writable.has(code))
    .map(([code, field]) => {
      const importable = !MANAGED_OR_NON_TABULAR_TYPES.has(field.type);
      const format = importFormat(field);
      return {
        code,
        header: labelCounts.get(field.label) === 1 ? field.label : code,
        label: field.label,
        type: field.type,
        required: Boolean(field.requiredHint),
        importable,
        format: importable ? format.format : '不在导入数据工作表中填写',
        example: importable ? format.example : '',
        note: importable ? format.note : nonImportableReason(field.type),
      };
    });
}

export async function parseResourceImportFile(
  file: File,
  resourceCode: string,
  surface: DataResourceSurface,
  writableFieldCodes: string[]
): Promise<ResourceImportPreview> {
  try {
    const workbook = await readResourceImportWorkbook(file);
    return parseResourceImportMatrix(file.name, workbook.matrix, resourceCode, surface, writableFieldCodes);
  } catch (error) {
    return failure(file.name, `文件解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

export function parseResourceImportMatrix(
  fileName: string,
  matrix: unknown[][],
  resourceCode: string,
  surface: DataResourceSurface,
  writableFieldCodes: string[],
  options: ResourceImportParseOptions = {}
): ResourceImportPreview {
  const maxRows = options.maxRows ?? MAX_IMPORT_ROWS;
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || maxRows > 5000) return failure(fileName, '解析行数上限必须在 1 到 5000 之间');
  if (!matrix.length) return failure(fileName, '导入文件为空');
  const headerRow = matrix[0];
  if (!headerRow) return failure(fileName, '导入文件缺少表头');
  if (headerRow.length > 256) return failure(fileName, '最多支持 256 列');
  if (options.fieldMapping && options.fieldMapping.length !== headerRow.length) return failure(fileName, '列映射数量必须与文件表头一致');
  const writable = new Set(writableFieldCodes);
  const fieldEntries = Object.entries(surface.fields).filter(([, field]) => !field.system);
  const aliases = new Map<string, string[]>();
  for (const [code, field] of fieldEntries) {
    for (const alias of [code, field.label]) {
      const key = String(alias || '').trim();
      if (!key) continue;
      aliases.set(key, [...(aliases.get(key) || []), code]);
    }
  }
  const headers = headerRow.map((value) => String(value ?? '').trim());
  const errors: string[] = [];
  const mapped = headers.map((header, index) => {
    const mapping = options.fieldMapping?.[index];
    if (options.fieldMapping && !mapping) return null;
    if (!options.fieldMapping && !header) return null;
    const matches = options.fieldMapping ? (mapping && surface.fields[mapping] ? [mapping] : []) : [...new Set(aliases.get(header) || [])];
    if (matches.length === 0) {
      errors.push(`第 ${index + 1} 列“${header}”不是已声明字段`);
      return null;
    }
    if (matches.length > 1) {
      errors.push(`第 ${index + 1} 列“${header}”对应多个字段，请改用字段代码`);
      return null;
    }
    const code = matches[0];
    if (!code) return null;
    const field = surface.fields[code];
    if (!field) return null;
    if (MANAGED_OR_NON_TABULAR_TYPES.has(field.type)) {
      errors.push(nonImportableReason(field.type, field.label));
      return null;
    }
    if (!writable.has(code)) {
      errors.push(`字段“${field.label}”不可在本次导入中写入`);
      return null;
    }
    return code;
  });
  const duplicateCodes = mapped.filter((code, index): code is string => Boolean(code) && mapped.indexOf(code) !== index);
  for (const code of [...new Set(duplicateCodes)]) {
    const field = surface.fields[code];
    if (field) errors.push(`字段“${field.label}”在表头中重复出现`);
  }
  const sourceRows = matrix
    .slice(1)
    .map((source, rowIndex) => ({ source, rowNumber: rowIndex + 2 }))
    .filter(({ source }) => source.some((value) => value !== undefined && value !== null && String(value).trim() !== ''));
  headers.forEach((header, index) => {
    if (!options.fieldMapping && !header && sourceRows.some(({ source }) => source[index] !== undefined && source[index] !== null && String(source[index]).trim() !== '')) {
      errors.push(`第 ${index + 1} 列存在数据但缺少表头`);
    }
  });
  if (!sourceRows.length) errors.push('导入文件没有数据行');
  if (sourceRows.length > maxRows) {
    errors.push(`单次最多导入 ${maxRows} 行，当前为 ${sourceRows.length} 行`);
  }
  const rows = sourceRows.slice(0, maxRows).map(({ source, rowNumber }) => {
    const data: Record<string, unknown> = {};
    const rowErrors: string[] = [];
    mapped.forEach((code, columnIndex) => {
      if (!code) return;
      const field = surface.fields[code];
      if (!field) return;
      try {
        const value = importValue(field, source[columnIndex]);
        if (value !== undefined) data[code] = value;
        else if (options.blankCells === 'null') data[code] = null;
      } catch (error) {
        rowErrors.push(`${field.label}：${error instanceof Error ? error.message : String(error)}`);
      }
    });
    for (const [code, field] of fieldEntries) {
      if (options.requiredFields !== 'none' && (options.requiredFields !== 'mapped' || mapped.includes(code)) && writable.has(code) && field.requiredHint && (data[code] === undefined || data[code] === null || data[code] === '')) {
        rowErrors.push(`${field.label}为必填项`);
      }
    }
    return { rowNumber, data, errors: rowErrors };
  });
  const rowErrors = rows.flatMap((row) => row.errors.map((error) => `第 ${row.rowNumber} 行：${error}`));
  return {
    fileName,
    rows,
    errors: [...errors, ...rowErrors],
    operations:
      errors.length || rowErrors.length
        ? []
        : rows.map((row) => ({
            operation: 'create' as const,
            resourceCode,
            data: row.data,
          })),
  };
}

function importValue(field: DataFieldSurface, input: unknown): unknown {
  if (input === undefined || input === null || input === '') return undefined;
  if (field.type === 'number.integer' || field.type === 'number.decimal') {
    const value = Number(input);
    if (!Number.isFinite(value)) throw new Error('必须是数字');
    if (field.type === 'number.integer' && !Number.isInteger(value)) throw new Error('必须是整数');
    return value;
  }
  if (field.type === 'boolean') {
    if (input === true || input === 1 || /^(?:是|true|yes|1)$/i.test(String(input).trim())) return true;
    if (input === false || input === 0 || /^(?:否|false|no|0)$/i.test(String(input).trim())) return false;
    throw new Error('请填写是或否');
  }
  if (field.type === 'date' || field.type === 'datetime') return importDate(input, field.type);
  if (field.type === 'time') {
    const text = String(input).trim();
    if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(text)) throw new Error('请按 HH:mm 或 HH:mm:ss 填写');
    const [hours, minutes, seconds = '0'] = text.split(':');
    if (Number(hours) > 23 || Number(minutes) > 59 || Number(seconds) > 59) throw new Error('时间格式无效');
    return field.timePrecision === 'minute' ? `${hours}:${minutes}` : `${hours}:${minutes}:${seconds.padStart(2, '0')}`;
  }
  if (field.type === 'date-range' || field.type === 'datetime-range') {
    const value = parseJsonObject(input, '必须是包含 start、end 的 JSON 对象');
    if (!value.start || !value.end) throw new Error('必须包含 start 和 end');
    const kind = field.type === 'date-range' ? 'date' : 'datetime';
    const start = importDate(value.start, kind);
    const end = importDate(value.end, kind);
    if (new Date(String(start)).getTime() > new Date(String(end)).getTime()) throw new Error('结束时间不能早于开始时间');
    return { start, end };
  }
  if (field.type === 'json' || field.type === 'address') {
    return parseJsonObject(input, '必须是有效 JSON 对象');
  }
  if (field.type.startsWith('user.') || field.type.startsWith('department.')) {
    return importLabeledSnapshot(field, input, false);
  }
  if (field.type.startsWith('resource-ref.')) return importLabeledSnapshot(field, input, true);
  if (field.type.startsWith('cascade.')) return importCascade(field, input);
  if (field.type === 'uuid') {
    const value = String(input).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new Error('必须是有效 UUID');
    }
    return value;
  }
  const multiple = field.type === 'option.multiple';
  const values = multiple
    ? (Array.isArray(input) ? input : String(input).split(/[、,，;；\n]+/)).map((value) => String(value).trim()).filter(Boolean)
    : [String(input).trim()];
  if (field.options?.length) {
    const resolved = values.map((value) => {
      const option = field.options?.find((item) => item.value === value || item.label === value);
      if (!option) throw new Error(`“${value}”不在可选项中`);
      return { ...option };
    });
    return multiple ? resolved : resolved[0];
  }
  return multiple ? values : values[0];
}

function importDate(input: unknown, kind: 'date' | 'datetime') {
  const text = String(input).trim();
  if (kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [yearText, monthText, dayText] = text.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const exact = new Date(Date.UTC(year, month - 1, day));
    if (exact.getUTCFullYear() !== year || exact.getUTCMonth() !== month - 1 || exact.getUTCDate() !== day) {
      throw new Error('日期格式无效');
    }
    return text;
  }
  const date = input instanceof Date ? input : new Date(String(input));
  if (Number.isNaN(date.getTime())) throw new Error('日期格式无效');
  return kind === 'date'
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    : date.toISOString();
}

function importLabeledSnapshot(field: DataFieldSurface, input: unknown, resource: boolean) {
  const multiple = field.type.endsWith('.multiple');
  const parsed = parseJson(input, multiple ? '必须是 JSON 对象数组' : '必须是 JSON 对象');
  const values = multiple ? parsed : [parsed];
  if (!Array.isArray(values) || (multiple && !Array.isArray(parsed))) {
    throw new Error(multiple ? '必须是 JSON 对象数组' : '必须是 JSON 对象');
  }
  const normalized = values.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('每项必须是 JSON 对象');
    const snapshot = value as Record<string, unknown>;
    if (!String(snapshot.label || '').trim() || !String(snapshot.value || '').trim()) {
      throw new Error('每项必须包含 label 和 value');
    }
    if (resource && !String(snapshot.resourceCode || '').trim()) {
      throw new Error('关联资源每项必须包含 resourceCode');
    }
    return snapshot;
  });
  return multiple ? normalized : normalized[0];
}

function importCascade(field: DataFieldSurface, input: unknown) {
  const multiple = field.type.endsWith('.multiple');
  const parsed = parseJson(input, multiple ? '必须是 JSON 路径数组' : '必须是 JSON 路径');
  const paths = multiple ? parsed : [parsed];
  if (!Array.isArray(paths) || (multiple && !Array.isArray(parsed))) throw new Error('级联值格式无效');
  const normalized = paths.map((path) => {
    if (!Array.isArray(path) || !path.length) throw new Error('每条级联路径必须是非空数组');
    for (const item of path) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('级联路径项必须是 JSON 对象');
      const option = item as Record<string, unknown>;
      if (!String(option.label || '').trim() || !String(option.value || '').trim()) {
        throw new Error('级联路径项必须包含 label 和 value');
      }
    }
    return path;
  });
  return multiple ? normalized : normalized[0];
}

function parseJson(input: unknown, message: string): unknown {
  if (typeof input === 'object' && input !== null) return input;
  try {
    return JSON.parse(String(input));
  } catch {
    throw new Error(message);
  }
}

function parseJsonObject(input: unknown, message: string): Record<string, unknown> {
  const parsed = parseJson(input, message);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(message);
  return parsed as Record<string, unknown>;
}

function importFormat(field: DataFieldSurface): { format: string; example: string; note: string } {
  if (field.type === 'boolean') return { format: '是 / 否', example: '是', note: '也支持 true/false、yes/no、1/0' };
  if (field.type === 'number.integer') return { format: '整数', example: '10', note: '不能包含小数' };
  if (field.type === 'number.decimal') return { format: '数字', example: '10.5', note: '请勿填写单位或千分位符号' };
  if (field.type === 'date') return { format: 'YYYY-MM-DD', example: '2026-09-03', note: '使用公历日期' };
  if (field.type === 'datetime') return { format: 'YYYY-MM-DD HH:mm:ss', example: '2026-09-03 09:30:00', note: '导入后保存为标准时间' };
  if (field.type === 'time') return { format: 'HH:mm 或 HH:mm:ss', example: '09:30', note: '24 小时制' };
  if (field.type === 'date-range') return { format: 'JSON 对象', example: '{"start":"2026-09-01","end":"2026-09-30"}', note: '必须包含 start、end' };
  if (field.type === 'datetime-range') return { format: 'JSON 对象', example: '{"start":"2026-09-01T00:00:00+08:00","end":"2026-09-30T23:59:59+08:00"}', note: '必须包含 start、end' };
  if (field.type === 'option.single') {
    return { format: '选项名称或选项值', example: field.options?.[0]?.label || '', note: optionNote(field) };
  }
  if (field.type === 'option.multiple') {
    return { format: '多个选项以中文逗号分隔', example: (field.options || []).slice(0, 2).map((item) => item.label).join('，'), note: optionNote(field) };
  }
  if (field.type.startsWith('user.') || field.type.startsWith('department.')) {
    const item = '{"label":"张三","value":"平台目录标识"}';
    return { format: field.type.endsWith('.multiple') ? 'JSON 对象数组' : 'JSON 对象', example: field.type.endsWith('.multiple') ? `[${item}]` : item, note: 'value 必须使用平台目录中的稳定标识' };
  }
  if (field.type.startsWith('resource-ref.')) {
    const item = `{"label":"示例","value":"记录ID","resourceCode":"${field.source?.resourceCode || 'resource-code'}"}`;
    return { format: field.type.endsWith('.multiple') ? 'JSON 对象数组' : 'JSON 对象', example: field.type.endsWith('.multiple') ? `[${item}]` : item, note: 'value 必须是目标记录 ID，resourceCode 必须是目标资源代码' };
  }
  if (field.type.startsWith('cascade.')) {
    const path = '[{"label":"一级","value":"level-1"},{"label":"二级","value":"level-2"}]';
    return { format: field.type.endsWith('.multiple') ? 'JSON 路径数组' : 'JSON 路径', example: field.type.endsWith('.multiple') ? `[${path}]` : path, note: '每个路径项必须包含 label 和 value' };
  }
  if (field.type === 'address') return { format: 'JSON 对象', example: '{"fullAddress":"浙江省杭州市西湖区文一路1号","detail":"文一路1号"}', note: '建议包含平台行政区划快照与 fullAddress' };
  if (field.type === 'json') return { format: '有效 JSON 对象', example: '{"key":"value"}', note: '必须是 JSON 对象，不能是普通文本' };
  if (field.type === 'uuid') return { format: 'UUID', example: '550e8400-e29b-41d4-a716-446655440000', note: '标准 UUID 字符串' };
  return { format: '文本', example: '', note: field.maxLength ? `最多 ${field.maxLength} 个字符` : '' };
}

function optionNote(field: DataFieldSurface) {
  return (field.options || []).map((item) => `${item.label}(${item.value})`).join('、');
}

function nonImportableReason(type: string, label?: string) {
  const prefix = label ? `字段“${label}”` : '';
  if (['file', 'image', 'signature'].includes(type)) return `${prefix}必须通过平台上传组件录入`;
  if (type === 'location') return `${prefix}必须由钉钉或浏览器定位采集，不能从表格手工导入`;
  if (type === 'subtable') return `${prefix}属于子表数据，必须通过对应子资源或业务动作录入`;
  if (type === 'serial-number') return `${prefix}由平台自动生成，不能导入`;
  return `${prefix}不支持表格导入`;
}

function safeFileName(value: string) {
  const safe = String(value || '数据').replace(/[\\/:*?"<>|]/g, '-').trim();
  return safe || '数据';
}

function failure(fileName: string, message: string): ResourceImportPreview {
  return { fileName, rows: [], errors: [message], operations: [] };
}
