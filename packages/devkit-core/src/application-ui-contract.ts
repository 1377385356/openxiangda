import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { SCHEMA_VERSIONS, type Diagnostic } from 'openxiangda-contracts';
import * as ts from 'typescript';

const desktopInputs = new Set([
  'Input', 'InputNumber', 'AutoComplete', 'Select', 'Cascader', 'TreeSelect',
  'DatePicker', 'TimePicker', 'Radio', 'Checkbox', 'Switch', 'Slider',
  'Rate', 'Upload', 'Mentions', 'ColorPicker', 'Transfer',
]);
const desktopPaths = new Set([...desktopInputs].map(name => name.replace(/[A-Z]/g, (letter, index) => `${index ? '-' : ''}${letter.toLowerCase()}`)));
const nativeInputs = new Set(['input', 'select', 'textarea']);
const mobilePath = /(?:^|\/)mobile(?:\/|\.)|(?:^|\/)Mobile[^/]*\.[jt]sx?$|\.mobile\.[jt]sx?$/;

/** Development feedback only: does not add a second runtime authorization gate. */
export function validateApplicationUiContract(root: string, frontendRoot = 'apps/web'): Diagnostic[] {
  const sourceRoot = resolve(root, frontendRoot, 'src');
  if (!existsSync(sourceRoot)) return [];
  const files = new Map<string, ts.SourceFile>();
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'generated', '__tests__', 'e2e', 'dist'].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && /\.[jt]sx?$/.test(path) && !/\.(?:d|test|spec)\.[jt]sx?$/.test(path)) {
        files.set(path, parse(readFileSync(path, 'utf8'), path));
      }
    }
  };
  visit(sourceRoot);
  const configPath = ts.findConfigFile(resolve(root, frontendRoot), ts.sys.fileExists);
  const config = configPath ? ts.readConfigFile(configPath, ts.sys.readFile).config : {};
  const options = ts.parseJsonConfigFileContent(config || {}, ts.sys, resolve(root, frontendRoot)).options;
  const mobileFiles = new Set<string>();
  const markMobile = (path: string) => {
    if (mobileFiles.has(path)) return;
    const file = files.get(path);
    if (!file) return;
    mobileFiles.add(path);
    for (const statement of file.statements) {
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ||
          !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      if (ts.isImportDeclaration(statement) ? statement.importClause?.isTypeOnly : statement.isTypeOnly) continue;
      const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : statement.exportClause;
      if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) && bindings.elements.length && bindings.elements.every(item => item.isTypeOnly)) continue;
      const target = ts.resolveModuleName(statement.moduleSpecifier.text, path, options, ts.sys).resolvedModule?.resolvedFileName;
      if (target) markMobile(resolve(target));
    }
  };
  for (const path of files.keys()) {
    if (mobilePath.test(relative(sourceRoot, path).replaceAll('\\', '/'))) markMobile(path);
  }
  return [...files].flatMap(([path, file]) => inspect(file, relative(root, path).replaceAll('\\', '/'), mobileFiles.has(path)));
}

export function validateApplicationUiSource(source: string, path: string, mobile = mobilePath.test(path)): Diagnostic[] {
  return inspect(parse(source, path), path, mobile);
}

function parse(source: string, path: string) {
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function inspect(file: ts.SourceFile, path: string, mobile: boolean): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const reactNamespaces = new Set<string>();
  const createElements = new Set<string>();
  const desktopNamespaces = new Set<string>();
  const report = (node: ts.Node, code: string, message: string, remediation: string) => {
    const position = file.getLineAndCharacterOfPosition(node.getStart(file));
    diagnostics.push({ schemaVersion: SCHEMA_VERSIONS.diagnostic, code, severity: 'error',
      message, remediation, path: `${path}:${position.line + 1}:${position.character + 1}`, retryable: false });
  };
  const raw = (node: ts.Node) => report(node, 'OPENXIANGDA_PLATFORM_FIELD_REQUIRED',
    '业务录入请使用平台 Field Kit 或对应端的 Ant Design 控件',
    "优先从 openxiangda/field-kit 使用平台控件；PC 使用 antd，移动端使用 openxiangda/mobile。原生 input/select/textarea/contentEditable 只由平台组件内部实现。");
  for (const statement of file.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ||
        !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const module = statement.moduleSpecifier.text;
    if (/^antd-mobile(?:\/(?:es|cjs)(?:\/index(?:\.js)?)?|\/global(?:\/.*)?)?$/.test(module)) {
      const typeOnly = ts.isImportDeclaration(statement) ? statement.importClause?.isTypeOnly : statement.isTypeOnly;
      const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : statement.exportClause;
      const allTypeBindings = bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) && bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly);
      if (!typeOnly && !allTypeBindings) report(statement, 'OPENXIANGDA_MOBILE_SCOPED_IMPORT_REQUIRED',
        '移动库根入口会引入影响整页的全局样式',
        '从 openxiangda/mobile 使用平台封装的移动控件，配合 MobileSurface 和 openxiangda/mobile/styles.css。');
    }
    if (ts.isImportDeclaration(statement) && module === 'react' && !statement.importClause?.isTypeOnly) {
      const clause = statement.importClause;
      if (clause?.name) reactNamespaces.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) reactNamespaces.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
        if (!binding.isTypeOnly && (binding.propertyName?.text || binding.name.text) === 'createElement') createElements.add(binding.name.text);
      }
    }
    if (!mobile || !/^antd(?:\/|$)/.test(module)) continue;
    if (ts.isImportDeclaration(statement) ? statement.importClause?.isTypeOnly : statement.isTypeOnly) continue;
    const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : statement.exportClause;
    let invalid = desktopPaths.has(module.match(/^antd\/(?:es|lib)\/([^/]+)/)?.[1] || '');
    if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
      invalid ||= bindings.elements.some(binding => !binding.isTypeOnly && desktopInputs.has(binding.propertyName?.text || binding.name.text));
    } else if (bindings && ts.isNamespaceImport(bindings)) desktopNamespaces.add(bindings.name.text);
    if (ts.isImportDeclaration(statement) && statement.importClause?.name && module === 'antd') desktopNamespaces.add(statement.importClause.name.text);
    if (invalid) report(statement, 'OPENXIANGDA_MOBILE_FIELD_REQUIRED',
      '移动页面及其共享组件不能引入桌面 Ant Design 录入控件',
      '改用平台 MobileSurfaceFieldControl 或 openxiangda/mobile，并将 PC 专属控件放入独立桌面组件。');
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const editable = node.attributes.properties.some(attribute => {
        if (!ts.isJsxAttribute(attribute) || attribute.name.getText(file) !== 'contentEditable') return false;
        const value = attribute.initializer;
        return !(value && ((ts.isStringLiteral(value) && value.text === 'false') ||
          (ts.isJsxExpression(value) && value.expression?.kind === ts.SyntaxKind.FalseKeyword)));
      });
      if (nativeInputs.has(node.tagName.getText(file)) || editable) raw(node);
    }
    if (mobile && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && desktopNamespaces.has(node.expression.text) && desktopInputs.has(node.name.text)) {
      report(node, 'OPENXIANGDA_MOBILE_FIELD_REQUIRED', '移动页面引用了桌面录入控件', '改用平台移动 Field Kit 或 openxiangda/mobile。');
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isCreate = (ts.isIdentifier(callee) && createElements.has(callee.text)) ||
        (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && reactNamespaces.has(callee.expression.text) && callee.name.text === 'createElement');
      const tag = node.arguments[0];
      if (isCreate && tag && ts.isStringLiteral(tag) && nativeInputs.has(tag.text)) raw(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return diagnostics;
}
