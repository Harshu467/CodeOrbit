import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverRepository } from '../../packages/analyzers/javascript-typescript/src/discovery.js';
import { discoverProjects } from '../../packages/analyzers/javascript-typescript/src/projects.js';

describe('repository and project discovery', () => {
  let rootPath: string | undefined;

  afterEach(async () => {
    if (rootPath) await rm(rootPath, { recursive: true, force: true });
    rootPath = undefined;
  });

  it('normalizes paths and excludes generated and vendored files', async () => {
    rootPath = await mkdtemp(join(process.cwd(), 'codeorbit-discovery-'));
    await mkdir(join(rootPath, 'src'), { recursive: true });
    await mkdir(join(rootPath, 'node_modules', 'lib'), { recursive: true });
    await writeFile(join(rootPath, 'src', 'index.ts'), 'export const ok = true;');
    await writeFile(join(rootPath, 'node_modules', 'lib', 'index.js'), 'ignored();');
    const result = await discoverRepository(rootPath);

    expect(result.files.map(({ path }) => path)).toContain('src/index.ts');
    expect(result.files.map(({ path }) => path)).not.toContain('node_modules/lib/index.js');
    expect(result.directories.every(({ path }) => !path.startsWith('../'))).toBe(true);
  });

  it('discovers package dependencies and nested workspace projects', async () => {
    rootPath = await mkdtemp(join(process.cwd(), 'codeorbit-projects-'));
    await mkdir(join(rootPath, 'apps', 'web'), { recursive: true });
    await writeFile(
      join(rootPath, 'package.json'),
      JSON.stringify({
        name: 'root',
        workspaces: ['apps/*'],
        dependencies: { fastify: '^5.0.0' },
      }),
    );
    await writeFile(
      join(rootPath, 'apps', 'web', 'package.json'),
      JSON.stringify({ name: '@sample/web', dependencies: { react: '^19.0.0' } }),
    );
    const repository = await discoverRepository(rootPath);
    const projects = await discoverProjects(rootPath, repository.files);

    expect(projects.projects.map(({ path }) => path)).toEqual(
      expect.arrayContaining(['.', 'apps/web']),
    );
    expect(projects.dependencies.map(({ packageName }) => packageName)).toEqual(
      expect.arrayContaining(['fastify', 'react']),
    );
  });

  it('discovers project directories from TypeScript references', async () => {
    rootPath = await mkdtemp(join(process.cwd(), 'codeorbit-references-'));
    await mkdir(join(rootPath, 'packages', 'core'), { recursive: true });
    await writeFile(
      join(rootPath, 'tsconfig.json'),
      JSON.stringify({ references: [{ path: './packages/core/tsconfig.json' }] }),
    );
    await writeFile(
      join(rootPath, 'packages', 'core', 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { composite: true } }),
    );
    const repository = await discoverRepository(rootPath);
    const projects = await discoverProjects(rootPath, repository.files);

    expect(projects.projects.map(({ path }) => path)).toContain('packages/core');
  });
});
