import { runGuidedPlanningAgent, type GuidedPlanningInput } from '@/lib/deep-interaction/agents/guidedPlanningAgent';
import type { DeepInteractionType } from '@/lib/deep-interaction/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:planning');

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<GuidedPlanningInput>;

    if (!body.prompt || typeof body.prompt !== 'string' || !body.prompt.trim()) {
      return Response.json({ error: '请输入需要规划的学习主题。' }, { status: 400 });
    }

    if (!body.planningSessionId || typeof body.planningSessionId !== 'string') {
      return Response.json({ error: '缺少 planningSessionId。' }, { status: 400 });
    }

    const preferredType = normalizeInteractionType(body.preferredType);

    log.info('POST /api/deep-interaction/planning', {
      prompt: body.prompt.slice(0, 60),
      preferredType,
      planningSessionId: body.planningSessionId,
      clarificationRound: body.clarificationRound,
      answerCount: body.answers?.length ?? 0,
    });

    const result = await runGuidedPlanningAgent({
      prompt: body.prompt,
      preferredType,
      planningSessionId: body.planningSessionId,
      answers: body.answers,
      clarificationRound: body.clarificationRound,
    });

    return Response.json(result);
  } catch (error) {
    log.error('Planning request failed', { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: '规划失败，请稍后重试。' }, { status: 500 });
  }
}

function normalizeInteractionType(value: unknown): DeepInteractionType | undefined {
  const validTypes: DeepInteractionType[] = ['simulation', '3d_visualization', 'game', 'mind_map'];
  return typeof value === 'string' && validTypes.includes(value as DeepInteractionType)
    ? (value as DeepInteractionType)
    : undefined;
}
