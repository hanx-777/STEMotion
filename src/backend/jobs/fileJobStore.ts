import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sanitizeTraceValue, type GenerationTraceEntry } from '../../lib/generation/trace';
import { makeId } from '../../lib/utils/makeId';
import { extractRagRunId } from '../ragRuns/runIds';
import { assertGenerationJobId, isGenerationJobId } from './jobIds';
import type { GenerationJobEvent, GenerationJobSnapshot, GenerationJobType } from './types';

const DEFAULT_JOBS_DIR = join(process.cwd(), process.env.STEMOTION_JOBS_DIR || '.stemotion/jobs');
const SECRET_KEY_PATTERN = /(api[_-]?key|secret|token|password|cookie|authorization)/i;
const PROMPT_KEY_PATTERN = /^(prompt|question|answerText|currentHtml|html|systemPrompt|developerPrompt)$/i;

export class FileGenerationJobStore {
  private readonly snapshotQueues = new Map<string, Promise<void>>();
  private readonly traceQueues = new Map<string, Promise<void>>();

  constructor(private readonly jobsDir = DEFAULT_JOBS_DIR) {}

  async createJob(type: GenerationJobType, input: unknown): Promise<GenerationJobSnapshot> {
    const now = new Date().toISOString();
    const snapshot: GenerationJobSnapshot = {
      id: makeId('job'),
      ...(extractRagRunId(input) ? { runId: extractRagRunId(input) } : {}),
      type,
      status: 'queued',
      inputSummary: summarizeJobInput(input),
      createdAt: now,
      updatedAt: now,
    };

    return this.withSnapshotLock(snapshot.id, async () => {
      await this.writeSnapshot(snapshot);
      return snapshot;
    });
  }

  async readJob(jobId: string): Promise<GenerationJobSnapshot | null> {
    const safeJobId = assertGenerationJobId(jobId);
    try {
      return JSON.parse(await readFile(this.snapshotPath(safeJobId), 'utf8')) as GenerationJobSnapshot;
    } catch {
      return null;
    }
  }

  async updateJob(
    jobId: string,
    patch: Partial<Omit<GenerationJobSnapshot, 'id' | 'type' | 'createdAt' | 'inputSummary'>>,
  ): Promise<GenerationJobSnapshot> {
    const safeJobId = assertGenerationJobId(jobId);
    return this.withSnapshotLock(safeJobId, async () => {
      const current = await this.readJob(safeJobId);
      if (!current) throw new Error(`Generation job "${safeJobId}" not found`);

      const next: GenerationJobSnapshot = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      await this.writeSnapshot(next);
      return next;
    });
  }

  async listJobs(): Promise<GenerationJobSnapshot[]> {
    await mkdir(this.jobsDir, { recursive: true });
    const entries = await readdir(this.jobsDir, { withFileTypes: true });
    const snapshots = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .filter((entry) => isGenerationJobId(entry.name))
        .map((entry) => this.readJob(entry.name)),
    );

    return snapshots
      .filter((snapshot): snapshot is GenerationJobSnapshot => Boolean(snapshot))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async appendEvent(jobId: string, event: Record<string, unknown>): Promise<GenerationJobEvent> {
    const safeJobId = assertGenerationJobId(jobId);
    await mkdir(this.jobDir(safeJobId), { recursive: true });
    const sequence = (await this.readEvents(safeJobId)).length + 1;
    const stamped = {
      ...event,
      type: typeof event.type === 'string' ? event.type : 'message',
      jobId: safeJobId,
      sequence,
      createdAt: new Date().toISOString(),
    } as GenerationJobEvent;

    const current = await readFile(this.eventsPath(safeJobId), 'utf8').catch(() => '');
    await writeFile(this.eventsPath(safeJobId), `${current}${JSON.stringify(stamped)}\n`, 'utf8');
    return stamped;
  }

