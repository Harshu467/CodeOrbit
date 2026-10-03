export interface SourceSpan {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface ExtractedFinding {
  readonly kind: string;
  readonly name: string;
  readonly path: string;
  readonly span?: SourceSpan;
  readonly excerpt?: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface ParseIssue {
  readonly path: string;
  readonly code: 'syntax_error' | 'missing_node' | 'unsupported_language' | 'file_too_large';
  readonly message: string;
  readonly span?: SourceSpan;
}

export interface AnalyzerInput {
  readonly path: string;
  readonly content: string;
  readonly revision: string;
}

export interface AnalyzerOutput {
  readonly findings: readonly ExtractedFinding[];
  readonly issues: readonly ParseIssue[];
}

export interface LanguageAnalyzer {
  readonly key: string;
  supports(path: string): boolean;
  analyze(input: AnalyzerInput): AnalyzerOutput;
}
