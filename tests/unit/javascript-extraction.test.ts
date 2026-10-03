import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/analyzers/javascript-typescript/src/parser.js';

describe('JavaScript extraction', () => {
  it('extracts declarations, imports, exports, calls, and inheritance with source spans', () => {
    const output = parseSource({
      path: 'src/service.js',
      revision: 'revision-1',
      content: [
        "import { base } from './base.js';",
        'export class Service extends Base {',
        '  run() { helper(); }',
        '}',
        'function helper() {}',
      ].join('\n'),
    });

    expect(output.findings.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining(['import', 'symbol', 'export', 'call', 'inheritance']),
    );
    expect(
      output.findings.find(({ kind, name }) => kind === 'symbol' && name === 'Service')?.span,
    ).toMatchObject({
      startLine: 2,
      startColumn: 8,
    });
  });

  it('returns syntax issues while preserving findings from recoverable source', () => {
    const output = parseSource({
      path: 'src/broken.js',
      revision: 'revision-1',
      content: 'function valid() {}\nfunction broken( {\n',
    });

    expect(output.findings.some(({ name }) => name === 'valid')).toBe(true);
    expect(
      output.issues.some(({ code }) => code === 'syntax_error' || code === 'missing_node'),
    ).toBe(true);
  });
});
