import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { redactSensitiveText } from '@codeorbit/domain/observability';
import { inTransaction } from './transaction.js';

export interface ModelSourceSpan {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface SystemModelDirectory {
  readonly path: string;
  readonly disposition: 'included' | 'excluded' | 'inaccessible';
  readonly exclusionReason?: string;
}

export interface SystemModelProject {
  readonly path: string;
  readonly name: string;
  readonly manifestPath?: string;
  readonly manifestType?: string;
  readonly discoveryBasis: 'manifest' | 'structure' | 'mixed';
  readonly status: 'complete' | 'partial' | 'unresolved';
}

export interface SystemModelFile {
  readonly path: string;
  readonly sizeBytes: number;
  readonly fileKind:
    'source' | 'test' | 'configuration' | 'generated' | 'vendored' | 'binary' | 'other';
  readonly status: 'discovered' | 'parsed' | 'partial' | 'unsupported' | 'skipped' | 'failed';
  readonly language?: string;
  readonly issueSummary?: string;
}

export interface SystemModelEvidence {
  readonly key: string;
  readonly filePath: string;
  readonly revision: string;
  readonly span?: ModelSourceSpan;
  readonly excerpt?: string;
  readonly factKind: string;
}

export interface SystemModelSymbol {
  readonly key: string;
  readonly filePath: string;
  readonly name: string;
  readonly qualifiedName?: string;
  readonly kind: string;
  readonly span: ModelSourceSpan;
  readonly exported?: boolean;
  readonly isTest?: boolean;
}

export interface SystemModelApi {
  readonly name: string;
  readonly kind: string;
  readonly filePath: string;
  readonly projectPath?: string;
  readonly symbolKey?: string;
  readonly span: ModelSourceSpan;
  readonly evidenceKey: string;
}

export interface SystemModelTest {
  readonly name: string;
  readonly kind: 'test_file' | 'suite' | 'case' | 'association';
  readonly filePath: string;
  readonly symbolKey?: string;
  readonly targetSymbolKey?: string;
  readonly resolution: 'observed' | 'inferred' | 'unresolved';
  readonly span?: ModelSourceSpan;
  readonly evidenceKey?: string;
}

export interface SystemModelDependency {
  readonly projectPath: string;
  readonly packageName: string;
  readonly versionConstraint: string;
  readonly manifestPath: string;
  readonly targetProjectPath?: string;
  readonly evidenceKey: string;
}

export interface SystemModelRelationship {
  readonly type:
    | 'imports'
    | 'calls'
    | 'inherits'
    | 'implements'
    | 'references'
    | 'depends_on'
    | 'exposes_api'
    | 'publishes_event'
    | 'consumes_event'
    | 'reads_data'
    | 'writes_data'
    | 'tests';
  readonly sourceName: string;
  readonly sourcePath: string;
  readonly targetName: string;
  readonly targetPath?: string;
  readonly resolution: 'observed' | 'inferred' | 'unresolved';
  readonly evidenceKey: string;
}

export interface SystemModelIssue {
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly scope: 'repository' | 'directory' | 'file' | 'project' | 'symbol' | 'relationship';
  readonly filePath?: string;
  readonly stageName?: string;
}

export interface SystemModelData {
  readonly directories: readonly SystemModelDirectory[];
  readonly projects: readonly SystemModelProject[];
  readonly files: readonly SystemModelFile[];
  readonly symbols: readonly SystemModelSymbol[];
  readonly apis: readonly SystemModelApi[];
  readonly tests: readonly SystemModelTest[];
  readonly dependencies: readonly SystemModelDependency[];
  readonly relationships: readonly SystemModelRelationship[];
  readonly evidence: readonly SystemModelEvidence[];
  readonly issues: readonly SystemModelIssue[];
}

export async function persistSystemModel(
  pool: pg.Pool,
  workspaceId: string,
  runId: string,
  model: SystemModelData,
): Promise<void> {
  await inTransaction(pool, async (client) => {
    const runResult = await client.query<{ snapshot_revision: string | null }>(
      `SELECT snapshot_revision FROM analysis_runs
       WHERE workspace_id = $1 AND id = $2 FOR UPDATE`,
      [workspaceId, runId],
    );
    const revision = runResult.rows[0]?.snapshot_revision;
    if (!revision) throw new Error('The analysis run has no immutable source revision.');

    await deleteRunModel(client, workspaceId, runId);

    const directoryIds = new Map<string, string>();
    for (const directory of [...model.directories].sort(
      (left, right) => left.path.split('/').length - right.path.split('/').length,
    )) {
      const id = randomUUID();
      const parentPath =
        directory.path === '.'
          ? undefined
          : directory.path.split('/').slice(0, -1).join('/') || '.';
      const parentId = parentPath ? directoryIds.get(parentPath) : undefined;
      await client.query(
        `INSERT INTO analysis_directories
           (id, workspace_id, run_id, path, parent_directory_id, disposition, exclusion_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          workspaceId,
          runId,
          directory.path,
          parentId ?? null,
          directory.disposition,
          directory.exclusionReason ?? null,
        ],
      );
      directoryIds.set(directory.path, id);
    }

    const projectIds = new Map<string, string>();
    for (const project of model.projects) {
      const id = randomUUID();
      await client.query(
        `INSERT INTO analysis_projects
           (id, workspace_id, run_id, name, path, manifest_path, manifest_type,
            discovery_basis, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id,
          workspaceId,
          runId,
          project.name,
          project.path,
          project.manifestPath ?? null,
          project.manifestType ?? null,
          project.discoveryBasis,
          project.status,
        ],
      );
      projectIds.set(project.path, id);
    }

    const fileIds = new Map<string, string>();
    const fileDirectories = new Map<string, string>();
    for (const file of model.files) {
      const id = randomUUID();
      const containingProjects = [...projectIds.keys()]
        .filter((path) => path === '.' || file.path.startsWith(`${path}/`))
        .sort((left, right) => right.length - left.length);
      const projectPath =
        containingProjects.length > 1 &&
        containingProjects[0]!.length === containingProjects[1]!.length
          ? undefined
          : containingProjects[0];
      const dirPath = file.path.includes('/')
        ? file.path.slice(0, file.path.lastIndexOf('/'))
        : '.';
      await client.query(
        `INSERT INTO analysis_files
           (id, workspace_id, run_id, path, directory_id, project_id, language,
            file_kind, size_bytes, status, issue_summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          workspaceId,
          runId,
          file.path,
          directoryIds.get(dirPath) ?? null,
          projectPath ? projectIds.get(projectPath) : null,
          file.language ?? null,
          file.fileKind,
          file.sizeBytes,
          file.status,
          file.issueSummary ?? null,
        ],
      );
      fileIds.set(file.path, id);
      fileDirectories.set(file.path, dirPath);
    }

    const evidenceIds = new Map<string, string>();
    for (const evidence of model.evidence) {
      const fileId = fileIds.get(evidence.filePath);
      if (!fileId)
        throw new Error(`Evidence references an unknown file path: ${evidence.filePath}`);
      if (evidence.revision !== revision) {
        throw new Error('Source evidence does not match the analysis run revision.');
      }
      if (evidenceIds.has(evidence.key)) throw new Error('Source evidence keys must be unique.');
      const id = randomUUID();
      await client.query(
        `INSERT INTO analysis_source_evidence
           (id, workspace_id, run_id, file_id, revision, start_line, start_column,
            end_line, end_column, excerpt, fact_kind)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          workspaceId,
          runId,
          fileId,
          revision,
          evidence.span?.startLine ?? null,
          evidence.span?.startColumn ?? null,
          evidence.span?.endLine ?? null,
          evidence.span?.endColumn ?? null,
          evidence.excerpt === undefined
            ? null
            : Array.from(redactSensitiveText(evidence.excerpt)).slice(0, 500).join(''),
          evidence.factKind,
        ],
      );
      evidenceIds.set(evidence.key, id);
    }

    const symbolIds = new Map<string, string>();
    for (const symbol of model.symbols) {
      const fileId = fileIds.get(symbol.filePath);
      if (!fileId) throw new Error(`Symbol references an unknown file path: ${symbol.filePath}`);
      const id = randomUUID();
      await client.query(
        `INSERT INTO analysis_symbols
           (id, workspace_id, run_id, file_id, name, qualified_name, kind,
            start_line, start_column, end_line, end_column, exported, is_test)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          workspaceId,
          runId,
          fileId,
          symbol.name,
          symbol.qualifiedName ?? null,
          symbol.kind,
          symbol.span.startLine,
          symbol.span.startColumn,
          symbol.span.endLine,
          symbol.span.endColumn,
          symbol.exported ?? null,
          symbol.isTest ?? null,
        ],
      );
      symbolIds.set(symbol.key, id);
    }

    const apiIdsByEvidence = new Map<string, string>();
    for (const api of model.apis) {
      const fileId = fileIds.get(api.filePath);
      const evidenceId = evidenceIds.get(api.evidenceKey);
      if (!fileId || !evidenceId) throw new Error('API finding is missing its file or evidence.');
      const id = randomUUID();
      const projectPath = api.projectPath ?? findProjectPath(api.filePath, projectIds);
      await client.query(
        `INSERT INTO analysis_apis
           (id, workspace_id, run_id, project_id, symbol_id, name, kind,
            exposure_basis, start_line, end_line, evidence_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'observed', $8, $9, $10)`,
        [
          id,
          workspaceId,
          runId,
          projectPath ? (projectIds.get(projectPath) ?? null) : null,
          api.symbolKey ? (symbolIds.get(api.symbolKey) ?? null) : null,
          api.name,
          api.kind,
          api.span.startLine,
          api.span.endLine,
          evidenceId,
        ],
      );
      apiIdsByEvidence.set(api.evidenceKey, id);
    }

    for (const test of model.tests) {
      const fileId = fileIds.get(test.filePath);
      const evidenceId = test.evidenceKey ? evidenceIds.get(test.evidenceKey) : undefined;
      if (!fileId)
        throw new Error(`Test finding references an unknown file path: ${test.filePath}`);
      await client.query(
        `INSERT INTO analysis_tests
           (id, workspace_id, run_id, file_id, symbol_id, name, kind, target_symbol_id,
            resolution, start_line, end_line, evidence_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          randomUUID(),
          workspaceId,
          runId,
          fileId,
          test.symbolKey ? (symbolIds.get(test.symbolKey) ?? null) : null,
          test.name,
          test.kind,
          test.targetSymbolKey ? (symbolIds.get(test.targetSymbolKey) ?? null) : null,
          test.resolution,
          test.span?.startLine ?? null,
          test.span?.endLine ?? null,
          evidenceId ?? null,
        ],
      );
    }

    for (const dependency of model.dependencies) {
      const sourceProjectId = projectIds.get(dependency.projectPath);
      if (!sourceProjectId) continue;
      const targetProjectId = dependency.targetProjectPath
        ? projectIds.get(dependency.targetProjectPath)
        : undefined;
      const evidenceId = evidenceIds.get(dependency.evidenceKey);
      if (!evidenceId) throw new Error('A declared dependency is missing its manifest evidence.');
      await client.query(
        `INSERT INTO analysis_dependencies
           (id, workspace_id, run_id, source_project_id, target_project_id,
            package_name, version_constraint, dependency_kind, resolution, evidence_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'observed', $9)`,
        [
          randomUUID(),
          workspaceId,
          runId,
          sourceProjectId,
          targetProjectId ?? null,
          dependency.packageName,
          dependency.versionConstraint,
          targetProjectId ? 'project' : 'package',
          evidenceId,
        ],
      );
    }

    for (const relationship of model.relationships) {
      const evidenceId = evidenceIds.get(relationship.evidenceKey);
      if (!evidenceId) throw new Error('Relationship is missing source evidence.');
      const sourceFileId = fileIds.get(relationship.sourcePath);
      const targetFileId = relationship.targetPath
        ? fileIds.get(relationship.targetPath)
        : undefined;
      const sourceSymbolId = model.symbols.find(
        ({ name, filePath }) =>
          name === relationship.sourceName && filePath === relationship.sourcePath,
      );
      const targetSymbolId = model.symbols.find(
        ({ name, filePath }) =>
          name === relationship.targetName &&
          relationship.targetPath !== undefined &&
          filePath === relationship.targetPath,
      );
      const targetApiId =
        relationship.type === 'exposes_api'
          ? apiIdsByEvidence.get(relationship.evidenceKey)
          : undefined;
      const sourceEntityType = sourceSymbolId ? 'symbol' : 'file';
      const sourceEntityId = sourceSymbolId ? symbolIds.get(sourceSymbolId.key) : sourceFileId;
      const targetEntityType = targetApiId ? 'api' : targetSymbolId ? 'symbol' : 'file';
      const targetEntityId =
        targetApiId ?? (targetSymbolId ? symbolIds.get(targetSymbolId.key) : targetFileId);
      const resolution =
        relationship.resolution === 'observed' && sourceEntityId && targetEntityId
          ? 'observed'
          : 'unresolved';
      await client.query(
        `INSERT INTO analysis_relationships
           (id, workspace_id, run_id, source_entity_type, source_entity_id,
            target_entity_type, target_entity_id, unresolved_target, type, resolution,
            evidence_id, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          randomUUID(),
          workspaceId,
          runId,
          sourceEntityType,
          sourceEntityId ?? null,
          targetEntityType,
          targetEntityId ?? null,
          targetEntityId ? null : relationship.targetName,
          relationship.type,
          resolution,
          evidenceId,
          relationship.targetName,
        ],
      );
    }

    for (const issue of model.issues) {
      const fileId = issue.filePath ? fileIds.get(issue.filePath) : undefined;
      if (issue.filePath && !fileId) {
        throw new Error(`Analysis issue references an unknown file path: ${issue.filePath}`);
      }
      if (!/^[A-Za-z0-9_.-]{1,128}$/u.test(issue.code)) {
        throw new Error('Analysis issue codes must be short identifiers.');
      }
      await client.query(
        `INSERT INTO analysis_issues
           (id, workspace_id, run_id, stage_name, file_id, severity, code, message, scope)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          workspaceId,
          runId,
          issue.stageName ?? null,
          fileId ?? null,
          issue.severity,
          issue.code,
          Array.from(redactSensitiveText(issue.message)).slice(0, 1000).join(''),
          issue.scope,
        ],
      );
    }

    if (fileDirectories.size !== model.files.length) {
      throw new Error('Not all discovered files were assigned to the persisted system model.');
    }
  });
}

function findProjectPath(
  filePath: string,
  projectIds: ReadonlyMap<string, string>,
): string | undefined {
  return [...projectIds.keys()]
    .filter((path) => path === '.' || filePath.startsWith(`${path}/`))
    .sort((left, right) => right.length - left.length)[0];
}

async function deleteRunModel(
  client: pg.PoolClient,
  workspaceId: string,
  runId: string,
): Promise<void> {
  for (const table of [
    'analysis_relationships',
    'analysis_dependencies',
    'analysis_tests',
    'analysis_apis',
    'analysis_symbols',
    'analysis_source_evidence',
    'analysis_issues',
    'analysis_files',
    'analysis_projects',
    'analysis_directories',
  ]) {
    await client.query(`DELETE FROM ${table} WHERE workspace_id = $1 AND run_id = $2`, [
      workspaceId,
      runId,
    ]);
  }
}
