import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { FileGenerationJobStore } from '../jobs/fileJobStore';
import { GenerationJobManager } from '../jobs/jobManager';
import { assertGenerationJobId } from '../jobs/jobIds';
import { FileRagRunStore } from '../ragRuns/fileRagRunStore';
import { assertRagRunId } from '../ragRuns/runIds';
import { exportRagRunFlow } from '../ragRuns/ragRunFlowExport';
import { isGenerationJobType, type GenerationJobStatus, type GenerationJobType } from '../jobs/types';
import { createGenerationJobRunners } from '../generation/runners';
import { streamJobEvents, writeJson } from './sse';
import { AppError } from '../../platform/errors';
import { makeId } from '../../lib/utils/makeId';
import type { RagRunStatus } from '../../shared/api/ragRuns';

const DEFAULT_PORT = Number(process.env.STEMOTION_API_PORT || 3101);
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]);
const JOB_ROUTE = /^\/api\/v1\/generation-jobs\/([^/]+)$/;
const JOB_EVENTS_ROUTE = /^\/api\/v1\/generation-jobs\/([^/]+)\/events$/;
const JOB_CANCEL_ROUTE = /^\/api\/v1\/generation-jobs\/([^/]+)\/cancel$/;
const RAG_RUN_EXPORT_ROUTE = /^\/api\/v1\/rag\/runs\/([^/]+)\/export$/;
const RAG_RUN_ROUTE = /^\/api\/v1\/rag\/runs\/([^/]+)$/;

export interface BackendServerOptions {
  manager?: GenerationJobManager;
  runStore?: FileRagRunStore;
}

