import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SUBJECT } from '../src/lib/config/settings';
import { ingestSubjectKnowledge, readKnowledgeManifest } from '../src/features/rag/lib/retriever';
import { SubjectManager } from '../src/lib/subjects/subject_manager';

test('SubjectManager lists configured subjects and default subject', async () => {
  const manager = new SubjectManager();
  const subjects = await manager.listSubjects();
  const names = subjects.map((subject) => subject.name);

  assert.ok(names.includes('physics_mechanics'));
  assert.ok(names.includes('advanced_math'));
  assert.ok(names.includes('chemistry'));
  assert.ok(names.includes('computer_science'));

  const defaultSubject = await manager.getDefaultSubject();
  assert.equal(defaultSubject.name, process.env.STEMOTION_DEFAULT_SUBJECT ?? DEFAULT_SUBJECT);
  assert.equal(defaultSubject.display_name, '大学物理力学');
});

test('SubjectManager falls back to default subject for invalid names', async () => {
  const manager = new SubjectManager();
  const validated = await manager.validateSubject('not_a_subject');

  assert.equal(validated, DEFAULT_SUBJECT);
});

test('knowledge ingest writes manifest for subject status', async () => {
  const manager = new SubjectManager();
  const result = await ingestSubjectKnowledge('physics_mechanics', manager);
  const manifest = await readKnowledgeManifest('physics_mechanics');

  assert.equal(manifest.subject, 'physics_mechanics');
  assert.equal(manifest.indexed, true);
  assert.equal(manifest.file_count, result.document_count);
  assert.equal(manifest.chunk_count, result.chunk_count);
});
