import { describe, expect, it } from 'vitest';
import {
  createEvidenceExcerpt,
  locationAtByteOffset,
} from '../../packages/analyzers/javascript-typescript/src/evidence.js';

describe('source evidence', () => {
  it('converts UTF-8 byte offsets to one-based lines and Unicode code-point columns', () => {
    const source = '😀name\nnext';
    const offset = Buffer.byteLength('😀', 'utf8');
    expect(locationAtByteOffset(source, offset)).toEqual({ line: 1, column: 2 });
  });

  it('bounds and redacts excerpts without retaining full file content', () => {
    const excerpt = createEvidenceExcerpt(
      `const token = "${'a'.repeat(80)}";\n${'x'.repeat(700)}`,
      0,
      100,
    );
    expect(excerpt).not.toContain('a'.repeat(80));
    expect([...excerpt].length).toBeLessThanOrEqual(500);
    expect(excerpt).toContain('[REDACTED]');
  });
});
