import type { SourceSpan } from '@codeorbit/analyzer-contracts';

export interface SourceLocation {
  readonly line: number;
  readonly column: number;
}

export function locationAtByteOffset(source: string, byteOffset: number): SourceLocation {
  const bytes = Buffer.from(source, 'utf8');
  const boundedOffset = Math.max(0, Math.min(bytes.length, byteOffset));
  const prefix = bytes.subarray(0, boundedOffset).toString('utf8');
  const lastNewline = prefix.lastIndexOf('\n');
  return {
    line: prefix.split('\n').length,
    column: Array.from(prefix.slice(lastNewline + 1)).length + 1,
  };
}

export function spanAtByteOffsets(
  source: string,
  startByteOffset: number,
  endByteOffset: number,
): SourceSpan {
  const start = locationAtByteOffset(source, startByteOffset);
  const end = locationAtByteOffset(source, endByteOffset);
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

export function createEvidenceExcerpt(
  source: string,
  startByteOffset: number,
  endByteOffset: number,
): string {
  const bytes = Buffer.from(source, 'utf8');
  const start = Math.max(0, Math.min(bytes.length, startByteOffset));
  const end = Math.max(start, Math.min(bytes.length, endByteOffset));
  const startLocation = locationAtByteOffset(source, start);
  const endLocation = locationAtByteOffset(source, end);
  const lines = source.split(/\r?\n/u);
  const excerpt = lines
    .slice(Math.max(0, startLocation.line - 2), Math.min(lines.length, endLocation.line + 1))
    .join('\n')
    .replace(
      /((?:token|secret|password|private[_-]?key|authorization)\s*[:=]\s*)(["']?)[^\s"'`,;]+/giu,
      '$1[REDACTED]',
    )
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gu, '[REDACTED]');
  return Array.from(excerpt).slice(0, 500).join('');
}
