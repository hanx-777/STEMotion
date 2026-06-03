import { generateWithConfiguredModel, LlmTruncationError } from '@/lib/generation/llmClient';
import { patchTruncatedHtml } from '@/lib/generation/htmlSafety';
import { createLogger } from '@/lib/logger';
import type { RagVisualizationBrief } from './types';

const log = createLogger('rag-viz-html');

/**
 * 互动 HTML 单次生成的最大输出 token 数。
 * 自包含 HTML（DOCTYPE + 内联 CSS + Canvas/SVG + RAF + 滑块/按钮 + 中文标签）
 * 实际常需 6k–15k tokens，留一倍头部避免边界截断。
 * 与 src/lib/rag/visualization/auditPipeline.ts:321 的更宽松上限取同一档策略，
 * 但仅取它的 1/4，因为本路径不走多 Agent 评审，无需保留补救预算。
 */
export const HTML_GENERATION_MAX_TOKENS = 32768;

export interface HtmlGenerationInput {
  question: string;
  answerText: string;
  visualizationType: string;
  extractedParameters: Record<string, unknown>;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  brief?: RagVisualizationBrief;
}

export interface GenerateInteractiveHtmlDeps {
  /** Test seam — defaults to generateWithConfiguredModel. */
  generate?: typeof generateWithConfiguredModel;
}

export async function generateInteractiveHtml(
  input: HtmlGenerationInput,
  deps: GenerateInteractiveHtmlDeps = {},
): Promise<string> {
  const prompt = buildHtmlGenerationPrompt(input);
  const generate = deps.generate ?? generateWithConfiguredModel;

  let raw: string;
  try {
    raw = await generate({
      messages: [
        { role: 'system', content: HTML_GENERATION_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: HTML_GENERATION_MAX_TOKENS,
      stream: false,
    });
  } catch (error) {
    if (error instanceof LlmTruncationError) {
      // Mirrors the recovery path in src/lib/rag/visualization/auditPipeline.ts:303-336
      // and src/lib/deep-interaction/agentWidgetPipeline.ts:604-651 — recover the partial
      // output via a deterministic patcher instead of failing the whole RAG flow.
      log.warn('Interactive HTML output truncated — patching partial content', {
        outputTokens: error.outputTokens,
        maxTokens: error.maxTokens,
        partialChars: error.partialContent.length,
      });
      raw = patchTruncatedHtml(error.partialContent);
    } else {
      throw error;
    }
  }

  return cleanAndValidateHtml(raw);
}

export function buildHtmlGenerationPrompt(input: HtmlGenerationInput): string {
  const briefBlock = input.brief
    ? `**可视化 Brief（必须遵守）：**
- originalQuestion: ${input.brief.originalQuestion}
- knowledgePoint: ${input.brief.knowledgePoint}
- scenario: ${input.brief.scenario}
- visualGoal: ${input.brief.visualGoal}
- variables: ${input.brief.variables.map((item) => `${item.label}=${item.value}${item.unit ? item.unit : ''}`).join('；') || '无'}
- mustShow: ${input.brief.mustShow.join('；')}
- avoidGenericDemo: ${input.brief.avoidGenericDemo ? 'true' : 'false'}
`
    : '';

  return `生成一个完整、自包含的 RAG 互动可视化 HTML 页面：

**原题：** ${input.question}

**答案摘要：** ${input.answerText.slice(0, 500)}

**可视化类型：** ${input.visualizationType}

**参数：** ${JSON.stringify(input.extractedParameters, null, 2)}

${briefBlock}

${input.formulaBlocks ? `**关键公式：**\n${input.formulaBlocks.map(f => `- ${f.latex}: ${f.explanation || ''}`).join('\n')}` : ''}

${input.finalResults ? `**结果：**\n${input.finalResults.map(r => `- ${r.label}: ${r.value} ${r.unit || ''}`).join('\n')}` : ''}

要求：
1. 输出完整 HTML，内联 CSS 和 JavaScript，无外部依赖。
2. 使用适合原题的控件，例如滑块、按钮、步骤播放或参数切换。
3. 使用 Canvas 或 SVG 可视化。
4. 实时计算并更新图形、标签和指标。
5. 标签、注释、单位和步骤说明清晰。
6. 响应式布局支持移动端。
7. 帮助学生理解原题概念，而不是展示泛化示例。
8. 必须围绕原题和 knowledgePoint 生成，不要生成脱离原题的泛化说明页、玩具示例或元信息页。
9. 如果 brief.avoidGenericDemo 为 true，页面主要标题、控件、图形标签必须体现原题变量和 mustShow 项。

只返回HTML代码，不要解释。`;
}

const HTML_GENERATION_SYSTEM_PROMPT = `你是 STEMotion RagInteractiveHtmlAgent。

任务：使用 HTML、CSS 和 JavaScript 创建题目专属互动教育可视化。

输出规则：
- 只返回完整 HTML，不要 Markdown 或解释。
- 完全自包含；CSS 和 JS 内联。
- 不使用外部库、远程资源、网络请求、storage API、eval 或动态 import。
- 使用 Canvas API 或 SVG 绘图。
- 包含交互控件、实时计算、标签、坐标轴或注释。
- 使用 requestAnimationFrame 处理动画或步骤播放。
- 始终包含 <!DOCTYPE html>、完整 HTML 结构、内联 <style>、内联 <script>、响应式 viewport meta。
- 使用中文标签和说明文字。`;

function cleanAndValidateHtml(html: string): string {
  // Remove markdown code fences if present
  let cleaned = html.replace(/^```html\n?/i, '').replace(/\n?```$/i, '');

  // Ensure DOCTYPE
  if (!cleaned.includes('<!DOCTYPE')) {
    cleaned = '<!DOCTYPE html>\n' + cleaned;
  }

  // If structural tags are missing (e.g. partial content that bypassed the
  // truncation catch above, or output cut off mid-tag), give patchTruncatedHtml
  // a chance to close <script>/<body>/<html> before failing hard.
  if (!cleaned.includes('<html') || !cleaned.includes('</html>')) {
    cleaned = patchTruncatedHtml(cleaned);
  }

  if (!cleaned.includes('<html') || !cleaned.includes('</html>')) {
    throw new Error('Generated HTML is incomplete');
  }

  return cleaned.trim();
}
