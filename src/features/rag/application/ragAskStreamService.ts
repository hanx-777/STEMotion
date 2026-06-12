import { askRag, type RagPipelineEvent } from '@/features/rag/lib/rag_pipeline';
import type { RagAskResult } from '@/features/rag/lib/types';
import {
  toLegacyRagInput,
  toRagV1Response,
  type RagV1AskRequest,
} from '../contracts';
import { mapQualityMode } from './ragAskService';

export type RagAskStreamEvent =
  | { type: 'progress'; stage: string; message: string; progress: number; elapsedMs?: number }
  | { type: 'answer_delta'; delta: string; elapsedMs?: number }
  | { type: 'answer_ready'; result: ReturnType<typeof toRagV1Response>; elapsedMs?: number }
  | { type: 'quality_ready'; qualityReport: NonNullable<RagAskResult['quality_report']>; elapsedMs?: number }
  | { type: 'final_result'; result: ReturnType<typeof toRagV1Response>; elapsedMs?: number }
  | { type: 'error'; message: string; elapsedMs?: number };

export interface RagAskStreamDeps {
  askStream?: (
    input: RagV1AskRequest,
    emit: (event: RagPipelineEvent) => void,
    signal: AbortSignal,
  ) => Promise<RagAskResult>;
}

export function createRagAskStreamResponse(
  input: RagV1AskRequest,
  signal: AbortSignal,
  deps: RagAskStreamDeps = {},
): Response {
  const startedAt = Date.now();
  const encoder = new TextEncoder();

  if (!input.question?.trim()) {
    return Response.json({ error: 'question is required' }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: RagAskStreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          ...event,
          elapsedMs: event.elapsedMs ?? Date.now() - startedAt,
        })}\n\n`));
      };
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':heartbeat\n\n'));
        } catch {
          closed = true;
        }
      }, 15000);

      try {
        const result = await (deps.askStream ?? askRagV1Stream)(input, (event) => {
          if (event.type === 'answer_ready') {
            emit({ ...event, result: toRagV1Response(event.result) });
            return;
          }
          if (event.type === 'quality_ready') {
            if (event.qualityReport) emit({ ...event, qualityReport: event.qualityReport });
            return;
          }
          emit(event);
        }, signal);
        emit({ type: 'final_result', result: toRagV1Response(result) });
      } catch (error) {
        const isAborted = error instanceof Error && /abort|cancel|已取消/i.test(error.message);
        if (!isAborted) {
          emit({ type: 'error', message: error instanceof Error ? error.message : 'RAG ask failed' });
        }
      } finally {
        clearInterval(heartbeat);
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

async function askRagV1Stream(
  input: RagV1AskRequest,
  emit: (event: RagPipelineEvent) => void,
  signal: AbortSignal,
): Promise<RagAskResult> {
  return askRag(toLegacyRagInput(input), {
    multiAgentMode: mapQualityMode(input.quality?.mode),
    visualizationMode: input.visualization?.mode ?? 'auto',
    signal,
    onEvent: emit,
  });
}
