import type { ExperimentPlan } from '../agentPipeline';
import { createFallbackWidgetHtml } from '../fallbacks';
import { assertSafeInteractiveHtml, stripMarkdownCodeFence } from '../htmlSafety';
import { generateWithConfiguredModel } from '../llmClient';
import { widgetSystemPrompt } from '../promptTemplates';
import { withTimeout } from '@/lib/utils/withTimeout';
import { createLogger } from '@/lib/logger';

const log = createLogger('widgetCodeAgent');

export async function runWidgetCodeAgent(plan: ExperimentPlan): Promise<string> {
  const first = await generateWidgetHtml(plan).catch((e) => {
    log.warn('WidgetCodeAgent LLM call failed, using fallback', { error: e instanceof Error ? e.message : String(e) });
    return createFallbackWidgetHtml(plan);
  });

  try {
    assertSafeInteractiveHtml(first);
    return first;
  } catch (error) {
    const repairHint = error instanceof Error ? error.message : String(error);
    const repaired = await generateWidgetHtml(plan, repairHint).catch(() => createFallbackWidgetHtml(plan));
    try {
      assertSafeInteractiveHtml(repaired);
      return repaired;
    } catch {
      const fallback = createFallbackWidgetHtml(plan);
      assertSafeInteractiveHtml(fallback);
      return fallback;
    }
  }
}

async function generateWidgetHtml(plan: ExperimentPlan, repairHint?: string): Promise<string> {
  const raw = await withTimeout(
    generateWithConfiguredModel({
      messages: [
        { role: 'system', content: widgetSystemPrompt(plan, repairHint) },
        { role: 'user', content: `Generate the interactive widget for: ${plan.title}` },
      ],
      temperature: repairHint ? 0.1 : 0.3,
      maxTokens: 131072,
    }),
    repairHint ? 60000 : 120000,
  );

  return stripMarkdownCodeFence(raw);
}

