import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, relative } from "node:path";
import { SCHEMA_VERSIONS, type Diagnostic } from "openxiangda-contracts";
import * as ts from "typescript";

const NEST_CLASS_DECORATORS = new Set([
  "Catch",
  "Controller",
  "Injectable",
  "Module",
  "WebSocketGateway",
]);

export function validateNestInjectionContract(root: string): Diagnostic[] {
  const sourceRoot = join(root, "apps", "server", "src");
  if (!existsSync(sourceRoot)) return [];
  return sourceFiles(sourceRoot).flatMap(file =>
    validateNestInjectionSource(
      readFileSync(file, "utf8"),
      relative(root, file).replaceAll("\\", "/")
    )
  );
}

export function validateNestInjectionSource(
  source: string,
  path = "apps/server/src/unknown.ts"
): Diagnostic[] {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const nestDecorators = nestDecoratorBindings(file);
  const diagnostics: Diagnostic[] = [];

  for (const statement of file.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    if (!isNestManagedClass(statement, nestDecorators)) continue;
    for (const member of statement.members) {
      if (!ts.isConstructorDeclaration(member)) continue;
      for (const parameter of member.parameters) {
        if (hasExplicitInjectionDecorator(parameter)) continue;
        const position = file.getLineAndCharacterOfPosition(parameter.getStart(file));
        const parameterName = parameter.name.getText(file);
        diagnostics.push({
          schemaVersion: SCHEMA_VERSIONS.diagnostic,
          code: "OPENXIANGDA_NEST_EXPLICIT_INJECTION_REQUIRED",
          severity: "error",
          message: `Nest 构造参数 ${parameterName} 必须显式声明 @Inject(Token)`,
          path: `${path}:${position.line + 1}:${position.character + 1}`,
          retryable: false,
          remediation:
            "为构造参数添加 @Inject(ProviderToken)；OpenXiangda 2.0 不依赖 emitDecoratorMetadata",
        });
      }
    }
  }
  return diagnostics;
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(path);
    }
  }
  return files;
}

function nestDecoratorBindings(file: ts.SourceFile) {
  const direct = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier) || !specifier.text.startsWith("@nestjs/")) {
      continue;
    }
    const clause = statement.importClause;
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = element.propertyName?.text || element.name.text;
        if (NEST_CLASS_DECORATORS.has(imported)) direct.add(element.name.text);
      }
    }
  }
  return { direct, namespaces };
}

function isNestManagedClass(
  node: ts.ClassDeclaration,
  bindings: ReturnType<typeof nestDecoratorBindings>
) {
  return decorators(node).some(decorator => {
    const expression = decoratorExpression(decorator);
    if (ts.isIdentifier(expression)) return bindings.direct.has(expression.text);
    return (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      bindings.namespaces.has(expression.expression.text) &&
      NEST_CLASS_DECORATORS.has(expression.name.text)
    );
  });
}

function hasExplicitInjectionDecorator(node: ts.ParameterDeclaration) {
  return decorators(node).some(decorator => {
    const expression = decoratorExpression(decorator);
    const name = ts.isIdentifier(expression)
      ? expression.text
      : ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : "";
    return name === "Inject" || name.startsWith("Inject");
  });
}

function decoratorExpression(decorator: ts.Decorator): ts.Expression {
  return ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
}

function decorators(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : [];
}
