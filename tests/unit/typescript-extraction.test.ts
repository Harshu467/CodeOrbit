import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/analyzers/javascript-typescript/src/parser.js';

describe('TypeScript and TSX extraction', () => {
  it('extracts TypeScript declarations and converts Unicode columns to code points', () => {
    const output = parseSource({
      path: 'src/types.ts',
      revision: 'revision-1',
      content:
        'const face = "😀";\nexport interface User { name: string }\nexport type ID = string;',
    });

    expect(
      output.findings.find(({ kind, name }) => kind === 'symbol' && name === 'User')?.span
        ?.startLine,
    ).toBe(2);
    expect(
      output.findings.find(({ kind, name }) => kind === 'export' && name === 'User'),
    ).toBeTruthy();
  });

  it('parses TSX components and retains class and interface spans', () => {
    const output = parseSource({
      path: 'src/view.tsx',
      revision: 'revision-1',
      content:
        'export interface Props { value: string }\nexport function View(p: Props) { return <b>{p.value}</b>; }',
    });

    expect(output.findings.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['Props', 'View']),
    );
  });
});
