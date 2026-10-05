import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const infrastructureRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const coreRoot = join(infrastructureRoot, '..');

export const AI_SUBTREE_ROOT = join(infrastructureRoot, 'ai');

export const ADVISOR_OWNED_FILES: readonly string[] = [
  join(coreRoot, 'application/use-cases/AskAdvisorUC.ts'),
  join(infrastructureRoot, 'routes/advisor.ts'),
  join(infrastructureRoot, 'dtos/advisor.ts'),
  join(infrastructureRoot, 'di/advisorComposition.ts'),
  join(infrastructureRoot, 'adapters/SqliteAdvisorRunLogAdapter.ts'),
];

export function productionSourcesUnder(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionSourcesUnder(path);
    return entry.name.endsWith('.ts') && !/\.(spec|test)(-d)?\.ts$/.test(entry.name) ? [path] : [];
  });
}

export function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

export function displayPath(path: string): string {
  return relative(coreRoot, path);
}

export interface Violation {
  readonly rule: string;
  readonly line: number;
}

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile('scanned.ts', source, ts.ScriptTarget.Latest, true);
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

function report(file: ts.SourceFile, node: ts.Node, rule: string): Violation {
  return { rule, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 };
}

function moduleSpecifierOf(node: ts.Node): string | undefined {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (ts.isCallExpression(node) && node.arguments.length === 1) {
    const [argument] = node.arguments;
    const callee = node.expression;
    const isLoader = callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === 'require');
    if (isLoader && argument && ts.isStringLiteralLike(argument)) return argument.text;
  }
  return undefined;
}

/** Operates on the syntax tree, so comments and string contents can never match. */
export function findNumericCoercion(source: string): Violation[] {
  const file = parse(source);
  const found: Violation[] = [];
  walk(file, (node) => {
    if (ts.isIdentifier(node) && (node.text === 'parseFloat' || node.text === 'toFixed')) {
      found.push(report(file, node, node.text));
    }
    if (ts.isIdentifier(node) && node.text === 'Number') {
      const parent = node.parent;
      const isCallee = (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node;
      if (isCallee) found.push(report(file, node, 'Number('));
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Intl' && node.name.text === 'NumberFormat') {
      found.push(report(file, node, 'Intl.NumberFormat'));
    }
    const specifier = moduleSpecifierOf(node);
    if (specifier !== undefined && (specifier === 'decimal.js' || specifier.startsWith('decimal.js/'))) {
      found.push(report(file, node, 'decimal.js'));
    }
  });
  return found;
}

export function findAnyEscapes(source: string): Violation[] {
  const file = parse(source);
  const found: Violation[] = [];
  walk(file, (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) found.push(report(file, node, 'any'));
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && node.type.kind === ts.SyntaxKind.NeverKeyword) {
      found.push(report(file, node, 'as never'));
    }
  });
  return found;
}

/** Arithmetic lives in core-domain's pure functions; the AI subtree may call those but never hold a `Money` or a decimal library. */
export function findMoneyImports(source: string): Violation[] {
  const file = parse(source);
  const found: Violation[] = [];
  walk(file, (node) => {
    const specifier = moduleSpecifierOf(node);
    if (specifier === undefined) return;
    if (/decimal\.js/.test(specifier) || /value-objects\/Money$/.test(specifier)) {
      found.push(report(file, node, `import of ${specifier}`));
      return;
    }
    if (ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings) && bindings.elements.some((el) => (el.propertyName ?? el.name).text === 'Money')) {
        found.push(report(file, node, 'import of Money'));
      }
    }
  });
  return found;
}

const ORDERING_CLAUSE = /\b(PARTITION\s+BY|ORDER\s+BY)\b/i;
const CUSTODY_OR_TAX_MODULE = /fifo|custody|duckdb/i;
/** The read-only custody lookup is reached only through its use case and the tool wrapping it; no other custody-named module is. */
const ALLOWED_CUSTODY_NAMED_MODULES = /(^|\/)(GetLotCustodyLocationsUseCase|custodyLocationsTool)\.js$/;

/** Only literals are inspected, so a comment that names a clause is not a clause. */
export function findOrderingSqlAndTaxImports(source: string): Violation[] {
  const file = parse(source);
  const found: Violation[] = [];
  walk(file, (node) => {
    const literalText = ts.isStringLiteralLike(node)
      ? node.text
      : ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
        ? node.text
        : undefined;
    if (literalText !== undefined && ORDERING_CLAUSE.test(literalText)) {
      found.push(report(file, node, 'PARTITION BY / ORDER BY'));
    }
    const specifier = moduleSpecifierOf(node);
    if (
      specifier !== undefined &&
      CUSTODY_OR_TAX_MODULE.test(specifier) &&
      !ALLOWED_CUSTODY_NAMED_MODULES.test(specifier)
    ) {
      found.push(report(file, node, `import of ${specifier}`));
    }
  });
  return found;
}

const FORBIDDEN_ROUTE_MODULE = /@mastra\/|\/ai\/(agents|tools|prompts|guardrails)\/|MastraAdvisorAdapter|IAdvisorPort|decimal\.js/;
const FORBIDDEN_ROUTE_CALLS = new Set(['ask', 'generate', 'generateText', 'stream', 'streamText', 'getLatest']);
const FORBIDDEN_ROUTE_IDENTIFIERS = new Set(['instructions', 'systemPrompt', 'buildTaxAnalystInstructions', 'runAdvisor']);

