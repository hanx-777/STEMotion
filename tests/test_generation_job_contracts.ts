import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('generation job API contracts live in shared api module', async () => {
  const shared = await readProjectFile('src/shared/api/generationJobs.ts');
  const backendTypes = await readProjectFile('src/backend/jobs/types.ts');
  const client = await readProjectFile('src/features/generation-jobs/client/generationJobClient.ts');

  assert.match(shared, /export const GENERATION_JOB_TYPES/);
  assert.match(shared, /export type GenerationJobType/);
  assert.match(shared, /export type GenerationJobStatus/);
  assert.match(shared, /export interface GenerationJobSnapshot/);
  assert.match(shared, /export interface GenerationJobEvent/);
  assert.match(shared, /export interface GenerationJobCreateResponse/);
  assert.match(shared, /export interface GenerationJobCancelResponse/);
  assert.match(shared, /export function isGenerationJobType/);

  assert.match(backendTypes, /shared\/api\/generationJobs/);
  assert.match(client, /@\/shared\/api\/generationJobs/);
  assert.doesNotMatch(client, /export type GenerationJobType =/);
  assert.doesNotMatch(client, /export interface GenerationJobEvent/);
});

test('generation job contracts document reconnect-safe event metadata', async () => {
  const shared = await readProjectFile('src/shared/api/generationJobs.ts');

  assert.match(shared, /jobId: string/);
  assert.match(shared, /sequence: number/);
  assert.match(shared, /createdAt: string/);
});

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(root, path), 'utf-8');
}
