import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import type {
  AnalyzerInput,
  AnalyzerOutput,
  ExtractedFinding,
  ParseIssue,
} from '@codeorbit/analyzer-contracts';
import { createEvidenceExcerpt, spanAtByteOffsets } from './evidence.js';

const MAX_SOURCE_BYTES = 2_000_000;
const QUERY_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), '../queries');
const SYMBOL_QUERY_FILES = {
  javascript: readFileSync(join(QUERY_DIRECTORY, 'javascript.scm'), 'utf8'),
  typescript: readFileSync(join(QUERY_DIRECTORY, 'typescript.scm'), 'utf8'),
  tsx: readFileSync(join(QUERY_DIRECTORY, 'tsx.scm'), 'utf8'),
};

function languageFor(path: string): Parser.Language | undefined {
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  if (extension === '.js' || extension === '.jsx' || extension === '.mjs' || extension === '.cjs') {
    return JavaScript as Parser.Language;
  }
  if (extension === '.tsx') return TypeScript.tsx as Parser.Language;
  if (['.ts', '.mts', '.cts'].includes(extension)) return TypeScript.typescript as Parser.Language;
  return undefined;
}

function sourceName(node: Parser.SyntaxNode): string {
  const name = node.childForFieldName('name');
  if (name) return name.text;
  if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
    const declaration = node.namedChildren.find((child) => child.type === 'variable_declarator');
    return declaration?.childForFieldName('name')?.text ?? node.type;
  }
  return node.type;
}

function parentClassName(node: Parser.SyntaxNode): string {
  let parent = node.parent;
  while (parent && parent.type !== 'class_declaration' && parent.type !== 'class') {
    parent = parent.parent;
  }
  return parent ? sourceName(parent) : 'unknown class';
}

function importBindings(node: Parser.SyntaxNode): string[] {
  const bindings: string[] = [];
  const visitImport = (current: Parser.SyntaxNode): void => {
    if (current.type === 'import_specifier') {
      const alias = current.childForFieldName('alias');
      const name = current.childForFieldName('name');
      const localName = alias?.text ?? name?.text;
      if (localName) bindings.push(localName);
      return;
    }
    if (current.type === 'identifier' && current.parent?.type === 'import_clause') {
      bindings.push(current.text);
      return;
    }
    for (const child of current.namedChildren) visitImport(child);
  };
  visitImport(node);
  return bindings;
}

function toFinding(
  input: AnalyzerInput,
  node: Parser.SyntaxNode,
  kind: string,
  name: string,
  attributes: Readonly<Record<string, unknown>> = {},
): ExtractedFinding {
  return {
    kind,
    name,
    path: input.path,
    span: spanAtByteOffsets(input.content, node.startIndex, node.endIndex),
    excerpt: createEvidenceExcerpt(input.content, node.startIndex, node.endIndex),
    attributes,
  };
}

