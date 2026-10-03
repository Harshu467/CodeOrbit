import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { AnalyzerInput, ExtractedFinding, ParseIssue } from '@codeorbit/analyzer-contracts';
import type { SourceProvider, RepositorySnapshot } from '@codeorbit/source-provider-contracts';
import {
  discoverProjects,
  discoverRepository,
  extractRelationships,
  javascriptTypeScriptAnalyzer,
} from '@codeorbit/javascript-typescript-analyzer';
import type {
  ProjectDiscovery,
  RepositoryDiscovery,
  ExtractedRelationship,
} from '@codeorbit/javascript-typescript-analyzer';
import { getPool, persistSystemModel } from '@codeorbit/persistence';
import type {
  SystemModelData,
  SystemModelEvidence,
  SystemModelFile,
  SystemModelIssue,
  SystemModelRelationship,
  SystemModelSymbol,
} from '@codeorbit/persistence';
import type { ClaimedJob } from '@codeorbit/persistence';
import type { RunExecutionContext, RunExecutionOutcome, RunExecutor } from './runner.js';
import { recordOversizedPartial } from './observability/metrics.js';

interface RunSourceRow {
  readonly connection_id: string;
  readonly external_repository_id: string;
  readonly snapshot_revision: string;
}

interface ParsedFile {
  readonly path: string;
  readonly content: string;
  readonly findings: readonly ExtractedFinding[];
  readonly issues: readonly ParseIssue[];
}

const MAX_SOURCE_LINES = 1_000_000;

function languageFromPath(path: string): string | undefined {
  const extension = extname(path).toLowerCase();
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) return 'javascript';
  if (extension === '.tsx') return 'tsx';
  if (['.ts', '.mts', '.cts'].includes(extension)) return 'typescript';
  return undefined;
}

