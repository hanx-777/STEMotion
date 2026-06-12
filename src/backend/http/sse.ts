import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GenerationJobManager } from '../jobs/jobManager';
import type { GenerationJobEvent, GenerationJobStatus } from '../jobs/types';

const TERMINAL_EVENT_TYPES = new Set(['job_completed', 'job_failed', 'job_cancelled']);
const TERMINAL_STATUSES: GenerationJobStatus[] = ['completed', 'failed', 'cancelled'];

export async function streamJobEvents(
  request: IncomingMessage,
  response: ServerResponse,
  manager: GenerationJobManager,
  jobId: string,
): Promise<void> {
  const job = await manager.getJob(jobId);
  if (!job) {
    writeJson(response, 404, { error: 'generation job not found' });
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const replayed = await manager.readEvents(jobId);
  let deliveredSequence = 0;
  for (const event of replayed) {
    writeSse(response, event);
    deliveredSequence = Math.max(deliveredSequence, event.sequence);
  }

  const heartbeat = setInterval(() => {
    if (!response.writableEnded) response.write(':heartbeat\n\n');
  }, 15000);

  const unsubscribe = manager.subscribe(jobId, (event) => {
    if (event.sequence <= deliveredSequence) return;
    writeSse(response, event);
    deliveredSequence = event.sequence;
    if (TERMINAL_EVENT_TYPES.has(event.type)) {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    }
  });

  const missedEvents = await manager.readEvents(jobId);
  for (const event of missedEvents) {
    if (event.sequence <= deliveredSequence) continue;
    writeSse(response, event);
    deliveredSequence = event.sequence;
  }

  const latest = await manager.getJob(jobId);
  if (latest && TERMINAL_STATUSES.includes(latest.status)) {
    clearInterval(heartbeat);
    unsubscribe();
    response.end();
    return;
  }

  request.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

export function writeSse(response: ServerResponse, event: GenerationJobEvent): void {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function writeJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}
