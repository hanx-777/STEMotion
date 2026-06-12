import {
  runRagVisualizationAuditPipeline,
  type RagVisualizationAuditInput,
} from '@/features/rag/lib/visualization/auditPipeline';
import { createLogger } from '@/lib/logger';
import { AppError } from '@/platform/errors';

const log = createLogger('rag-visualization:v1');

type RagVisualizationGeneratePipeline = typeof runRagVisualizationAuditPipeline;

export type RagVisualizationGenerateRequest = Partial<RagVisualizationAuditInput>;

export function toRagVisualizationAuditInput(
  body: RagVisualizationGenerateRequest,
): RagVisualizationAuditInput {
  if (!body.question?.trim()) {
    throw new AppError('question is required', { status: 400, code: 'VALIDATION_ERROR' });
  }
  if (!body.subject?.trim()) {
    throw new AppError('subject is required', { status: 400, code: 'VALIDATION_ERROR' });
  }
  if (!body.taskType?.trim()) {
    throw new AppError('taskType is required', { status: 400, code: 'VALIDATION_ERROR' });
  }

  return {
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
    visualizationSpec: body.visualizationSpec,
  };
}

export function createRagVisualizationGenerateResponse(
  input: RagVisualizationAuditInput,
  signal: AbortSignal,
  options: { pipeline?: RagVisualizationGeneratePipeline } = {},
): Response {
  const encoder = new TextEncoder();
  const pipeline = options.pipeline ?? runRagVisualizationAuditPipeline;
  const sanitizedInput = sanitizeRagVisualizationAuditInput(input);
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
        await pipeline(sanitizedInput, {
          emit,
          isAborted: () => aborted || signal.aborted,
          signal,
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

function sanitizeRagVisualizationAuditInput(input: RagVisualizationAuditInput): RagVisualizationAuditInput {
  return {
    question: input.question,
    answerText: input.answerText,
    answerSections: input.answerSections,
    formulaBlocks: input.formulaBlocks,
    finalResults: input.finalResults,
    citations: input.citations,
    subject: input.subject,
    taskType: input.taskType,
    source: input.source,
    preferredType: input.preferredType,
    visualizationSpec: input.visualizationSpec,
    now: input.now,
  };
}