export function createBackendServer(options: BackendServerOptions = {}): Server {
  const runStore = options.runStore ?? new FileRagRunStore();
  const manager = options.manager ?? new GenerationJobManager({
    store: new FileGenerationJobStore(),
    runStore,
    runners: createGenerationJobRunners(),
  });

  return createServer(async (request, response) => {
    applyCors(request, response);
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      await routeRequest(request, response, manager, runStore);
    } catch (error) {
      if (error instanceof AppError) {
        writeJson(response, error.status, { error: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : 'Backend request failed';
      writeJson(response, 500, { error: message });
    }
  });
}

export async function startBackendServer(port = DEFAULT_PORT): Promise<Server> {
  const store = new FileGenerationJobStore();
  const runStore = new FileRagRunStore();
  await store.markInterruptedRunningJobs();
  const server = createBackendServer({
    runStore,
    manager: new GenerationJobManager({
      store,
      runStore,
      runners: createGenerationJobRunners(),
    }),
  });

  await new Promise<void>((resolveListen) => server.listen(port, '127.0.0.1', resolveListen));
  console.log(`[stemotion-api] listening on http://127.0.0.1:${port}`);
  return server;
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  manager: GenerationJobManager,
  runStore: FileRagRunStore,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const pathname = url.pathname;

  if (request.method === 'GET' && pathname === '/healthz') {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/v1/rag/runs') {
    const input = await readJsonBody(request) as Record<string, unknown>;
    if (!input || typeof input !== 'object') {
      writeJson(response, 400, { error: 'input is required' });
      return;
    }
    const runId = makeId('run');
    const job = await manager.createJob('rag_session_generation', { ...input, runId });
    writeJson(response, 202, { runId, rootJobId: job.id, status: job.status });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/v1/rag/runs') {
    const rawStatus = url.searchParams.get('status') ?? undefined;
    const clientSessionId = url.searchParams.get('clientSessionId') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;
    if (limitParam && !Number.isFinite(limit)) {
      writeJson(response, 400, { error: 'RAG run limit must be a number' });
      return;
    }
    let status: RagRunStatus | undefined;
    if (rawStatus) {
      if (!isRagRunStatus(rawStatus)) {
        writeJson(response, 400, { error: `RAG run status "${String(rawStatus)}" is not supported` });
        return;
      }
      status = rawStatus;
    }
    const runs = await runStore.listRuns({
      ...(status ? { status } : {}),
      ...(clientSessionId ? { clientSessionId } : {}),
      ...(Number.isFinite(limit) ? { limit } : {}),
    });
    writeJson(response, 200, { runs });
    return;
  }

  const ragRunExportMatch = pathname.match(RAG_RUN_EXPORT_ROUTE);
  if (request.method === 'GET' && ragRunExportMatch) {
    const runId = decodeRagRunId(ragRunExportMatch[1]);
    const payload = await exportRagRunFlow(runId, { runStore, jobReader: manager });
    writeJson(response, 200, payload);
    return;
  }

  const ragRunMatch = pathname.match(RAG_RUN_ROUTE);
  if (request.method === 'GET' && ragRunMatch) {
    const runId = decodeRagRunId(ragRunMatch[1]);
    const run = await runStore.readRun(runId);
    if (!run) {
      writeJson(response, 404, { error: 'rag run not found' });
      return;
    }
    const rootJob = await manager.getJob(run.rootJobId);
    if (!rootJob) {
      writeJson(response, 404, { error: 'rag run root job not found' });
      return;
    }
    const events = await manager.readEvents(run.rootJobId);
    writeJson(response, 200, { run, rootJob, events });
    return;
  }

  if (request.method === 'POST' && pathname === '/api/v1/generation-jobs') {
    const body = await readJsonBody(request) as { type?: unknown; input?: Record<string, unknown> };
    if (!body.type) {
      writeJson(response, 400, { error: 'type is required' });
      return;
    }
    if (!isGenerationJobType(body.type)) {
      writeJson(response, 400, { error: `Generation job type "${String(body.type)}" is not supported` });
      return;
    }
    if (!body.input || typeof body.input !== 'object') {
      writeJson(response, 400, { error: 'input is required' });
      return;
    }
    const job = await manager.createJob(body.type, body.input);
    writeJson(response, 202, { jobId: job.id, type: job.type, status: job.status });
    return;
  }

  if (request.method === 'GET' && pathname === '/api/v1/generation-jobs') {
    const rawType = url.searchParams.get('type') ?? undefined;
    const rawStatus = url.searchParams.get('status') ?? undefined;
    const clientSessionId = url.searchParams.get('clientSessionId') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    let type: GenerationJobType | undefined;
    let status: GenerationJobStatus | undefined;
    if (rawType) {
      if (!isGenerationJobType(rawType)) {
        writeJson(response, 400, { error: `Generation job type "${String(rawType)}" is not supported` });
        return;
      }
      type = rawType;
    }
    if (rawStatus) {
      if (!isGenerationJobStatus(rawStatus)) {
        writeJson(response, 400, { error: `Generation job status "${String(rawStatus)}" is not supported` });
        return;
      }
      status = rawStatus;
    }
    const limit = limitParam ? Number(limitParam) : undefined;
    if (limitParam && !Number.isFinite(limit)) {
      writeJson(response, 400, { error: 'Generation job limit must be a number' });
      return;
    }
    const jobs = await manager.listJobs({
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(clientSessionId ? { clientSessionId } : {}),
      ...(Number.isFinite(limit) ? { limit } : {}),
    });
    writeJson(response, 200, { jobs });
    return;
  }

  const jobMatch = pathname.match(JOB_ROUTE);
  if (request.method === 'GET' && jobMatch) {
    const jobId = decodeGenerationJobId(jobMatch[1]);
    const job = await manager.getJob(jobId);
    if (!job) {
      writeJson(response, 404, { error: 'generation job not found' });
      return;
    }
    writeJson(response, 200, job);
    return;
  }

  const eventsMatch = pathname.match(JOB_EVENTS_ROUTE);
  if (request.method === 'GET' && eventsMatch) {
    await streamJobEvents(request, response, manager, decodeGenerationJobId(eventsMatch[1]));
    return;
  }

  const cancelMatch = pathname.match(JOB_CANCEL_ROUTE);
  if (request.method === 'POST' && cancelMatch) {
    const job = await manager.cancelJob(decodeGenerationJobId(cancelMatch[1]));
    writeJson(response, 200, { jobId: job.id, status: job.status });
    return;
  }

  writeJson(response, 404, { error: 'not found' });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_JSON_BODY_BYTES) throw new Error('request body too large');
    chunks.push(buffer);
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function decodeGenerationJobId(encodedJobId: string): string {
  try {
    return assertGenerationJobId(decodeURIComponent(encodedJobId));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Invalid generation job id', {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
}

function decodeRagRunId(encodedRunId: string): string {
  try {
    return assertRagRunId(decodeURIComponent(encodedRunId));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Invalid rag run id', {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }
}

function isGenerationJobStatus(value: unknown): value is GenerationJobStatus {
  return value === 'queued' || value === 'running' || value === 'completed' || value === 'failed' || value === 'cancelled';
}

function isRagRunStatus(value: unknown): value is RagRunStatus {
  return isGenerationJobStatus(value);
}

function applyCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  void startBackendServer();
}
