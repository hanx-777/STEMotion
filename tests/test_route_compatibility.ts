import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

const newRoutes = [
  { route: '/learn', file: 'src/app/learn/page.tsx', component: 'RagSurfacePage', prop: 'mode="student"' },
  { route: '/teach', file: 'src/app/teach/page.tsx', component: 'RagSurfacePage', prop: 'mode="teacher"' },
  { route: '/lab', file: 'src/app/lab/page.tsx', component: 'LabSurfacePage', prop: '<LabSurfacePage />' },
  { route: '/assets', file: 'src/app/assets/page.tsx', component: 'AssetsWorkbench', prop: '<AssetsWorkbench />' },
];

const legacyRedirects = [
  { route: '/student', file: 'src/app/student/page.tsx', destination: '/learn' },
  { route: '/teacher', file: 'src/app/teacher/page.tsx', destination: '/teach' },
  { route: '/visualization', file: 'src/app/visualization/page.tsx', destination: '/lab' },
  { route: '/interactions', file: 'src/app/interactions/page.tsx', destination: '/assets' },
  { route: '/rag', file: 'src/app/rag/page.tsx', destination: '/learn' },
];

test('new product routes render the reused STEMotion workbenches', async () => {
  for (const route of newRoutes) {
    const source = await readRoute(route.file);

    assert.doesNotMatch(source, /^['"]use client['"];?/m, `${route.route} should stay as a small server page`);
    assert.doesNotMatch(source, /redirect\(/, `${route.route} should render the reused workbench instead of redirecting`);
    assert.match(source, new RegExp(route.component), `${route.route} should use ${route.component}`);
    assert.match(source, new RegExp(escapeRegExp(route.prop)), `${route.route} should pass the expected surface props`);
  }
});

test('legacy product routes redirect to the new product routes', async () => {
  for (const route of legacyRedirects) {
    const source = await readRoute(route.file);

    assert.doesNotMatch(source, /^['"]use client['"];?/m, `${route.route} should be a server redirect page`);
    assert.match(source, /next\/navigation/, `${route.route} should use Next App Router redirect`);
    assert.match(
      source,
      new RegExp(`redirect\\(['"]${escapeRegExp(route.destination)}['"]\\)`),
      `${route.route} should redirect to ${route.destination}`,
    );
  }
});

test('deep interaction route remains a concrete compatibility entry', async () => {
  const source = await readRoute('src/app/deep-interaction/page.tsx');

  assert.match(source, /DeepInteractionWorkbench/, '/deep-interaction should keep rendering the workbench');
  assert.doesNotMatch(source, /redirect\(/, '/deep-interaction should not be forced through a redirect');
});

test('AppShell navigation uses the refactored product module names and paths', async () => {
  const source = await readRoute('src/components/layout/AppShell.tsx');
  const navItems = [
    { name: '学生学习', href: '/learn' },
    { name: '教师教学', href: '/teach' },
    { name: '可视化实验', href: '/lab' },
    { name: '教学资产', href: '/assets' },
  ];

  for (const item of navItems) {
    assert.match(
      source,
      new RegExp(`\\{ name: ['"]${item.name}['"], href: ['"]${item.href}['"]`),
      `AppShell should link ${item.name} to ${item.href}`,
    );
  }

  assert.doesNotMatch(source, /href:\s*['"]\/student['"]/, 'main nav should not link to /student');
  assert.doesNotMatch(source, /href:\s*['"]\/teacher['"]/, 'main nav should not link to /teacher');
  assert.doesNotMatch(source, /href:\s*['"]\/visualization['"]/, 'main nav should not link to /visualization');
  assert.doesNotMatch(source, /href:\s*['"]\/interactions['"]/, 'main nav should not link to /interactions');
  assert.doesNotMatch(source, /href:\s*['"]#['"]/, 'AppShell should not expose a dead about link');
});

async function readRoute(path: string): Promise<string> {
  await stat(join(root, path));
  return readFile(join(root, path), 'utf-8');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
