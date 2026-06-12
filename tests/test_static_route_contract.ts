import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

const corePageRoutes = [
  { route: '/learn', file: 'src/app/learn/page.tsx' },
  { route: '/teach', file: 'src/app/teach/page.tsx' },
  { route: '/lab', file: 'src/app/lab/page.tsx' },
  { route: '/assets', file: 'src/app/assets/page.tsx' },
  { route: '/knowledge', file: 'src/app/knowledge/page.tsx' },
  { route: '/settings', file: 'src/app/settings/page.tsx' },
  { route: '/deep-interaction', file: 'src/app/deep-interaction/page.tsx' },
  { route: '/visualization', file: 'src/app/visualization/page.tsx' },
] as const;

const legacyRedirects = [
  { route: '/student', file: 'src/app/student/page.tsx', destination: '/learn' },
  { route: '/teacher', file: 'src/app/teacher/page.tsx', destination: '/teach' },
  { route: '/interactions', file: 'src/app/interactions/page.tsx', destination: '/assets' },
  { route: '/rag', file: 'src/app/rag/page.tsx', destination: '/learn' },
] as const;

const navTargets = ['/learn', '/teach', '/lab', '/assets', '/knowledge', '/settings'] as const;

test('core refactor milestone pages exist in the App Router', async () => {
  for (const item of corePageRoutes) {
    const stats = await stat(join(root, item.file));

    assert.ok(stats.isFile(), `${item.route} should have ${item.file}`);
  }
});

test('legacy routes statically redirect to their new module routes', async () => {
  for (const item of legacyRedirects) {
    const source = await readProjectFile(item.file);
    const redirectPattern = new RegExp(`redirect\\(\\s*['"]${escapeRegExp(item.destination)}['"]\\s*\\)`);

    assert.match(source, /next\/navigation/, `${item.route} should import the App Router redirect helper`);
    assert.match(source, redirectPattern, `${item.route} should redirect to ${item.destination}`);
  }
});

