import { readFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import type { DiscoveredFile } from './discovery.js';

export interface DiscoveredProject {
  readonly path: string;
  readonly name: string;
  readonly manifestPath?: string;
  readonly manifestType?: string;
  readonly discoveryBasis: 'manifest' | 'structure';
  readonly status: 'complete' | 'partial' | 'unresolved';
}

export interface DeclaredDependency {
  readonly projectPath: string;
  readonly packageName: string;
  readonly versionConstraint: string;
  readonly manifestPath: string;
  readonly targetProjectPath?: string;
}

export interface ProjectDiscovery {
  readonly projects: readonly DiscoveredProject[];
  readonly dependencies: readonly DeclaredDependency[];
}

interface PackageManifest {
  readonly name?: unknown;
  readonly dependencies?: unknown;
  readonly devDependencies?: unknown;
  readonly peerDependencies?: unknown;
  readonly optionalDependencies?: unknown;
  readonly workspaces?: unknown;
}

interface TypeScriptConfig {
  readonly references?: readonly { readonly path?: unknown }[];
}

function toProjectPath(path: string): string {
  const normalized = normalize(path).split(sep).join('/');
  return normalized === '' ? '.' : normalized.replace(/\/$/u, '') || '.';
}

function readWorkspacePatterns(content: string): string[] {
  const match = content.match(/workspaces:\s*\[([\s\S]*?)\]/u);
  if (match?.[1]) {
    return Array.from(match[1].matchAll(/['"]([^'"]+)['"]/gu), (item) => item[1] ?? '');
  }
  return Array.from(
    content.matchAll(/^\s*-\s*['"]?([^'"\s#]+)['"]?\s*$/gmu),
    (item) => item[1] ?? '',
  );
}

function matchesWorkspacePattern(projectPath: string, pattern: string): boolean {
  const regex = new RegExp(
    `^${pattern
      .replace(/[.+?^${}()|[\]\\]/gu, '\\$&')
      .replace(/\*\*/gu, '.*')
      .replace(/\*/gu, '[^/]+')}$`,
    'u',
  );
  return regex.test(projectPath);
}

export async function discoverProjects(
  rootPath: string,
  files: readonly DiscoveredFile[],
): Promise<ProjectDiscovery> {
  const manifestPaths = files
    .filter(({ path }) => /(?:^|\/)package\.json$/u.test(path))
    .map(({ path }) => path);
  const manifests = await Promise.all(
    manifestPaths.map(async (manifestPath) => ({
      manifestPath,
      manifest: JSON.parse(await readFile(join(rootPath, manifestPath), 'utf8')) as PackageManifest,
    })),
  );
  const workspaceFiles = files.filter(({ path }) => path === 'pnpm-workspace.yaml');
  const workspacePatterns = workspaceFiles.length
    ? readWorkspacePatterns(await readFile(join(rootPath, 'pnpm-workspace.yaml'), 'utf8'))
    : [];
  const rootManifest = manifests.find(
    ({ manifestPath }) => dirname(manifestPath) === '.',
  )?.manifest;
  const declaredWorkspacePatterns = Array.isArray(rootManifest?.workspaces)
    ? rootManifest.workspaces.filter((pattern): pattern is string => typeof pattern === 'string')
    : rootManifest?.workspaces &&
        typeof rootManifest.workspaces === 'object' &&
        'packages' in rootManifest.workspaces &&
        Array.isArray(rootManifest.workspaces.packages)
      ? rootManifest.workspaces.packages.filter(
          (pattern): pattern is string => typeof pattern === 'string',
        )
      : [];
  workspacePatterns.push(...declaredWorkspacePatterns);
  const projectDirs = new Set(manifests.map(({ manifestPath }) => dirname(manifestPath)));
  const configPaths = files.filter(({ path }) => /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/u.test(path));
  const configs = await Promise.all(
    configPaths.map(async ({ path }) => ({
      path,
      config: JSON.parse(await readFile(join(rootPath, path), 'utf8')) as TypeScriptConfig,
    })),
  );
  const referenceDependencies: DeclaredDependency[] = [];
  for (const { path, config } of configs) {
    const configDirectory = dirname(path);
    projectDirs.add(configDirectory);
    for (const reference of config.references ?? []) {
      if (typeof reference.path !== 'string') continue;
      const referenceSpecifier = reference.path.replace(/(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/u, '');
      const referencePath = toProjectPath(join(configDirectory, referenceSpecifier || '.'));
      if (referencePath === '..' || referencePath.startsWith('../')) continue;
      projectDirs.add(referencePath);
      referenceDependencies.push({
        projectPath: toProjectPath(configDirectory),
        packageName: referencePath,
        versionConstraint: 'project-reference',
        manifestPath: path,
        targetProjectPath: referencePath,
      });
    }
  }
  const projects: DiscoveredProject[] = [...projectDirs].map((projectPath) => {
    const manifest = manifests.find(({ manifestPath }) => dirname(manifestPath) === projectPath);
    const config = configs.find(({ path }) => dirname(path) === projectPath);
    const manifestPath = manifest?.manifestPath ?? config?.path;
    const projectLocation = toProjectPath(projectPath);
    const explicitlyReferenced = referenceDependencies.some(
      ({ targetProjectPath }) => targetProjectPath === projectLocation,
    );
    const workspaceMember =
      projectLocation === '.' ||
      explicitlyReferenced ||
      workspacePatterns.some((pattern) => matchesWorkspacePattern(projectLocation, pattern));
    return {
      path: projectLocation,
      name: typeof manifest?.manifest.name === 'string' ? manifest.manifest.name : projectLocation,
      ...(manifestPath ? { manifestPath } : {}),
      ...(manifest
        ? { manifestType: 'package.json' }
        : config
          ? { manifestType: 'tsconfig.json' }
          : {}),
      discoveryBasis: manifest || config ? 'manifest' : 'structure',
      status: workspacePatterns.length > 0 && !workspaceMember ? 'partial' : 'complete',
    };
  });
  if (projects.length === 0) {
    projects.push({
      path: '.',
      name: 'repository',
      discoveryBasis: 'structure',
      status: 'unresolved',
    });
  }
  const dependencies: DeclaredDependency[] = [...referenceDependencies];
  const projectPathsByName = new Map<string, string[]>();
  for (const project of projects) {
    const paths = projectPathsByName.get(project.name) ?? [];
    paths.push(project.path);
    projectPathsByName.set(project.name, paths);
  }
  for (const { manifestPath, manifest } of manifests) {
    const projectPath = toProjectPath(dirname(manifestPath));
    for (const category of [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.peerDependencies,
      manifest.optionalDependencies,
    ]) {
      if (!category || typeof category !== 'object' || Array.isArray(category)) continue;
      for (const [packageName, version] of Object.entries(category)) {
        if (typeof version === 'string') {
          const internalPaths = projectPathsByName.get(packageName) ?? [];
          dependencies.push({
            projectPath,
            packageName,
            versionConstraint: version,
            manifestPath,
            ...(internalPaths.length === 1 ? { targetProjectPath: internalPaths[0] } : {}),
          });
        }
      }
    }
  }
  return { projects, dependencies };
}
