import { handleLLMFollowUp } from '@/lib/deep-interaction/followUpHandler.server';
import type { LearningBlueprint, TemplateMetadata } from '@/lib/deep-interaction/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:follow-up');

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    sessionId?: string;
    currentHtml?: string;
    prompt?: string;
    title?: string;
    concept?: string;
    blueprint?: LearningBlueprint;
    templateMetadata?: TemplateMetadata;
  };

  if (!body.prompt || typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return Response.json({ error: '请输入修改要求。' }, { status: 400 });
  }

  if (!body.currentHtml || typeof body.currentHtml !== 'string') {
    return Response.json({ error: '缺少当前 HTML 内容。' }, { status: 400 });
  }

  log.info('POST /api/deep-interaction/follow-up', {
    prompt: body.prompt.slice(0, 60),
    htmlLen: body.currentHtml.length,
  });

  try {
    const result = await handleLLMFollowUp(body.currentHtml, body.prompt, {
      title: body.title ?? '',
      concept: body.concept ?? '',
      blueprint: body.blueprint,
      templateMetadata: body.templateMetadata,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '追问修改失败，请稍后重试。';
    log.error('Follow-up failed', { error: message });
    return Response.json({ error: message }, { status: 500 });
  }
}
