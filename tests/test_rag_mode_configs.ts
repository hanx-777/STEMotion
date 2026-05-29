import assert from 'node:assert/strict';
import test from 'node:test';
import { getModeConfig, getSubjectModeConfig } from '../src/lib/rag/modeConfigs';

test('student mode hides main example cards and keeps a university physics default prompt', () => {
  const student = getModeConfig('student');
  const physicsStudent = getSubjectModeConfig('student', 'physics_mechanics');

  assert.equal(student.examplesDisplayMode, 'hidden');
  assert.match(physicsStudent.defaultQuestion, /h = 1\.20 m/);
  assert.match(physicsStudent.defaultQuestion, /v0 = 8\.0 m\/s/);
  assert.match(physicsStudent.defaultQuestion, /θ = 35°/);
  assert.match(physicsStudent.defaultQuestion, /可视化参数/);
});

test('teacher and visualization modes keep example cards available', () => {
  assert.equal(getModeConfig('teacher').examplesDisplayMode, 'cards');
  assert.equal(getModeConfig('visualization').examplesDisplayMode, 'cards');
});
