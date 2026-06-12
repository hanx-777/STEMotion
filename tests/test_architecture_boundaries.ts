import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

const v1Routes = [
  'src/app/api/v1/rag/ask/route.ts',
  'src/app/api/v1/rag/ask/stream/route.ts',
  'src/app/api/v1/rag/visualization/generate/route.ts',
  'src/app/api/v1/subjects/route.ts',
  'src/app/api/v1/subjects/default/route.ts',
  'src/app/api/v1/model-profiles/route.ts',
  'src/app/api/v1/model-profiles/[id]/route.ts',
  'src/app/api/v1/model-profiles/models/route.ts',
  'src/app/api/v1/deep-interaction/generate/route.ts',
  'src/app/api/v1/deep-interaction/planning/route.ts',
  'src/app/api/v1/deep-interaction/follow-up/route.ts',
  'src/app/api/v1/generation-jobs/route.ts',
  'src/app/api/v1/generation-jobs/[jobId]/route.ts',
  'src/app/api/v1/generation-jobs/[jobId]/events/route.ts',
  'src/app/api/v1/generation-jobs/[jobId]/cancel/route.ts',
];

test('v1 route handlers exist and delegate only to feature application services or platform proxies', async () => {
  for (const route of v1Routes) {
    const source = await readFile(join(root, route), 'utf-8');
    assert.match(
      source,
      /@\/features\/.+\/application\/|@\/platform\/api\/backendProxy/,
      `${route} should import a feature application service or platform backend proxy`,
    );
    assert.doesNotMatch(source, /@\/lib\//, `${route} must not import legacy lib modules directly`);
  }
});

test('client feature UI does not import server infrastructure', async () => {
  const source = await readFile(join(root, 'src/features/rag/ui/RagWorkbench.tsx'), 'utf-8');
  assert.match(source, /^'use client';/);
  assert.doesNotMatch(source, /@\/features\/rag\/infrastructure|@\/platform\/env|process\.env|fs\/promises|node:fs/);
});

test('all client modules avoid server-only runtime imports', async () => {
  const files = await listSourceFiles(join(root, 'src'));
  const clientFiles: string[] = [];

  for (const file of files) {
    const source = await readFile(file, 'utf-8');
    if (!/^['"]use client['"];?/m.test(source)) continue;
    clientFiles.push(file);

    const runtimeImports = source
      .split('\n')
      .filter((line) => /^\s*import\s+(?!type\b)/.test(line))
      .join('\n');

    assert.doesNotMatch(
      runtimeImports,
      /(?:from\s+['"](?:fs|fs\/promises|node:fs|node:fs\/promises)['"])|@\/lib\/generation\/llmClient|@\/lib\/generation\/modelProfiles|@\/lib\/deep-interaction\/agentWidgetPipeline|@\/lib\/rag\/visualization\/auditPipeline/,
      `${relativePath(file)} imports server-only infrastructure`,
    );
  }

  assert.ok(clientFiles.length > 0, 'expected at least one client module to be scanned');
});

test('default route redirects to student without loading legacy experiment workbench', async () => {
  const source = await readFile(join(root, 'src/app/page.tsx'), 'utf-8');

  assert.doesNotMatch(source, /^['"]use client['"];?/m, 'root route should be a server redirect page');
  assert.match(source, /next\/navigation/, 'root route should use Next App Router redirect');
  assert.match(source, /redirect\(['"]\/student['"]\)/, 'root route should redirect to /student');
  assert.doesNotMatch(
    source,
    /@\/components\/experiment|@\/lib\/stores\/experimentStore|@\/lib\/stores\/assistantStore|mockExperimentGenerator/,
    'root route must not import the deprecated experiment workbench',
  );
});

test('legacy generate and player routes redirect to current surfaces', async () => {
  const generateSource = await readFile(join(root, 'src/app/generate/page.tsx'), 'utf-8');
  const playerSource = await readFile(join(root, 'src/app/player/page.tsx'), 'utf-8');

  assert.doesNotMatch(generateSource, /export\s+\{\s*default\s*\}\s+from\s+['"]\.\.\/page['"]/, '/generate must not re-export the deprecated root page');
  assert.match(generateSource, /redirect\(['"]\/visualization['"]\)/, '/generate should redirect to /visualization');

  assert.doesNotMatch(playerSource, /export\s+\{\s*default\s*\}\s+from\s+['"]\.\.\/page['"]/, '/player must not re-export the deprecated root page');
  assert.match(playerSource, /redirect\(['"]\/interactions['"]\)/, '/player should redirect to /interactions');
});

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    if (/\.(ts|tsx)$/.test(entry.name)) return [path];
    return [];
  }));
  return files.flat();
}

function relativePath(path: string): string {
  return path.startsWith(root) ? path.slice(root.length + 1) : path;
}