function projectForFile(path: string, projects: ProjectDiscovery['projects']): string | undefined {
  return [...projects]
    .filter((project) => project.path === '.' || path.startsWith(`${project.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0]?.path;
}

function symbolKey(finding: ExtractedFinding): string | undefined {
  if (!finding.span) return undefined;
  return `${finding.path}:${finding.name}:${finding.span.startLine}:${finding.span.startColumn}`;
}

function toSystemIssue(issue: ParseIssue, stageName: string): SystemModelIssue {
  return {
    severity: issue.code === 'unsupported_language' ? 'info' : 'warning',
    code: issue.code,
    message: issue.message,
    scope: 'file',
    filePath: issue.path,
    stageName,
  };
}

function makeModel(
  discovery: RepositoryDiscovery,
  projects: ProjectDiscovery,
  parsedFiles: readonly ParsedFile[],
  revision: string,
  discoveryIssues: readonly SystemModelIssue[],
  relationships: readonly ExtractedRelationship[],
): SystemModelData {
  const modelFiles: SystemModelFile[] = discovery.files.map((file) => {
    const parsed = parsedFiles.find((item) => item.path === file.path);
    const supported = javascriptTypeScriptAnalyzer.supports(file.path);
    const status = parsed
      ? parsed.issues.length > 0
        ? 'partial'
        : 'parsed'
      : file.fileKind === 'generated' || file.fileKind === 'vendored'
        ? 'skipped'
        : supported
          ? 'discovered'
          : file.fileKind === 'source'
            ? 'unsupported'
            : 'skipped';
    return {
      path: file.path,
      sizeBytes: file.sizeBytes,
      fileKind: file.fileKind,
      status,
      ...(languageFromPath(file.path) ? { language: languageFromPath(file.path)! } : {}),
      ...(parsed?.issues[0] ? { issueSummary: parsed.issues[0].code } : {}),
    };
  });
  const allFindings = parsedFiles.flatMap(({ findings }) => findings);
  const findingKeys = new Map<ExtractedFinding, string>();
  allFindings.forEach((finding, index) => findingKeys.set(finding, `finding-${index}`));

  const evidence: SystemModelEvidence[] = allFindings.flatMap((finding) => {
    const key = findingKeys.get(finding);
    if (!key) return [];
    return [
      {
        key,
        filePath: finding.path,
        revision,
        ...(finding.span ? { span: finding.span } : {}),
        ...(finding.excerpt ? { excerpt: finding.excerpt } : {}),
        factKind: finding.kind,
      },
    ];
  });
  const dependencyEvidence = projects.dependencies.map((dependency, index) => ({
    key: `dependency-${index}`,
    filePath: dependency.manifestPath,
    revision,
    factKind: 'dependency',
  }));

  const exportedNames = new Set(
    allFindings.filter(({ kind }) => kind === 'export').map(({ path, name }) => `${path}:${name}`),
  );
  const symbols: SystemModelSymbol[] = allFindings.flatMap((finding) => {
    const key = symbolKey(finding);
    if (finding.kind !== 'symbol' || !finding.span || !key) return [];
    return [
      {
        key,
        filePath: finding.path,
        name: finding.name,
        kind:
          typeof finding.attributes?.symbolKind === 'string'
            ? finding.attributes.symbolKind
            : 'other',
        span: finding.span,
        exported: exportedNames.has(`${finding.path}:${finding.name}`),
        isTest: modelFiles.find(({ path }) => path === finding.path)?.fileKind === 'test',
      },
    ];
  });
  const apis = allFindings.flatMap((finding) => {
    const evidenceKey = findingKeys.get(finding);
    if (finding.kind !== 'api' || !finding.span || !evidenceKey) return [];
    return [
      {
        name: finding.name,
        kind: 'route',
        filePath: finding.path,
        ...(projectForFile(finding.path, projects.projects)
          ? { projectPath: projectForFile(finding.path, projects.projects)! }
          : {}),
        span: finding.span,
        evidenceKey,
      },
    ];
  });
  const tests: SystemModelData['tests'][number][] = [];
  for (const file of modelFiles.filter(({ fileKind }) => fileKind === 'test')) {
    tests.push({
      filePath: file.path,
      name: file.path,
      kind: 'test_file',
      resolution: 'observed',
    });
  }
  for (const finding of allFindings.filter(({ kind }) => kind === 'test')) {
    const evidenceKey = findingKeys.get(finding);
    tests.push({
      filePath: finding.path,
      name: finding.name,
      kind:
        finding.attributes?.frameworkFunction === 'describe' ||
        finding.attributes?.frameworkFunction === 'suite'
          ? 'suite'
          : 'case',
      resolution: 'observed',
      ...(finding.span ? { span: finding.span } : {}),
      ...(evidenceKey ? { evidenceKey } : {}),
    });
  }

  const parserIssues = parsedFiles.flatMap(({ issues }) =>
    issues.map((issue) => toSystemIssue(issue, 'parsing')),
  );
  const projectIssues: SystemModelIssue[] = projects.projects
    .filter(({ status }) => status !== 'complete')
    .map((project) => ({
      severity: 'warning',
      code: 'project_scope_unresolved',
      message: 'Project membership could not be determined conclusively.',
      scope: 'project',
      ...(project.manifestPath ? { filePath: project.manifestPath } : {}),
      stageName: 'symbol_extraction',
    }));
  const systemRelationships: SystemModelRelationship[] = relationships.flatMap((relationship) => {
    const evidenceKey = findingKeys.get(relationship.evidence);
    if (!evidenceKey) return [];
    return [
      {
        type: relationship.type,
        sourceName: relationship.sourceName,
        sourcePath: relationship.evidence.path,
        targetName: relationship.targetName,
        ...(relationship.targetPath ? { targetPath: relationship.targetPath } : {}),
        resolution: relationship.resolution,
        evidenceKey,
      },
    ];
  });

  return {
    directories: discovery.directories,
    projects: projects.projects,
    files: modelFiles,
    symbols,
    apis,
    tests,
    dependencies: projects.dependencies.map((dependency, index) => ({
      ...dependency,
      evidenceKey: `dependency-${index}`,
    })),
    relationships: systemRelationships,
    evidence: [...evidence, ...dependencyEvidence],
    issues: [...discoveryIssues, ...parserIssues, ...projectIssues],
  };
}

export class AnalysisPipeline implements RunExecutor {
  constructor(
    private readonly provider: Pick<SourceProvider, 'acquireSnapshot'>,
    private readonly pool = getPool(),
  ) {}

  async execute(job: ClaimedJob, context: RunExecutionContext): Promise<RunExecutionOutcome> {
    let snapshot: RepositorySnapshot | undefined;
    try {
      const source = await context.runStage('acquisition', async () => {
        const result = await this.pool.query<RunSourceRow>(
          `SELECT c.external_connection_id AS connection_id,
                  b.external_repository_id, r.snapshot_revision
           FROM analysis_runs r
           JOIN source_bindings b
             ON b.workspace_id = r.workspace_id AND b.id = r.source_binding_id
           JOIN source_connections c
             ON c.workspace_id = b.workspace_id AND c.id = b.connection_id
           WHERE r.workspace_id = $1 AND r.id = $2`,
          [job.workspaceId, job.runId],
        );
        const row = result.rows[0];
        if (!row?.snapshot_revision) {
          throw new Error('The queued run is missing its pinned source revision.');
        }
        snapshot = await this.provider.acquireSnapshot(
          row.connection_id,
          row.external_repository_id,
          { requestedRevision: null, snapshotRevision: row.snapshot_revision },
        );
        if (snapshot.revision.snapshotRevision !== row.snapshot_revision) {
          throw new Error('The provider returned a snapshot different from the pinned revision.');
        }
        return row;
      });

      const { discovery, projects } = await context.runStage('file_discovery', async () => {
        const result = await discoverRepository(snapshot!.rootPath);
        const projectResults = await discoverProjects(snapshot!.rootPath, result.files);
        await context.updateProgress('file_discovery', result.files.length, result.files.length);
        return { discovery: result, projects: projectResults };
      });
      const { files: supportedFiles, discoveryIssues } = await context.runStage(
        'language_detection',
        async () => {
          const files = discovery.files.filter(
            ({ path, fileKind }) =>
              fileKind !== 'generated' &&
              fileKind !== 'vendored' &&
              javascriptTypeScriptAnalyzer.supports(path),
          );
          await context.updateProgress('language_detection', files.length, discovery.files.length);
          const unsupported = discovery.files
            .filter(({ fileKind }) => fileKind === 'source')
            .filter(({ path }) => !javascriptTypeScriptAnalyzer.supports(path))
            .map(({ path }) => ({
              severity: 'info' as const,
              code: 'unsupported_language',
              message: 'This file is visible but is not supported by the configured analyzer.',
              scope: 'file' as const,
              filePath: path,
              stageName: 'language_detection',
            }));
          return { files, discoveryIssues: unsupported };
        },
      );

      const parsedFiles = await context.runStage('parsing', async () => {
        const parsed: ParsedFile[] = [];
        let sourceLines = 0;
        for (const [index, file] of supportedFiles.entries()) {
          await context.assertLeaseCurrent();
          const content = await readFile(join(snapshot!.rootPath, file.path), 'utf8');
          const currentLines =
            content.length === 0
              ? 0
              : content.split(/\r\n|[\r\n]/u).length - (/(?:\r\n|[\r\n])$/u.test(content) ? 1 : 0);
          if (sourceLines + currentLines > MAX_SOURCE_LINES) {
            parsed.push({
              path: file.path,
              content: '',
              findings: [],
              issues: [
                {
                  path: file.path,
                  code: 'file_too_large',
                  message: 'The configured one-million-source-line repository limit was reached.',
                },
              ],
            });
            await context.updateProgress('parsing', index + 1, supportedFiles.length);
            continue;
          }
          sourceLines += currentLines;
          const input: AnalyzerInput = {
            path: file.path,
            content,
            revision: source.snapshot_revision,
          };
          const output = javascriptTypeScriptAnalyzer.analyze(input);
          parsed.push({ path: file.path, content, ...output });
          await context.updateProgress('parsing', index + 1, supportedFiles.length);
        }
        return parsed;
      });
      if (parsedFiles.some(({ issues }) => issues.some(({ code }) => code === 'file_too_large'))) {
        recordOversizedPartial();
      }

      const modelFindings = await context.runStage('symbol_extraction', async () => {
        return parsedFiles.flatMap(({ findings }) => findings);
      });
      const model = await context.runStage('relationship_extraction', async () => {
        const knownFiles = discovery.files.map(({ path }) => ({
          path,
          symbols: modelFindings
            .filter((finding) => finding.kind === 'symbol' && finding.path === path)
            .map(({ name }) => name),
        }));
        const relationships = extractRelationships(modelFindings, knownFiles);
        return makeModel(
          discovery,
          projects,
          parsedFiles,
          source.snapshot_revision,
          discoveryIssues,
          relationships,
        );
      });
      await context.runStage('persistence', async () => {
        try {
          await persistSystemModel(this.pool, job.workspaceId, job.runId, model);
        } finally {
          if (snapshot) {
            const acquiredSnapshot = snapshot;
            snapshot = undefined;
            await acquiredSnapshot.cleanup();
          }
        }
      });

      const usefulResults =
        model.projects.length > 0 &&
        model.files.length > 0 &&
        (model.symbols.length > 0 ||
          model.dependencies.length > 0 ||
          model.relationships.length > 0 ||
          model.apis.length > 0);
      return {
        usefulResults,
        itemIssues: model.issues.length > 0,
        ...(!usefulResults
          ? { errorSummary: 'Analysis completed without useful source model results.' }
          : {}),
      };
    } finally {
      if (snapshot) await snapshot.cleanup();
    }
  }
}
