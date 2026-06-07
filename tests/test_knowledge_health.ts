import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { getKnowledgeHealth, TARGET_KNOWLEDGE_SUBJECTS } from '../src/features/knowledge/knowledgeHealth';

const root = process.cwd();
const requiredSubjects = [
  'physics_mechanics',
  'advanced_math',
  'chemistry',
  'computer_science',
] as const;

test('/knowledge route is a small read-only server page', async () => {
  const source = await readProjectFile('src/app/knowledge/page.tsx');

  assert.doesNotMatch(source, /^['"]use client['"];?/m, '/knowledge should remain a server page');
  assert.match(source, /getKnowledgeHealth/, '/knowledge should read health data through the filesystem helper');
  assert.match(source, /AppShell/, '/knowledge should render inside the shared app shell');
  assert.match(source, /\/learn/, '/knowledge should provide a read-only link back to the learning surface');
  assert.doesNotMatch(source, /ingestSubjectKnowledge|retrieveSubjectKnowledge|rag:build|rag:query/, '/knowledge should not trigger ingest, build, query, or retrieval work');
});

test('AppShell navigation exposes the knowledge health route', async () => {
  const source = await readProjectFile('src/components/layout/AppShell.tsx');

  assert.match(source, /\{ name: ['"]知识库['"], href: ['"]\/knowledge['"]/, 'main nav should link 知识库 to /knowledge');
  assert.match(source, /pathname === ['"]\/knowledge['"]/, 'header title should name the knowledge route');
});

test('knowledge health helper reports all required subjects from local files', async () => {
  assert.deepEqual(TARGET_KNOWLEDGE_SUBJECTS, requiredSubjects);

  const report = await getKnowledgeHealth(root);
  assert.equal(report.subjects.length, requiredSubjects.length);
  assert.equal(report.summary.totalSubjects, requiredSubjects.length);
  assert.match(report.reingestCommandExample, /^npm run rag:ingest -- --subject /);

  for (const subject of requiredSubjects) {
    const health = report.subjects.find((item) => item.subject === subject);
    assert.ok(health, `${subject} should be present in the health report`);
    assert.equal(health.subject, subject);
    assert.ok(health.displayName.length > 0, `${subject} should expose a display name`);
    assert.ok(health.sourceFileCount > 0, `${subject} should count source files`);
    assert.equal(health.processedManifestExists, true, `${subject} should have a processed manifest`);
    assert.ok(health.processedChunkCount > 0, `${subject} should report processed chunks`);
    assert.ok(health.processedIndexFiles.includes('keyword.json'), `${subject} should include keyword index`);
    assert.ok(health.processedIndexFiles.includes('vector.json'), `${subject} should include vector index`);
    assert.equal(typeof health.runtimeManifestExists, 'boolean');
    assert.equal(typeof health.runtimeChunkCount, 'number');
    assert.ok(health.lastUpdated.length > 0, `${subject} should report a timestamp or fallback freshness marker`);
    assert.ok(Array.isArray(health.coverageModules), `${subject} should expose coverage modules`);
    assert.ok(Array.isArray(health.missingModules), `${subject} should expose missing modules`);
    assert.match(health.validationStatus, /^(healthy|partial|missing)$/);
    assert.ok(health.healthScore >= 0 && health.healthScore <= 100, `${subject} health score should be bounded`);
    assert.ok(Array.isArray(health.notes), `${subject} should include explanatory notes`);
  }

  const physics = report.subjects.find((item) => item.subject === 'physics_mechanics');
  assert.equal(physics?.runtimeManifestExists, true);
  assert.equal(physics?.runtimeChunkCount, 20);

  const advancedMath = report.subjects.find((item) => item.subject === 'advanced_math');
  assert.equal(advancedMath?.runtimeManifestExists, false);
  assert.equal(advancedMath?.runtimeChunkCount, 0);
});

async function readProjectFile(path: string): Promise<string> {
  await stat(join(root, path));
  return readFile(join(root, path), 'utf-8');
}
