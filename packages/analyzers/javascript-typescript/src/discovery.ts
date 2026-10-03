import { lstat, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.next',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'vendor',
]);
const GENERATED_NAME = /(?:\.min\.|\.generated\.|\.g\.|\/generated\/|\/__generated__\/)/iu;
const BINARY_EXTENSION =
  /\.(?:7z|avif|bmp|class|dll|dylib|exe|gif|gz|ico|jar|jpeg|jpg|lockb|mp3|mp4|o|pdf|png|so|tar|wasm|webp|woff2?|zip)$/iu;

export interface DiscoveredDirectory {
  readonly path: string;
  readonly disposition: 'included' | 'excluded';
  readonly exclusionReason?: string;
}

export interface DiscoveredFile {
  readonly path: string;
  readonly sizeBytes: number;
  readonly fileKind:
    'source' | 'test' | 'configuration' | 'generated' | 'vendored' | 'binary' | 'other';
}

export interface RepositoryDiscovery {
  readonly directories: readonly DiscoveredDirectory[];
  readonly files: readonly DiscoveredFile[];
}

function normalizeRelativePath(path: string): string {
  const normalized = path.split(sep).join('/');
  if (normalized === '') return '.';
  if (normalized.startsWith('../') || normalized === '..' || normalized.startsWith('/')) {
    throw new Error('Repository paths must remain relative to the snapshot root.');
  }
  return normalized.replace(/\/+/gu, '/').replace(/\/$/u, '') || '.';
}

function fileKind(path: string): DiscoveredFile['fileKind'] {
  if (GENERATED_NAME.test(`/${path}`)) return 'generated';
  if (BINARY_EXTENSION.test(path)) return 'binary';
  if (/\.test\.[cm]?[jt]sx?$/iu.test(path) || /(?:^|\/)__tests__(?:\/|$)/u.test(path))
    return 'test';
  if (
    /(?:^|\/)(?:package\.json|tsconfig[^/]*\.json|pnpm-workspace\.yaml|[^/]*\.config\.[cm]?[jt]s)$/u.test(
      path,
    )
  ) {
    return 'configuration';
  }
  return /\.(?:[cm]?[jt]sx?|json|ya?ml|toml|md|txt|html|css|sql)$/iu.test(path)
    ? 'source'
    : 'other';
}

export async function discoverRepository(rootPath: string): Promise<RepositoryDiscovery> {
  const directories: DiscoveredDirectory[] = [{ path: '.', disposition: 'included' }];
  const files: DiscoveredFile[] = [];

  async function walk(absoluteDirectory: string): Promise<void> {
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = join(absoluteDirectory, entry.name);
      const path = normalizeRelativePath(relative(rootPath, absolutePath));
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) {
          directories.push({
            path,
            disposition: 'excluded',
            exclusionReason: 'generated_or_vendor_directory',
          });
        } else {
          directories.push({ path, disposition: 'included' });
          await walk(absolutePath);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const details = await lstat(absolutePath);
      const kind = fileKind(path);
      files.push({
        path,
        sizeBytes: details.size,
        fileKind: kind,
      });
    }
  }

  await walk(rootPath);
  return { directories, files };
}
