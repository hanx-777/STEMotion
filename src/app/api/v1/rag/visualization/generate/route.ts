import {
  runRagVisualizationAuditPipeline,
  type RagVisualizationAuditInput,
} from '@/lib/rag/visualization/auditPipeline';
import { jsonError, parseJsonBody } from '@/platform/api/http';
import { createLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 900;

const log = createLogger('rag-visualization-route');

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody<Partial<RagVisualizationAuditInput>>(request);
    if (!body.question?.trim()) {
      return jsonError(new Error('question is required'));
    }
    if (!body.subject?.trim()) {
      return jsonError(new Error('subject is required'));
    }
    if (!body.taskType?.trim()) {
      return jsonError(new Error('taskType is required'));
    }

    return createRagVisualizationGenerateResponse({
      question: body.question,
      answerText: body.answerText,
      answerSections: body.answerSections,
      formulaBlocks: body.formulaBlocks,
      finalResults: body.finalResults,
      citations: body.citations,
      subject: body.subject,
      taskType: body.taskType,
      source: body.source === 'teacher' ? 'teacher' : 'student',
      preferredType: body.preferredType,
    }, request.signal);
  } catch (error) {
    return jsonError(error, 'RAG visualization generation failed');
  }
}

function createRagVisualizationGenerateResponse(input: RagVisualizationAuditInput, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let aborted = false;
      signal.addEventListener('abort', () => {
        aborted = true;
        log.warn('Client disconnected from RAG visualization stream');
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':heartbeat\n\n'));
        } catch {
          // Stream is already closed.
        }
      }, 15000);

      const emit = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await runRagVisualizationAuditPipeline(input, {
          emit,
          isAborted: () => aborted,
        });
      } catch (error) {
        const isCancelled = error instanceof Error && error.message === '已取消';
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : 'RAG 可视化生成失败。';
          const diagnostics = error && typeof error === 'object' && 'diagnostics' in error
            ? (error as { diagnostics?: { missing?: string[]; repairAttempts?: number } }).diagnostics
            : undefined;
          log.error('RAG visualization stream failed', { error: message });
          emit({ type: 'error', message, diagnostics, progress: 100 });
        }
      } finally {
        clearInterval(heartbeat);
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
