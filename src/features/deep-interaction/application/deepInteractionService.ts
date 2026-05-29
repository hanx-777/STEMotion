import {
  runAgentWidgetPipeline,
  type DeepInteractionGenerateInput,
} from '@/lib/deep-interaction/agentWidgetPipeline';
import { runGuidedPlanningAgent, type GuidedPlanningInput } from '@/lib/deep-interaction/agents/guidedPlanningAgent';
import type { DeepInteractionStreamEvent } from '@/lib/deep-interaction/events';
import { handleLLMFollowUp } from '@/lib/deep-interaction/followUpHandler.server';
import type { DeepInteractionType, LearningBlueprint, TemplateMetadata } from '@/lib/deep-interaction/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('deep-interaction:v1');

export function createDeepInteractionGenerateResponse(input: Partial<DeepInteractionGenerateInput>, signal: AbortSignal): Response {
  if (!input.prompt || typeof input.prompt !== 'string') {
    return Response.json({ error: '请输入要生成的学习主题。' }, { status: 400 });
  }

  const validTypes: DeepInteractionType[] = ['simulation', '3d_visualization', 'game', 'mind_map'];
  if (!input.preferredType || !validTypes.includes(input.preferredType)) {
    return Response.json({ error: '请先选择一种有效的交互方式。' }, { status: 400 });
  }

  const startTime = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let aborted = false;
      signal.addEventListener('abort', () => {
        aborted = true;
        log.warn('Client disconnected');
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':heartbeat\n\n'));
        } catch {
          // stream closed
        }
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

export async function runDeepInteractionPlanning(input: Partial<GuidedPlanningInput>) {
  if (!input.prompt || typeof input.prompt !== 'string' || !input.prompt.trim()) {
    throw new Error('请输入需要规划的学习主题。');
  }
  if (!input.planningSessionId || typeof input.planningSessionId !== 'string') {
    throw new Error('缺少 planningSessionId。');
  }

  return runGuidedPlanningAgent({
    prompt: input.prompt,
    preferredType: normalizeInteractionType(input.preferredType),
    planningSessionId: input.planningSessionId,
    answers: input.answers,
    clarificationRound: input.clarificationRound,
  });
}

export async function runDeepInteractionFollowUp(input: {
  currentHtml?: string;
  prompt?: string;
  title?: string;
  concept?: string;
  blueprint?: LearningBlueprint;
  templateMetadata?: TemplateMetadata;
}) {
  if (!input.prompt || typeof input.prompt !== 'string' || !input.prompt.trim()) {
    throw new Error('请输入修改要求。');
  }
  if (!input.currentHtml || typeof input.currentHtml !== 'string') {
    throw new Error('缺少当前 HTML 内容。');
  }

  return handleLLMFollowUp(input.currentHtml, input.prompt, {
    title: input.title ?? '',
    concept: input.concept ?? '',
    blueprint: input.blueprint,
    templateMetadata: input.templateMetadata,
  });
}

function normalizeInteractionType(value: unknown): DeepInteractionType | undefined {
  const validTypes: DeepInteractionType[] = ['simulation', '3d_visualization', 'game', 'mind_map'];
  return typeof value === 'string' && validTypes.includes(value as DeepInteractionType)
    ? (value as DeepInteractionType)
    : undefined;
}
