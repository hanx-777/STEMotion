import assert from 'node:assert/strict';
import test from 'node:test';
import { citationRefForCitation, citationSourceKey, resolveCitationRef } from '../src/lib/rag/citation_refs';
import type { Citation } from '../src/lib/rag/types';

const citations: Citation[] = [
  {
    source_type: 'local',
    source: 'projectile_motion.md',
    chunk_id: 'physics_mechanics_projectile_motion_001',
    subject: 'physics_mechanics',
    file_name: 'projectile_motion.md',
  },
  {
    source_type: 'local',
    source: 'circular_motion.md',
    chunk_id: 'physics_mechanics_circular_motion_001',
    subject: 'physics_mechanics',
    file_name: 'circular_motion.md',
  },
  {
    source_type: 'web',
    title: 'Projectile motion reference',
    url: 'https://example.edu/projectile',
    snippet: 'Projectile motion snippet',
  },
  {
    source_type: 'web',
    title: 'Circular motion reference',
    url: 'https://example.edu/circular',
    snippet: 'Circular motion snippet',
  },
];

test('citation refs resolve against local and web scoped citation lists', () => {
  const local = resolveCitationRef('[L1]', citations);
  const web = resolveCitationRef('[W2]', citations);

  assert.equal(local?.resolved, true);
  assert.equal(local?.citation?.source_type, 'local');
  assert.equal(local?.key, 'physics_mechanics_projectile_motion_001');
  assert.equal(web?.resolved, true);
  assert.equal(web?.citation?.source_type, 'web');
  assert.equal(web?.key, 'https://example.edu/circular');
});

test('missing citation refs are unresolved without throwing', () => {
  const missing = resolveCitationRef('[L9]', citations);

  assert.equal(missing?.resolved, false);
  assert.equal(missing?.key, undefined);
  assert.match(missing?.description ?? '', /未找到/);
});

test('citation labels use local L and web W numbering', () => {
  assert.equal(citationRefForCitation(citations[1], citations), '[L2]');
  assert.equal(citationRefForCitation(citations[2], citations), '[W1]');
  assert.equal(citationSourceKey(citations[0]), 'physics_mechanics_projectile_motion_001');
});