function visit(
  node: Parser.SyntaxNode,
  input: AnalyzerInput,
  findings: ExtractedFinding[],
  issues: ParseIssue[],
  symbolNodeIds: ReadonlySet<number>,
): void {
  if (node.isMissing || node.isError) {
    issues.push({
      path: input.path,
      code: node.isMissing ? 'missing_node' : 'syntax_error',
      message: node.isMissing
        ? 'The parser found a missing syntax node.'
        : 'The parser found invalid syntax.',
      span: spanAtByteOffsets(input.content, node.startIndex, node.endIndex),
    });
  }

  const declarationKinds: Readonly<Record<string, string>> = {
    function_declaration: 'function',
    generator_function_declaration: 'function',
    class_declaration: 'class',
    interface_declaration: 'interface',
    type_alias_declaration: 'type',
    enum_declaration: 'enum',
    method_definition: 'method',
    lexical_declaration: 'variable',
    variable_declaration: 'variable',
  };
  const symbolKind = declarationKinds[node.type];
  if (symbolKind && symbolNodeIds.has(node.id)) {
    findings.push(toFinding(input, node, 'symbol', sourceName(node), { symbolKind }));
  }

  if (node.type === 'import_statement') {
    const source = node.childForFieldName('source')?.text ?? node.namedChildren.at(-1)?.text ?? '';
    const importedNames = importBindings(node);
    findings.push(
      toFinding(input, node, 'import', source.replace(/^['"]|['"]$/gu, ''), {
        source,
        importedNames,
      }),
    );
  }

  if (node.type === 'export_statement') {
    const declaration = node.childForFieldName('declaration');
    const name = declaration
      ? sourceName(declaration)
      : (node.namedChildren.at(-1)?.text ?? 'export');
    findings.push(toFinding(input, node, 'export', name, { declarationKind: declaration?.type }));
  }

  if (node.type === 'call_expression') {
    const callee = node.childForFieldName('function');
    const expression = callee?.text ?? '';
    const simpleName = expression.split('.').at(-1) ?? expression;
    findings.push(
      toFinding(input, node, 'call', simpleName, { expression, caller: parentClassName(node) }),
    );
    const route = expression.match(/(?:^|\.)((?:get|post|put|patch|delete|route))$/u);
    const routePath = node.namedChildren
      .find((child) => child.type === 'arguments')
      ?.namedChildren.find((child) => child.type === 'string');
    if (route && routePath) {
      findings.push(
        toFinding(input, node, 'api', routePath.text.replace(/^['"]|['"]$/gu, ''), {
          method: route[1]?.toUpperCase(),
        }),
      );
    }
    if (['describe', 'it', 'test', 'suite'].includes(simpleName)) {
      const args = node.namedChildren.find((child) => child.type === 'arguments');
      const title = args?.namedChildren.find((child) => child.type === 'string')?.text;
      if (title) {
        findings.push(
          toFinding(input, node, 'test', title.replace(/^['"`]|['"`]$/gu, ''), {
            frameworkFunction: simpleName,
          }),
        );
      }
    }
  }

  if (
    (node.type === 'class_heritage' &&
      !node.namedChildren.some(
        (child) => child.type === 'extends_clause' || child.type === 'implements_clause',
      )) ||
    node.type === 'extends_clause' ||
    node.type === 'implements_clause'
  ) {
    const target = node.namedChildren.at(-1)?.text;
    if (target) {
      findings.push(
        toFinding(input, node, 'inheritance', target, {
          sourceName: parentClassName(node),
          relationKind: node.type === 'implements_clause' ? 'implements' : 'inherits',
        }),
      );
    }
  }

  for (const child of node.namedChildren) visit(child, input, findings, issues, symbolNodeIds);
}

export function parseSource(input: AnalyzerInput): AnalyzerOutput {
  const language = languageFor(input.path);
  if (!language) {
    return {
      findings: [],
      issues: [
        {
          path: input.path,
          code: 'unsupported_language',
          message: 'This file extension is not supported by the JavaScript/TypeScript analyzer.',
        },
      ],
    };
  }
  if (Buffer.byteLength(input.content, 'utf8') > MAX_SOURCE_BYTES) {
    return {
      findings: [],
      issues: [
        {
          path: input.path,
          code: 'file_too_large',
          message: 'The source file exceeds the configured analysis size limit.',
        },
      ],
    };
  }

  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(input.content);
  const extension = input.path.slice(input.path.lastIndexOf('.')).toLowerCase();
  const query = extension === '.tsx'
    ? SYMBOL_QUERY_FILES.tsx
    : ['.ts', '.mts', '.cts'].includes(extension)
      ? SYMBOL_QUERY_FILES.typescript
      : SYMBOL_QUERY_FILES.javascript;
  const symbolNodeIds = new Set(
    new Parser.Query(language, query).captures(tree.rootNode)
      .filter(({ name }) => name === 'symbol')
      .map(({ node }) => node.id),
  );
  const findings: ExtractedFinding[] = [];
  const issues: ParseIssue[] = [];
  visit(tree.rootNode, input, findings, issues, symbolNodeIds);
  return { findings, issues };
}

export const javascriptTypeScriptAnalyzer = {
  key: 'javascript-typescript-tree-sitter-0.23',
  supports: (path: string): boolean => languageFor(path) !== undefined,
  analyze: parseSource,
};
