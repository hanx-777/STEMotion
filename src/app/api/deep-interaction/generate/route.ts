import {
  runAgentWidgetPipeline,
  type DeepInteractionGenerateInput,
} from '@/lib/deep-interaction/agentWidgetPipeline';
import type { DeepInteractionStreamEvent } from '@/lib/deep-interaction/events';
import { createLogger } from '@/lib/logger';

const log = createLogger('api');

export const maxDuration = 300;

export async function POST(req: Request) {
  const input = (await req.json()) as Partial<DeepInteractionGenerateInput>;

  log.info('POST /api/deep-interaction/generate', { prompt: input.prompt?.slice(0, 60), type: input.preferredType });

  if (!input.prompt || typeof input.prompt !== 'string') {
    return Response.json({ error: '请输入要生成的学习主题。' }, { status: 400 });
  }

  const validTypes = ['simulation', '3d_visualization', 'game', 'mind_map'];
  if (!input.preferredType || !validTypes.includes(input.preferredType)) {
    return Response.json({ error: '请先选择一种有效的交互方式。' }, { status: 400 });
  }

  const startTime = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let aborted = false;
      req.signal.addEventListener('abort', () => {
        aborted = true;
        log.warn('Client disconnected');
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':heartbeat\n\n'));
        } catch { /* stream closed */ }
      }, 15000);

      const emit = (event: DeepInteractionStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await runAgentWidgetPipeline(
          {
            prompt: input.prompt!,
            gradeLevel: input.gradeLevel,
            preferredType: input.preferredType,
            existingSessionId: input.existingSessionId,
            currentArtifactId: input.currentArtifactId,
            guidedPlan: input.guidedPlan,
          },
          emit,
          { isAborted: () => aborted },
        );
        log.info('Request completed', { elapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s` });
      } catch (error) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const isCancelled = error instanceof Error && error.message === '已取消';
        if (!isCancelled) {
          log.error('Request failed', { elapsed: `${elapsed}s`, error: error instanceof Error ? error.message : String(error) });
          emit({
            type: 'error',
            message: error instanceof Error ? error.message : '生成失败，请稍后重试。',
            progress: 100,
          });
        } else {
          log.info('Pipeline cancelled', { elapsed: `${elapsed}s` });
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
