import { FileGenerationJobStore } from './fileJobStore';
import { assertGenerationJobId } from './jobIds';
import { FileRagRunStore } from '../ragRuns/fileRagRunStore';
import { extractRagRunId } from '../ragRuns/runIds';
import { createLogger } from '../../lib/logger';
import {
  recordGenerationTrace,
  recordGenerationTraceAsync,
  runWithGenerationTraceContext,
  sanitizeTraceValue,
  type GenerationTraceEntry,
} from '../../lib/generation/trace';
import type {
  GenerationJobEvent,
  GenerationJobListFilters,
  GenerationJobRunner,
  GenerationJobRunnerMap,
  GenerationJobSnapshot,
  GenerationJobStatus,
  GenerationJobType,
} from './types';

type Subscriber = (event: GenerationJobEvent) => void;

const TERMINAL_STATUSES: GenerationJobStatus[] = ['completed', 'failed', 'cancelled'];
const TERMINAL_EVENT_TYPES = new Set(['job_completed', 'job_failed', 'job_cancelled']);
const log = createLogger('generation-job');

export class GenerationJobManager {
  private readonly activeJobs = new Map<string, AbortController>();
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private readonly eventQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly options: {
      store: FileGenerationJobStore;
      runStore?: FileRagRunStore;
      runners: GenerationJobRunnerMap;
    },
  ) {}

  async createJob(type: GenerationJobType, input: Record<string, unknown>): Promise<GenerationJobSnapshot> {
    const runner = this.options.runners[type];
    if (!runner) throw new Error(`Generation job type "${type}" is not supported`);

    const job = await this.options.store.createJob(type, input);
    await this.options.runStore?.recordJobCreated(job);
    log.info('Job created', { jobId: job.id, runId: job.runId, jobType: job.type });
    await this.emit(job.id, withRunId({ type: 'job_created', jobId: job.id, status: 'queued' }, job.runId));
    void this.runJob(job, input, runner);
    return job;
  }

  async getJob(jobId: string): Promise<GenerationJobSnapshot | null> {
    return this.options.store.readJob(assertGenerationJobId(jobId));
  }

  async readEvents(jobId: string): Promise<GenerationJobEvent[]> {
    return this.options.store.readEvents(assertGenerationJobId(jobId));
  }

  async readTrace(jobId: string): Promise<GenerationTraceEntry[]> {
    return this.options.store.readTrace(assertGenerationJobId(jobId));
  }

  async listJobs(filters: GenerationJobListFilters = {}): Promise<GenerationJobSnapshot[]> {
    const limit = typeof filters.limit === 'number' && Number.isFinite(filters.limit)
      ? Math.max(1, Math.floor(filters.limit))
      : 20;
    return (await this.options.store.listJobs())
      .filter((job) => !filters.type || job.type === filters.type)
      .filter((job) => !filters.status || job.status === filters.status)
      .filter((job) => !filters.clientSessionId || job.inputSummary.clientSessionId === filters.clientSessionId)
      .slice(0, limit);
  }

  subscribe(jobId: string, subscriber: Subscriber): () => void {
    const safeJobId = assertGenerationJobId(jobId);
    const subscribers = this.subscribers.get(safeJobId) ?? new Set<Subscriber>();
    subscribers.add(subscriber);
    this.subscribers.set(safeJobId, subscribers);

    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) this.subscribers.delete(safeJobId);
    };
  }

  async cancelJob(jobId: string): Promise<GenerationJobSnapshot> {
    const safeJobId = assertGenerationJobId(jobId);
    const current = await this.options.store.readJob(safeJobId);
    if (!current) throw new Error(`Generation job "${safeJobId}" not found`);
    if (TERMINAL_STATUSES.includes(current.status)) return current;

    this.activeJobs.get(safeJobId)?.abort();
    const cancelled = await this.options.store.updateJob(safeJobId, {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    await this.options.runStore?.recordJobCompleted(cancelled);
    log.warn('Job cancelled', { jobId: cancelled.id, runId: cancelled.runId, jobType: cancelled.type });
    await this.emit(safeJobId, withRunId({ type: 'job_cancelled', status: 'cancelled' }, cancelled.runId));
    return cancelled;
  }

  private async runJob(
    job: GenerationJobSnapshot,
    input: Record<string, unknown>,
    runner: GenerationJobRunner,
  ): Promise<void> {
    await runWithGenerationTraceContext(
      {
        jobId: job.id,
        ...(job.runId ? { runId: job.runId } : {}),
        jobType: job.type,
        startedAtMs: Date.now(),
        write: (entry) => this.options.store.appendTrace(job.id, entry),
      },
      () => this.runJobWithTrace(job, input, runner),
    );
  }

  private async runJobWithTrace(
    job: GenerationJobSnapshot,
    input: Record<string, unknown>,
    runner: GenerationJobRunner,
  ): Promise<void> {
    const controller = new AbortController();
    this.activeJobs.set(job.id, controller);

    try {
      const running = await this.options.store.updateJob(job.id, {
        status: 'running',
        startedAt: new Date().toISOString(),
      });
      await this.options.runStore?.recordJobCompleted(running);
      log.info('Job started', { jobId: job.id, runId: job.runId, jobType: job.type });
      await this.emit(job.id, withRunId({ type: 'job_started', status: 'running' }, job.runId));
      await recordGenerationTraceAsync({
        event: 'job_started',
        stage: 'job',
        summary: {
          inputSummary: job.inputSummary,
        },
      });

      const result = await runner(input, {
        signal: controller.signal,
        runId: job.runId,
        emit: (event) => {
          if (controller.signal.aborted && !isTerminalEvent(event)) return;
          const eventWithRunId = withRunId(event, job.runId);
          recordGenerationTrace({
            event: 'runner_event',
            stage: summarizeEventStage(eventWithRunId),
            summary: summarizeRunnerEvent(eventWithRunId),
          });
          void this.emit(job.id, eventWithRunId);
        },
        enqueueJob: (type, nextInput) => this.createJob(type, inheritRunId(nextInput, job.runId)),
      });

      await this.flushEvents(job.id);
      const latest = await this.options.store.readJob(job.id);
      if (controller.signal.aborted || latest?.status === 'cancelled') return;

      const completed = await this.options.store.updateJob(job.id, {
        status: 'completed',
        result,
        completedAt: new Date().toISOString(),
      });
      await this.options.runStore?.recordJobCompleted(completed);
      log.info('Job completed', { jobId: job.id, runId: job.runId, jobType: job.type });
      await recordGenerationTraceAsync({
        event: 'job_completed',
        stage: 'job',
        summary: {
          result,
        },
      });
      await this.emit(job.id, withRunId({ type: 'job_completed', status: 'completed', result }, job.runId));
    } catch (error) {
      await this.flushEvents(job.id);
      const latest = await this.options.store.readJob(job.id);
      if (latest?.status === 'cancelled') return;
      if (controller.signal.aborted) {
        const cancelled = await this.options.store.updateJob(job.id, {
          status: 'cancelled',
          cancelledAt: latest?.cancelledAt ?? new Date().toISOString(),
          completedAt: latest?.completedAt ?? new Date().toISOString(),
        });
        await this.options.runStore?.recordJobCompleted(cancelled);
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      const diagnostics = extractErrorDiagnostics(error);
      const failed = await this.options.store.updateJob(job.id, {
        status: 'failed',
        error: message,
        ...(diagnostics !== undefined ? { errorDiagnostics: diagnostics } : {}),
        completedAt: new Date().toISOString(),
      });
      await this.options.runStore?.recordJobCompleted(failed);
      log.error('Job failed', { jobId: job.id, runId: job.runId, jobType: job.type, message });
      await recordGenerationTraceAsync({
        event: 'job_failed',
        stage: 'job',
        summary: { message },
        diagnostics,
      });
      await this.emit(job.id, withRunId({
        type: 'job_failed',
        status: 'failed',
        message,
        ...(diagnostics !== undefined ? { diagnostics } : {}),
      }, job.runId));
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  private async emit(jobId: string, event: Record<string, unknown>): Promise<void> {
    const safeJobId = assertGenerationJobId(jobId);
    const previous = this.eventQueues.get(safeJobId) ?? Promise.resolve();
    const next = previous.then(async () => {
      const stamped = await this.options.store.appendEvent(safeJobId, event);
      const subscribers = this.subscribers.get(safeJobId);
      if (subscribers) {
        for (const subscriber of subscribers) subscriber(stamped);
      }
    });
    this.eventQueues.set(safeJobId, next.catch(() => undefined));
    await next;
  }

  private async flushEvents(jobId: string): Promise<void> {
    await (this.eventQueues.get(assertGenerationJobId(jobId)) ?? Promise.resolve());
  }
}

function withRunId<T extends Record<string, unknown>>(event: T, runId?: string): T {
  if (!runId || event.runId !== undefined) return event;
  return { ...event, runId };
}

function inheritRunId(input: Record<string, unknown>, runId?: string): Record<string, unknown> {
  if (!runId || extractRagRunId(input)) return input;
  return { ...input, runId };
}

function isTerminalEvent(event: Record<string, unknown>): boolean {
  return typeof event.type === 'string' && TERMINAL_EVENT_TYPES.has(event.type);
}

function extractErrorDiagnostics(error: unknown): unknown {
  if (!error || typeof error !== 'object') return undefined;
  const diagnostics = (error as { diagnostics?: unknown }).diagnostics;
  if (diagnostics === undefined) return undefined;
  return sanitizeTraceValue(diagnostics);
}

function summarizeEventStage(event: Record<string, unknown>): string | undefined {
  return typeof event.stage === 'string' ? event.stage : undefined;
}

function summarizeRunnerEvent(event: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    type: event.type,
  };
  for (const key of ['stage', 'progress', 'iteration', 'agentName', 'message', 'status']) {
    if (event[key] !== undefined) summary[key] = event[key];
  }
  if (event.type === 'artifact_ready') {
    const artifact = event.artifact as Record<string, unknown> | undefined;
    summary.artifact = artifact
      ? {
          id: artifact.id,
          title: artifact.title,
          type: artifact.type,
          finalScore: artifact.finalScore,
        }
      : undefined;
  }
  if (event.type === 'answer_ready') {
    const result = event.result as Record<string, unknown> | undefined;
    summary.result = result
      ? {
          answerLength: typeof result.answer === 'string' ? result.answer.length : undefined,
          shouldGenerateVisualization: result.should_generate_visualization,
          visualizationStatus: result.visualization_status,
        }
      : undefined;
  }
  return summary;
}
