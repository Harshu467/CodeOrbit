import { describe, expect, it } from 'vitest';
import { parseSource } from '../../packages/analyzers/javascript-typescript/src/parser.js';
import { extractRelationships } from '../../packages/analyzers/javascript-typescript/src/extract-relationships.js';

describe('relationship resolution', () => {
  it('marks locally resolved calls and imports observed, leaving dynamic calls unresolved', () => {
    const findings = parseSource({
      path: 'src/main.js',
      revision: 'revision-1',
      content: "import { run } from './service.js';\nfunction start() { run(); target(); }",
    }).findings;
    const relationships = extractRelationships(findings, [
      { path: 'src/service.js', symbols: ['run'] },
    ]);

    expect(relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'imports', resolution: 'observed' }),
        expect.objectContaining({ type: 'calls', targetName: 'run', resolution: 'observed' }),
        expect.objectContaining({ type: 'calls', targetName: 'target', resolution: 'unresolved' }),
      ]),
    );
  });
});
