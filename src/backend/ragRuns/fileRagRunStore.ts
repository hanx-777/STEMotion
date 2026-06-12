import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sanitizeTraceValue } from '../../lib/generation/trace';
import type { GenerationJobSnapshot } from '../../shared/api/generationJobs';
import type { RagRunListFilters, RagRunRecord } from '../../shared/api/ragRuns';
import { assertRagRunId, extractRagRunId, isRagRunId } from './runIds';

const DEFAULT_RUNS_DIR = join(process.cwd(), process.env.STEMOTION_RUNS_DIR || '.stemotion/runs');

export class FileRagRunStore {
  private readonly queues = new Map<string, Promise<void>>();

  constructor(private readonly runsDir = DEFAULT_RUNS_DIR) {}

  async recordJobCreated(job: GenerationJobSnapshot): Promise<RagRunRecord | null> {
    const runId = job.runId ?? extractRagRunId(job.inputSummary);
    if (!runId) return null;

    return this.withRunLock(runId, async () => {
      const existing = await this.readRunUnlocked(runId);
      const now = new Date().toISOString();
      if (!existing || job.type === 'rag_session_generation') {
        const next: RagRunRecord = {
          runId,
          rootJobId: job.type === 'rag_session_generation' ? job.id : existing?.rootJobId ?? job.id,
          clientSessionId: extractString(job.inputSummary, 'clientSessionId') ?? existing?.clientSessionId,
          status: job.status,
          questionSummary: extractQuestionSummary(job.inputSummary) ?? existing?.questionSummary,
          createdAt: existing?.createdAt ?? job.createdAt ?? now,
          updatedAt: now,
          completedAt: existing?.completedAt,
          lastResult: existing?.lastResult,
          error: existing?.error,
          errorDiagnostics: existing?.errorDiagnostics,
          childJobIds: existing?.childJobIds ?? [],
        };
        await this.writeRun(next);
        return next;
      }

      const next: RagRunRecord = {
        ...existing,
        childJobIds: appendUnique(existing.childJobIds, job.id),
        updatedAt: now,
      };
      await this.writeRun(next);
      return next;
    });
  }

  async recordJobCompleted(job: GenerationJobSnapshot): Promise<RagRunRecord | null> {
    const runId = job.runId ?? extractRagRunId(job.inputSummary);
    if (!runId) return null;

    return this.withRunLock(runId, async () => {
      const existing = await this.readRunUnlocked(runId);
      if (!existing) return null;
      const isRoot = job.id === existing.rootJobId;
      const next: RagRunRecord = {
        ...existing,
        childJobIds: isRoot ? existing.childJobIds : appendUnique(existing.childJobIds, job.id),
        status: isRoot ? job.status : existing.status,
        updatedAt: new Date().toISOString(),
        ...(isRoot && job.completedAt ? { completedAt: job.completedAt } : {}),
        ...(isRoot && job.result !== undefined ? { lastResult: sanitizeTraceValue(job.result) } : {}),
        ...(isRoot && job.error !== undefined ? { error: job.error } : {}),
        ...(isRoot && job.errorDiagnostics !== undefined ? { errorDiagnostics: sanitizeTraceValue(job.errorDiagnostics) } : {}),
      };
      await this.writeRun(next);
      return next;
    });
  }

  async readRun(runId: string): Promise<RagRunRecord | null> {
    const safeRunId = assertRagRunId(runId);
    return this.readRunUnlocked(safeRunId);
  }

  async listRuns(filters: RagRunListFilters = {}): Promise<RagRunRecord[]> {
    await mkdir(this.runsDir, { recursive: true });
    const limit = typeof filters.limit === 'number' && Number.isFinite(filters.limit)
      ? Math.max(1, Math.floor(filters.limit))
      : 20;
    const entries = await readdir(this.runsDir, { withFileTypes: true });
    const runs = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .filter((entry) => isRagRunId(entry.name))
        .map((entry) => this.readRun(entry.name)),
    );
    return runs
      .filter((run): run is RagRunRecord => Boolean(run))
      .filter((run) => !filters.status || run.status === filters.status)
      .filter((run) => !filters.clientSessionId || run.clientSessionId === filters.clientSessionId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  private async readRunUnlocked(runId: string): Promise<RagRunRecord | null> {
    const safeRunId = assertRagRunId(runId);
    try {
      return JSON.parse(await readFile(this.runPath(safeRunId), 'utf8')) as RagRunRecord;
    } catch {
      return null;
    }
  }

  private async writeRun(run: RagRunRecord): Promise<void> {
    assertRagRunId(run.runId);
    await mkdir(this.runDir(run.runId), { recursive: true });
    const target = this.runPath(run.runId);
    const temp = `${target}.${Date.now()}.${randomUUID()}.tmp`;
    await writeFile(temp, `${JSON.stringify(sanitizeTraceValue(run), null, 2)}\n`, 'utf8');
    await rename(temp, target);
  }

  private withRunLock<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const safeRunId = assertRagRunId(runId);
    const previous = this.queues.get(safeRunId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);
    const next = run.then(() => undefined, () => undefined);
    this.queues.set(safeRunId, next);
    void next.finally(() => {
      if (this.queues.get(safeRunId) === next) this.queues.delete(safeRunId);
    });
    return run;
  }

  private runDir(runId: string): string {
    return join(this.runsDir, assertRagRunId(runId));
  }

  private runPath(runId: string): string {
    return join(this.runDir(runId), 'run.json');
  }
}

export function getDefaultRunsDir(): string {
  return DEFAULT_RUNS_DIR;
}

function extractString(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function extractQuestionSummary(input: unknown): unknown {
  if (!input || typeof input !== 'object') return undefined;
  const value = (input as Record<string, unknown>).question;
  return value === undefined ? undefined : sanitizeTraceValue(value, 'question');
}

function appendUnique(items: string[], item: string): string[] {
  return items.includes(item) ? items : [...items, item];
}
