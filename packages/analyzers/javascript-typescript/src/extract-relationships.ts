import type { ExtractedFinding } from '@codeorbit/analyzer-contracts';
import { dirname, join, posix } from 'node:path';

export interface KnownSourceFile {
  readonly path: string;
  readonly symbols: readonly string[];
}

export interface ExtractedRelationship {
  readonly type: 'imports' | 'calls' | 'inherits' | 'implements' | 'exposes_api';
  readonly sourceName: string;
  readonly targetName: string;
  readonly targetPath?: string;
  readonly resolution: 'observed' | 'inferred' | 'unresolved';
  readonly evidence: ExtractedFinding;
}

function importedPath(sourcePath: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const resolved = posix.normalize(join(dirname(sourcePath), specifier));
  return resolved.replace(/^\.\//u, '');
}

function matchingFile(
  candidate: string | undefined,
  knownFiles: readonly KnownSourceFile[],
): string | undefined {
  if (!candidate) return undefined;
  const candidates = [candidate];
  if (candidate.endsWith('.js'))
    candidates.push(candidate.slice(0, -3) + '.ts', candidate.slice(0, -3) + '.tsx');
  if (candidate.endsWith('.jsx')) candidates.push(candidate.slice(0, -4) + '.tsx');
  if (candidate.endsWith('.mjs')) candidates.push(candidate.slice(0, -4) + '.mts');
  if (candidate.endsWith('.cjs')) candidates.push(candidate.slice(0, -4) + '.cts');
  const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
  return knownFiles.find(
    ({ path }) =>
      candidates.includes(path) ||
      candidates.some((entry) =>
        extensions.some(
          (extension) => path === `${entry}${extension}` || path === `${entry}/index${extension}`,
        ),
      ),
  )?.path;
}

export function extractRelationships(
  findings: readonly ExtractedFinding[],
  knownFiles: readonly KnownSourceFile[] = [],
): ExtractedRelationship[] {
  const knownSymbols = new Map<string, string[]>();
  for (const file of knownFiles) {
    for (const name of file.symbols) {
      const paths = knownSymbols.get(name) ?? [];
      paths.push(file.path);
      knownSymbols.set(name, paths);
    }
  }
  const relationships: ExtractedRelationship[] = [];
  for (const evidence of findings) {
    const attrs = evidence.attributes ?? {};
    if (evidence.kind === 'import') {
      if (!evidence.name.startsWith('.')) continue;
      const targetPath = matchingFile(importedPath(evidence.path, evidence.name), knownFiles);
      relationships.push({
        type: 'imports',
        sourceName: evidence.path,
        targetName: evidence.name,
        ...(targetPath ? { targetPath } : {}),
        resolution: targetPath ? 'observed' : 'unresolved',
        evidence,
      });
    } else if (evidence.kind === 'call') {
      const name = evidence.name;
      const findingIsApiOrTest = findings.some(
        (finding) =>
          (finding.kind === 'api' || finding.kind === 'test') &&
          finding.path === evidence.path &&
          finding.span?.startLine === evidence.span?.startLine &&
          finding.span?.startColumn === evidence.span?.startColumn,
      );
      if (findingIsApiOrTest) continue;
      const expression = typeof attrs.expression === 'string' ? attrs.expression : name;
      const matchingImport = findings.find((finding) => {
        if (finding.kind !== 'import') return false;
        const names = finding.attributes?.importedNames;
        return Array.isArray(names) && names.includes(name);
      });
      const importedSpecifier =
        typeof matchingImport?.attributes?.source === 'string'
          ? matchingImport.attributes.source.replace(/^['"]|['"]$/gu, '')
          : undefined;
      const importedModule = matchingFile(
        importedSpecifier ? importedPath(evidence.path, importedSpecifier) : undefined,
        knownFiles,
      );
      const candidates = importedModule
        ? (knownSymbols.get(name) ?? []).filter((path) => path === importedModule)
        : (knownSymbols.get(name) ?? []).filter((path) => path === evidence.path);
      const targetPath = candidates.length === 1 ? candidates[0] : undefined;
      relationships.push({
        type: 'calls',
        sourceName: typeof attrs.caller === 'string' ? attrs.caller : evidence.path,
        targetName: expression,
        ...(targetPath ? { targetPath } : {}),
        resolution: targetPath ? 'observed' : 'unresolved',
        evidence,
      });
    } else if (evidence.kind === 'inheritance') {
      const relation = attrs.relationKind === 'implements' ? 'implements' : 'inherits';
      const candidates = knownSymbols.get(evidence.name) ?? [];
      const targetPath = candidates.length === 1 ? candidates[0] : undefined;
      relationships.push({
        type: relation,
        sourceName: typeof attrs.sourceName === 'string' ? attrs.sourceName : 'unknown',
        targetName: evidence.name,
        ...(targetPath ? { targetPath } : {}),
        resolution: targetPath ? 'observed' : 'unresolved',
        evidence,
      });
    } else if (evidence.kind === 'api') {
      relationships.push({
        type: 'exposes_api',
        sourceName: evidence.path,
        targetName: evidence.name,
        resolution: 'observed',
        evidence,
      });
    }
  }
  return relationships;
}
