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

const NEST_ROUTE_METHOD_DECORATORS = new Set([
  "All",
  "Delete",
  "Get",
  "Head",
  "Options",
  "Patch",
  "Post",
  "Put",
  "RequestMapping",
]);

const OPENXIANGDA_OPERATION_DECORATOR = "OpenXiangdaOperation";
const DECLARED_CONTRACTS_MODULE = "@app/contracts";

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

export function validateNestControllerOperationContract(root: string): Diagnostic[] {
  const sourceRoot = join(root, "apps", "server", "src");
  if (!existsSync(sourceRoot)) return [];
  return sourceFiles(sourceRoot).flatMap(file =>
    validateNestControllerOperationSource(
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

export function validateNestControllerOperationSource(
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
  const nestCommon = moduleImports(file, specifier => specifier === "@nestjs/common");
  const nestSdk = moduleImports(file, specifier => specifier === "openxiangda/nest");
  const contractsNames = moduleImports(
    file,
    specifier => specifier === DECLARED_CONTRACTS_MODULE
  );
  const diagnostics: Diagnostic[] = [];

  for (const statement of file.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    if (!hasNamedDecorator(statement, "Controller", nestCommon)) continue;
    const className = statement.name?.getText(file) ?? "?";
    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || !member.body) continue;
      if (!hasAnyNamedDecorator(member, NEST_ROUTE_METHOD_DECORATORS, nestCommon)) continue;
      const position = file.getLineAndCharacterOfPosition(member.getStart(file));
      const operation = decorators(member).find(decorator =>
        decoratorNameMatches(decorator, OPENXIANGDA_OPERATION_DECORATOR, nestSdk)
      );
      const handler = member.name.getText(file);
      if (!operation) {
        diagnostics.push({
          schemaVersion: SCHEMA_VERSIONS.diagnostic,
          code: "OPENXIANGDA_NEST_CONTROLLER_OPERATION_REQUIRED",
          severity: "error",
          message: `应用路由 ${className}.${handler} 必须以 @OpenXiangdaOperation 绑定已声明的 operation`,
          path: `${path}:${position.line + 1}:${position.character + 1}`,
          retryable: false,
          remediation:
            "普通 CRUD 由浏览器经平台 Data API 执行，不在 controller 转发；真实业务动作先在 openxiangda.config.ts 声明 operation（capability kind: 'backend'），再在此路由绑定 @OpenXiangdaOperation(appOperations.<code>)。参见 docs development#backend-decision",
        });
        continue;
      }
      const call = ts.isCallExpression(operation.expression) ? operation.expression : undefined;
      const contractArgument = call?.arguments[0];
      if (
        !call ||
        call.arguments.length !== 1 ||
        !isDeclaredOperationContract(contractArgument, contractsNames)
      ) {
        diagnostics.push({
          schemaVersion: SCHEMA_VERSIONS.diagnostic,
          code: "OPENXIANGDA_NEST_OPERATION_CONTRACT_MUST_BE_DECLARED",
          severity: "error",
          message: `路由 ${className}.${handler} 的 @OpenXiangdaOperation 参数必须是生成契约 appOperations.<code>`,
          path: `${path}:${position.line + 1}:${position.character + 1}`,
          retryable: false,
          remediation:
            "operation 合同只能来自编译器产物：import { appOperations } from '@app/contracts' 并传递其中的具名 operation；不接受手写字面量或其他来源",
        });
      }
    }
  }
  return diagnostics;
}

function isDeclaredOperationContract(
  node: ts.Expression | undefined,
  contractsNames: ModuleBindings
): boolean {
  if (!node || !ts.isPropertyAccessExpression(node)) return false;
  const receiver = node.expression;
  if (!ts.isIdentifier(receiver)) return false;
  return contractsNames.direct.has(receiver.text);
}

interface ModuleBindings {
  direct: Set<string>;
  namespaces: Set<string>;
}

function moduleImports(
  file: ts.SourceFile,
  specifierMatches: (specifier: string) => boolean
): ModuleBindings {
  const direct = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier) || !specifierMatches(specifier.text)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        direct.add(element.name.text);
      }
    }
  }
  return { direct, namespaces };
}

function decoratorNameMatches(
  decorator: ts.Decorator,
  name: string,
  bindings: ModuleBindings
): boolean {
  const expression = decoratorExpression(decorator);
  if (ts.isIdentifier(expression)) return expression.text === name && bindings.direct.has(name);
  return (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    bindings.namespaces.has(expression.expression.text) &&
    expression.name.text === name
  );
}

function hasNamedDecorator(
  node: ts.Node,
  name: string,
  bindings: ModuleBindings
): boolean {
  return decorators(node).some(decorator =>
    decoratorNameMatches(decorator, name, bindings)
  );
}

function hasAnyNamedDecorator(
  node: ts.Node,
  names: Set<string>,
  bindings: ModuleBindings
): boolean {
  return decorators(node).some(decorator => {
    const expression = decoratorExpression(decorator);
    const name = ts.isIdentifier(expression)
      ? expression.text
      : ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : "";
    if (!names.has(name)) return false;
    if (ts.isIdentifier(expression)) return bindings.direct.has(name);
    return (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      bindings.namespaces.has(expression.expression.text)
    );
  });
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