/** A route may validate, delegate and map; reaching the model, a tool, a prompt or a figure is a leak. */
export function findRouteLogicLeaks(source: string): Violation[] {
  const file = parse(source);
  const found: Violation[] = [];
  walk(file, (node) => {
    const specifier = moduleSpecifierOf(node);
    if (specifier !== undefined && FORBIDDEN_ROUTE_MODULE.test(specifier)) {
      found.push(report(file, node, `import of ${specifier}`));
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && FORBIDDEN_ROUTE_CALLS.has(node.expression.name.text)) {
      found.push(report(file, node, `call to .${node.expression.name.text}()`));
    }
    if (ts.isIdentifier(node) && FORBIDDEN_ROUTE_IDENTIFIERS.has(node.text)) {
      found.push(report(file, node, `reference to ${node.text}`));
    }
  });
  return [...found, ...findNumericCoercion(source)];
}

function calleeName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

/** A call by bare name or as a method, e.g. `rank(...)` or `x.rank(...)`; strings and comments never match. */
export function findCalls(source: string, name: string): Violation[] {
  const file = parse(source);
  const found: Violation[] = [];
  walk(file, (node) => {
    if (ts.isCallExpression(node) && calleeName(node.expression) === name) found.push(report(file, node, `call to ${name}`));
  });
  return found;
}

export function findConstructions(source: string, className: string): Violation[] {
  const file = parse(source);
  const found: Violation[] = [];
  walk(file, (node) => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === className) {
      found.push(report(file, node, `new ${className}`));
    }
  });
  return found;
}

const MONEY_NAME = /value|amount|price|cost|proceeds|gain|loss|balance|fiat|fee|pnl|equity|total|notional|quantity/i;
const NOT_MONEY_NAME = /count|page|length|index|chars|size|budget|steps/i;
const COMPARISON_OPERATORS = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);
const ARITHMETIC_OPERATORS = new Set([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
]);

function namesIn(node: ts.Node): string[] {
  const names: string[] = [];
  walk(node, (child) => {
    if (ts.isIdentifier(child)) names.push(child.text);
  });
  return names;
}

function looksMonetary(node: ts.Node): boolean {
  return namesIn(node).some((name) => MONEY_NAME.test(name) && !NOT_MONEY_NAME.test(name));
}

/**
 * Any comparison or arithmetic over a monetary-looking operand, plus `.sort(` and `.toSorted(`. Operates on the syntax tree, so comments and string contents never match.
 */
export function findMonetaryOperations(source: string): Violation[] {
  const file = parse(source);
  const found: Violation[] = [];
  walk(file, (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (name === 'sort' || name === 'toSorted') found.push(report(file, node, `.${name}(`));
    }
    if (ts.isBinaryExpression(node)) {
      const kind = node.operatorToken.kind;
      const isStringJoin = ts.isStringLiteralLike(node.left) || ts.isStringLiteralLike(node.right) || ts.isTemplateExpression(node.left) || ts.isTemplateExpression(node.right);
      if (COMPARISON_OPERATORS.has(kind) && (looksMonetary(node.left) || looksMonetary(node.right))) {
        found.push(report(file, node, `comparison ${node.operatorToken.getText(file)}`));
      }
      if (ARITHMETIC_OPERATORS.has(kind) && !isStringJoin && (looksMonetary(node.left) || looksMonetary(node.right))) {
        found.push(report(file, node, `arithmetic ${node.operatorToken.getText(file)}`));
      }
    }
  });
  return found;
}

/** Every type assertion except `as const`. */
export function findTypeAssertions(source: string): Violation[] {
  const file = parse(source);
  const found: Violation[] = [];
  walk(file, (node) => {
    if (ts.isAsExpression(node) && !(ts.isTypeReferenceNode(node.type) && node.type.typeName.getText(file) === 'const')) {
      found.push(report(file, node, 'as assertion'));
    }
    if (ts.isTypeAssertionExpression(node)) found.push(report(file, node, '<T> assertion'));
    if (ts.isNonNullExpression(node)) found.push(report(file, node, 'non-null assertion'));
  });
  return found;
}

/** Identifier references only; a comment or a string that names the symbol is not a reference. */
export function findIdentifiers(source: string, pattern: RegExp): Violation[] {
  const file = parse(source);
  const found: Violation[] = [];
  walk(file, (node) => {
    if (ts.isIdentifier(node) && pattern.test(node.text)) found.push(report(file, node, `reference to ${node.text}`));
    const specifier = moduleSpecifierOf(node);
    if (specifier !== undefined && pattern.test(specifier)) found.push(report(file, node, `import of ${specifier}`));
  });
  return found;
}

/** Source text of every initializer assigned to an object-literal property called `name`. */
export function propertyInitializers(source: string, name: string): string[] {
  const file = parse(source);
  const found: string[] = [];
  walk(file, (node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found.push(node.initializer.getText(file));
    }
  });
  return found;
}
