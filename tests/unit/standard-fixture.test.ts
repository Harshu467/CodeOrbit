import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  discoverProjects,
  discoverRepository,
  extractRelationships,
  javascriptTypeScriptAnalyzer,
} from '../../packages/analyzers/javascript-typescript/src/index.js';

describe('standard multi-package repository fixture', () => {
  it('matches its checked-in expected model counts', async () => {
    const rootPath = join(process.cwd(), 'tests/fixtures/repositories/standard');
    const expected = JSON.parse(await readFile(join(rootPath, 'expected.json'), 'utf8')) as {
      projects: number;
      files: number;
      symbols: number;
      apis: number;
      tests: number;
      relationships: { observed: number; unresolved: number };
    };
    const discovery = await discoverRepository(rootPath);
    const projects = await discoverProjects(rootPath, discovery.files);
    const findings = [];
    let testFiles = 0;
    for (const file of discovery.files) {
      if (file.fileKind === 'test') testFiles += 1;
      if (!javascriptTypeScriptAnalyzer.supports(file.path)) continue;
      const content = await readFile(join(rootPath, file.path), 'utf8');
      findings.push(
        ...javascriptTypeScriptAnalyzer.analyze({
          path: file.path,
          content,
          revision: 'fixture-revision',
        }).findings,
      );
    }
    const knownFiles = discovery.files.map(({ path }) => ({
      path,
      symbols: findings
        .filter((finding) => finding.kind === 'symbol' && finding.path === path)
        .map(({ name }) => name),
    }));
    const relationships = extractRelationships(findings, knownFiles);

    expect({
      projects: projects.projects.length,
      files: discovery.files.length,
      symbols: findings.filter(({ kind }) => kind === 'symbol').length,
      apis: findings.filter(({ kind }) => kind === 'api').length,
      tests: testFiles + findings.filter(({ kind }) => kind === 'test').length,
      relationships: {
        observed: relationships.filter(({ resolution }) => resolution === 'observed').length,
        unresolved: relationships.filter(({ resolution }) => resolution === 'unresolved').length,
      },
    }).toEqual(expected);
  });
});