  async readEvents(jobId: string): Promise<GenerationJobEvent[]> {
    const safeJobId = assertGenerationJobId(jobId);
    try {
      const raw = await readFile(this.eventsPath(safeJobId), 'utf8');
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as GenerationJobEvent);
    } catch {
      return [];
    }
  }

  async readTrace(jobId: string): Promise<GenerationTraceEntry[]> {
    const safeJobId = assertGenerationJobId(jobId);
    try {
      const raw = await readFile(this.tracePath(safeJobId), 'utf8');
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as GenerationTraceEntry);
    } catch {
      return [];
    }
  }

  async appendTrace(jobId: string, entry: GenerationTraceEntry): Promise<void> {
    const safeJobId = assertGenerationJobId(jobId);
    return this.withTraceLock(safeJobId, async () => {
      await mkdir(this.jobDir(safeJobId), { recursive: true });
      const sanitized = sanitizeTraceValue(entry) as GenerationTraceEntry;
      await appendFile(this.tracePath(safeJobId), `${JSON.stringify(sanitized)}\n`, 'utf8');
    });
  }

  async markInterruptedRunningJobs(): Promise<void> {
    const jobs = await this.listJobs();
    await Promise.all(
      jobs
        .filter((job) => job.status === 'queued' || job.status === 'running')
        .map((job) => this.updateJob(job.id, {
          status: 'failed',
          error: 'Backend process restarted before this generation job completed.',
          completedAt: new Date().toISOString(),
        })),
    );
  }

  private async writeSnapshot(snapshot: GenerationJobSnapshot): Promise<void> {
    assertGenerationJobId(snapshot.id);
    await mkdir(this.jobDir(snapshot.id), { recursive: true });
    const target = this.snapshotPath(snapshot.id);
    const temp = `${target}.${Date.now()}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await rename(temp, target);
  }

  private withSnapshotLock<T>(jobId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.snapshotQueues.get(jobId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);
    const next = run.then(() => undefined, () => undefined);
    this.snapshotQueues.set(jobId, next);
    void next.finally(() => {
      if (this.snapshotQueues.get(jobId) === next) this.snapshotQueues.delete(jobId);
    });
    return run;
  }

  private withTraceLock<T>(jobId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.traceQueues.get(jobId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);
    const next = run.then(() => undefined, () => undefined);
    this.traceQueues.set(jobId, next);
    void next.finally(() => {
      if (this.traceQueues.get(jobId) === next) this.traceQueues.delete(jobId);
    });
    return run;
  }

  private jobDir(jobId: string): string {
    return join(this.jobsDir, assertGenerationJobId(jobId));
  }

  private snapshotPath(jobId: string): string {
    return join(this.jobDir(jobId), 'snapshot.json');
  }

  private eventsPath(jobId: string): string {
    return join(this.jobDir(jobId), 'events.jsonl');
  }

  private tracePath(jobId: string): string {
    return join(this.jobDir(jobId), 'trace.jsonl');
  }
}

export function getDefaultJobsDir(): string {
  return DEFAULT_JOBS_DIR;
}

export function summarizeJobInput(input: unknown): Record<string, unknown> {
  const summarized = summarizeValue(input, 'input', 0);
  if (summarized && typeof summarized === 'object' && !Array.isArray(summarized)) {
    return summarized as Record<string, unknown>;
  }
  return { value: summarized };
}

function summarizeValue(value: unknown, key: string, depth: number): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return '[redacted]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    if (PROMPT_KEY_PATTERN.test(key)) {
      return {
        [`${key}Preview`]: value.slice(0, 120),
        [`${key}Length`]: value.length,
      };
    }
    if (value.length > 180) {
      return { textPreview: value.slice(0, 120), textLength: value.length };
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 6).map((item, index) => summarizeValue(item, `${key}_${index}`, depth + 1));
  }

  if (typeof value === 'object') {
    if (depth >= 4) return '[truncated]';
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = summarizeValue(childValue, childKey, depth + 1);
    }
    return result;
  }

  return String(value);
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