test('visualization route remains a direct Lab compatibility entry', async () => {
  const source = await readProjectFile('src/app/visualization/page.tsx');

  assert.match(source, /LabSurfacePage/, '/visualization should render the Lab workbench directly');
  assert.doesNotMatch(source, /redirect\(/, '/visualization should not hide the workbench behind a redirect');
});

test('AppShell navigation exposes the refactored module routes', async () => {
  const source = await readProjectFile('src/components/layout/AppShell.tsx');

  for (const href of navTargets) {
    assert.match(source, new RegExp(`href:\\s*['"]${escapeRegExp(href)}['"]`), `AppShell should link to ${href}`);
  }

  assert.doesNotMatch(source, /href:\s*['"]\/student['"]/, 'AppShell should not keep the legacy /student link');
  assert.doesNotMatch(source, /href:\s*['"]\/teacher['"]/, 'AppShell should not keep the legacy /teacher link');
  assert.doesNotMatch(source, /href:\s*['"]\/visualization['"]/, 'AppShell should not keep the legacy /visualization link');
  assert.doesNotMatch(source, /href:\s*['"]\/interactions['"]/, 'AppShell should not keep the legacy /interactions link');
});

test('RAG-to-Lab bridge remains a local prefill handoff', async () => {
  const bridgeSource = await readProjectFile('src/features/rag-lab-bridge/buildLabPrompt.ts');
  const ragSource = await readProjectFile('src/features/rag/ui/SubjectRagConsole.tsx');
  const labSource = await readProjectFile('src/components/deep-interaction/DeepInteractionRightPanel.tsx');

  assert.match(bridgeSource, /RAG_TO_LAB_PREFILL_KEY\s*=\s*['"]stemotion\.ragLabBridge\.prefillPrompt['"]/, 'bridge should keep the prefill storage key');
  assert.match(bridgeSource, /RAG_TO_LAB_ROUTE\s*=\s*['"]\/lab\?from=rag-bridge['"]/, 'bridge should keep the Lab handoff route');
  assert.doesNotMatch(bridgeSource, /\bfetch\(/, 'bridge helper should not call backend APIs');

  assert.match(ragSource, /buildLabPromptFromRagResult/, 'RAG UI should build the local Lab prompt');
  assert.match(ragSource, /RAG_TO_LAB_PREFILL_KEY/, 'RAG UI should reference the prefill key');
  assert.match(ragSource, /window\.sessionStorage\.setItem|sessionStorage\.setItem/, 'RAG UI should write the prefill into sessionStorage');
  assert.match(ragSource, /RAG_TO_LAB_ROUTE/, 'RAG UI should route through the bridge constant');
  assert.match(ragSource, /router\.push/, 'RAG UI should navigate after writing local prefill state');

  assert.match(labSource, /RAG_TO_LAB_PREFILL_KEY/, 'Lab UI should read the same prefill key');
  assert.match(labSource, /window\.sessionStorage\.getItem|sessionStorage\.getItem/, 'Lab UI should read local prefill state');
  assert.match(labSource, /window\.sessionStorage\.removeItem|sessionStorage\.removeItem/, 'Lab UI should consume the prefill once');
  assert.match(labSource, /请确认后再生成 Guided Plan/, 'Lab UI should require user confirmation before generation');
  assert.doesNotMatch(labSource, /sessionStorage\.getItem[\s\S]{0,1000}onGenerate\(/, 'Lab UI should not auto-generate from the RAG prefill');
  assert.doesNotMatch(labSource, /sessionStorage\.getItem[\s\S]{0,1000}fetch\(['"]\/api\/v1\/deep-interaction/, 'Lab UI should not call generation APIs from the prefill branch');
});

test('deep interaction generation response forwards abort signal into the agent pipeline', async () => {
  const source = await readProjectFile('src/features/deep-interaction/application/deepInteractionService.ts');

  assert.match(source, /signal\.addEventListener\(\s*['"]abort['"]/);
  assert.match(source, /runAgentWidgetPipeline\([\s\S]*isAborted:\s*\(\)\s*=>\s*aborted\s*\|\|\s*signal\.aborted[\s\S]*signal/);
});

test('Next build artifacts contain the core route contract when available', async (t) => {
  const artifact = await readBuildRouteArtifact();

  if (!artifact) {
    t.skip('No stable Next build route manifest found; run npm run build before this smoke test to enable artifact validation.');
    return;
  }

  for (const item of corePageRoutes) {
    assert.ok(artifact.routes.has(item.route), `${artifact.file} should include ${item.route}`);
  }

  for (const item of legacyRedirects) {
    assert.ok(artifact.routes.has(item.route), `${artifact.file} should include legacy route ${item.route}`);
  }
});

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), 'utf-8');
}

async function readBuildRouteArtifact(): Promise<{ file: string; routes: Set<string> } | null> {
  const appPathRoutesManifest = '.next/app-path-routes-manifest.json';
  const appPathRoutes = await readJsonIfExists<Record<string, string>>(appPathRoutesManifest);
  if (appPathRoutes) {
    return {
      file: appPathRoutesManifest,
      routes: new Set(Object.values(appPathRoutes)),
    };
  }

  const serverAppPathsManifest = '.next/server/app-paths-manifest.json';
  const serverAppPaths = await readJsonIfExists<Record<string, string>>(serverAppPathsManifest);
  if (serverAppPaths) {
    return {
      file: serverAppPathsManifest,
      routes: new Set(Object.keys(serverAppPaths).map(routeKeyToPath)),
    };
  }

  return null;
}

async function readJsonIfExists<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readProjectFile(path)) as T;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function routeKeyToPath(key: string): string {
  if (key === '/page') return '/';
  if (key.endsWith('/page')) return key.slice(0, -'/page'.length);
  if (key.endsWith('/route')) return key.slice(0, -'/route'.length);
  return key;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
