import { generateWithConfiguredModel } from '@/lib/generation/llmClient';
import { artifactDesignContractPrompt } from '@/lib/generation/artifactDesignContract';
import {
  assertSafeInteractiveHtml,
  patchTruncatedHtml,
  repairMalformedHtml,
  stripMarkdownCodeFence,
} from '@/lib/generation/htmlSafety';
import { withTimeout } from '@/lib/utils/withTimeout';
import { createLogger } from '@/lib/logger';
import type { LLMFollowUpResult } from './followUpHandler';
import type { LearningBlueprint, TemplateMetadata } from './types';
import { followUpDesignProtectionPrompt } from './agents/designReviewRubric';

const log = createLogger('followUp');

export interface WidgetRefineContext {
  title: string;
  concept: string;
  blueprint?: LearningBlueprint;
  templateMetadata?: TemplateMetadata;
}

export function buildWidgetRefineSystemPrompt(context: WidgetRefineContext): string {
  const blueprintRules = context.blueprint
    ? `

LearningBlueprint constraints:
- expectedInsight must remain: ${context.blueprint.expectedInsight}
- Must-level knowledge constraints must not be broken:
${context.blueprint.knowledgeConstraints
  .filter((constraint) => constraint.severity === 'must')
  .map((constraint) => `  - ${constraint.description}: ${constraint.mustBeTrue}`)
  .join('\n')}
- Core variables must not be removed:
${context.blueprint.coreVariables.map((variable) => `  - ${variable.name} (${variable.symbol}, ${variable.role})`).join('\n')}
`
    : '';
  const templateRules = context.templateMetadata && context.templateMetadata.generationMode !== 'free_generation'
    ? `

Verified Template constraints:
- Current artifact is based on template: ${context.templateMetadata.templateTitle ?? context.templateMetadata.templateId ?? 'unknown'}.
- Keep protected data-role selectors: simulation-main, control-panel, observation-panel, formula-panel, quiz-panel.
- Preserve formula, observation, quiz, widget-config, and postMessage protocol.
- If the user asks for a change that breaks subject correctness, refuse that change in the HTML text and preserve the existing template behavior.
`
    : '';

  return `You are STEMotion WidgetRefineAgent.

Task: modify an existing self-contained HTML interactive widget according to the user's request.

Return ONLY the complete modified HTML document. Do not use markdown fences.

Rules:
- Keep the HTML self-contained with inline CSS/JS only.
- Do not copy OpenMAIC code, UI, prompts, assets, branding, or names.
- Preserve widget-config, requestAnimationFrame loop, start/reset controls, and message handlers for SET_WIDGET_STATE, HIGHLIGHT_ELEMENT, ANNOTATE_ELEMENT, REVEAL_ELEMENT.
- No remote resources, fetch, XMLHttpRequest, WebSocket, EventSource, import(), storage APIs, document.cookie, window.open, eval, or nested iframes.
- Apply the requested change while keeping unrelated behavior intact.
- Use Chinese for user-facing text if the original HTML uses Chinese.
- The output must start with <!DOCTYPE html> and end with </html>.
${artifactDesignContractPrompt({
  medium: 'refined existing interactive widget',
  mainStage: 'existing main simulation/game/visualization stage',
  supportPanel: 'existing supporting panels, sidebars, and control areas',
  supportingContent: 'variables, formulas, observations, quiz, learning goals, and long explanations',
})}
${followUpDesignProtectionPrompt()}
${blueprintRules}
${templateRules}`;
}

export async function handleLLMFollowUp(
  currentHtml: string,
  userPrompt: string,
  context: WidgetRefineContext,
): Promise<LLMFollowUpResult> {
  const system = buildWidgetRefineSystemPrompt(context);

  const raw = await withTimeout(
    generateWithConfiguredModel({
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `当前交互标题：${context.title}\n核心概念：${context.concept}\n\n用户修改要求：${userPrompt}\n\n当前 HTML：\n${currentHtml}`,
        },
      ],
      temperature: 0.2,
      requestPreset: 'repair',
    }),
    900000,
  );

  let html = stripMarkdownCodeFence(raw);
  html = repairMalformedHtml(html);

  try {
    assertSafeInteractiveHtml(html);
  } catch {
    const patched = patchTruncatedHtml(html);
    assertSafeInteractiveHtml(patched);
    html = patched;
  }

  log.info('LLM follow-up succeeded', { htmlLen: html.length, prompt: userPrompt.slice(0, 40) });
  return { html, message: '已根据你的要求修改了交互页面。' };
}
