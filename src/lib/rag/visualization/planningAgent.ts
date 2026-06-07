import { generateWithConfiguredModel } from '@/lib/generation/llmClient';
import { parseJsonResponse } from '@/lib/generation/jsonParser';
import { createLogger } from '@/lib/logger';
import { createRagVisualizationBrief } from './briefAgent';
import { buildRagVisualizationDesignContext } from './designContext';
import type {
  RagVisualizationGenerationPlan,
  RagVisualizationNarrationStep,
  RagVisualizationVariable,
  VisualizationType,
} from './types';

const log = createLogger('rag-visualization-planner');

export interface RagVisualizationPlanningInput {
  question: string;
  answerText?: string;
  subject: string;
  taskType: string;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  preferredType?: VisualizationType;
}

export interface RagVisualizationPlanningOptions {
  plannerModel?: (prompt: string) => Promise<string>;
}

export async function createRagVisualizationGenerationPlan(
  input: RagVisualizationPlanningInput,
  options: RagVisualizationPlanningOptions = {},
): Promise<RagVisualizationGenerationPlan> {
  const fallback = createFallbackPlan(input);
  const prompt = buildRagVisualizationPlanningPrompt(input);

  try {
    const raw = await (options.plannerModel
      ? options.plannerModel(prompt)
      : generateWithConfiguredModel({
          messages: [
            {
              role: 'system',
              content: `你是 STEMotion RagVisualizationPlanningAgent。

任务：还原原题要演示的对象、变量、操作和成功标准。

只返回 JSON，不写 Markdown。

规则：
- 禁止改题、泛化题或编造题目参数。
- 缺失数值必须标为 unknown 或要求页面说明默认演示值。
- 规划必须服务原题和 RAG 回答，不输出通用科普页。
- Include design intent: STEMotion visual vocabulary, anti-filler, first-screen stage-first, and problem-specific interaction choices must be reflected in successCriteria and rightPanelNarration.`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.08,
          requestPreset: 'planning',
        }));

    const parsed = parseJsonResponse(raw) as Partial<RagVisualizationGenerationPlan>;
    return normalizePlan(parsed, fallback);
  } catch (error) {
    log.warn('Planning agent failed, using heuristic fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

export function buildRagVisualizationPlanningPrompt(input: RagVisualizationPlanningInput): string {
  const formulaText = input.formulaBlocks?.length
    ? input.formulaBlocks.map((item) => `- ${item.latex}${item.explanation ? `：${item.explanation}` : ''}`).join('\n')
    : '- 无';
  const resultText = input.finalResults?.length
    ? input.finalResults.map((item) => `- ${item.label}: ${item.value}${item.unit ?? ''}`).join('\n')
    : '- 无';

  return `请为 RAG 回答生成“问题专属互动可视化”的规划 JSON。

硬性规则：
- 禁止改题：problemRestatement 必须保留原题对象、变量、已知量和要求，不要换成类似题。
- 不要编造参数：题目或答案没有给出的数值必须标记为 "unknown"，或在 successCriteria 中要求页面明确说明“默认演示值”。
- 禁止泛化演示；必须围绕原题或知识点。
- 如果题目不适合可视化，shouldGenerate=false，并在 successCriteria 中解释。
- recommendedType 优先用 "interactive_html"，除非非常确定只需结构化 fallback。
- rightPanelNarration 是右侧讲解面板内容，保留原题、变量、观察目标、操作步骤。
- design intent / 设计意图必须进入规划：复用 STEMotion visual vocabulary，遵守 anti-filler，采用 first-screen stage-first 布局，确保 problem-specific interaction。

JSON 形状:
{
  "shouldGenerate": true,
  "problemRestatement": "string",
  "knowledgePoint": "string",
  "variables": [{"name":"string","label":"string","value":"string|unknown","unit":"optional","role":"given|derived|controlled|unknown"}],
  "visualObjects": ["string"],
  "controls": ["string"],
  "metrics": ["string"],
  "animationRequirements": ["string"],
  "successCriteria": ["string"],
  "rightPanelNarration": [{"title":"string","narration":"string"}],
  "recommendedType": "interactive_html|function_graph|force_diagram|algorithm_trace|projectile_motion",
  "confidence": 0.9
}

原题：
${input.question}

RAG 回答摘要：
${(input.answerText ?? '').slice(0, 2400) || '无'}

公式：
${formulaText}

最终结果：
${resultText}

设计上下文：
${buildRagVisualizationDesignContext({
  medium: 'RAG visualization planning brief',
  originalQuestion: input.question,
  interactionIntent: 'plan a problem-specific interaction before HTML generation',
})}

上下文：
- subject: ${input.subject}
- taskType: ${input.taskType}
- preferredType: ${input.preferredType ?? 'auto'}

请只返回 JSON。`;
}

function createFallbackPlan(input: RagVisualizationPlanningInput): RagVisualizationGenerationPlan {
  const brief = createRagVisualizationBrief({
    question: input.question,
    answerText: input.answerText,
    subject: input.subject,
    taskType: input.taskType,
    recommendedType: input.preferredType,
  });

  const metrics = input.finalResults?.length
    ? input.finalResults.map((item) => `${item.label}${item.unit ? `(${item.unit})` : ''}`)
    : inferMetrics(brief.knowledgePoint);

  return {
    shouldGenerate: brief.confidence >= 0.45,
    problemRestatement: brief.originalQuestion,
    knowledgePoint: brief.knowledgePoint,
    variables: brief.variables,
    visualObjects: brief.mustShow.length ? brief.mustShow : ['原题对象', '关键变量', '结果变化'],
    controls: ['开始/暂停', '重置', '逐步观察'],
    metrics,
    animationRequirements: brief.mustShow.map((item) => `动态展示：${item}`),
    successCriteria: [
      `标题和标签必须体现：${brief.knowledgePoint}`,
      '必须保留原题变量，缺失参数用 unknown 或明确默认演示值',
      '必须有 start/reset 控件和实时指标',
    ],
    rightPanelNarration: [
      { title: '还原原题', narration: brief.scenario },
      { title: '观察目标', narration: brief.visualGoal },
      {
        title: '检查变量',
        narration: brief.variables.length
          ? brief.variables.map((item) => `${item.label}=${item.value}${item.unit ?? ''}`).join('；')
          : '从题目和回答中定位核心对象、状态或图形关系。',
      },
    ],
    recommendedType: 'interactive_html',
    confidence: brief.confidence,
  };
}

function normalizePlan(
  parsed: Partial<RagVisualizationGenerationPlan>,
  fallback: RagVisualizationGenerationPlan,
): RagVisualizationGenerationPlan {
  const variables = normalizeVariables(parsed.variables, fallback.variables);
  const rightPanelNarration = normalizeNarration(parsed.rightPanelNarration, fallback.rightPanelNarration);
  const confidence = normalizeConfidence(parsed.confidence, fallback.confidence);

  return {
    shouldGenerate: typeof parsed.shouldGenerate === 'boolean' ? parsed.shouldGenerate : fallback.shouldGenerate,
    problemRestatement: nonEmpty(parsed.problemRestatement, fallback.problemRestatement),
    knowledgePoint: nonEmpty(parsed.knowledgePoint, fallback.knowledgePoint),
    variables,
    visualObjects: normalizeStrings(parsed.visualObjects, fallback.visualObjects),
    controls: ensureCoreControls(normalizeStrings(parsed.controls, fallback.controls)),
    metrics: normalizeStrings(parsed.metrics, fallback.metrics),
    animationRequirements: normalizeStrings(parsed.animationRequirements, fallback.animationRequirements),
    successCriteria: normalizeStrings(parsed.successCriteria, fallback.successCriteria),
    rightPanelNarration,
    recommendedType: normalizeVisualizationType(parsed.recommendedType) ?? fallback.recommendedType,
    confidence,
  };
}

function normalizeVariables(
  value: unknown,
  fallback: RagVisualizationVariable[],
): RagVisualizationVariable[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.slice(0, 10).map((item, index) => {
    const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      name: nonEmpty(candidate.name, `var${index + 1}`),
      label: nonEmpty(candidate.label, nonEmpty(candidate.name, `变量 ${index + 1}`)),
      value: nonEmpty(candidate.value, 'unknown'),
      ...(candidate.unit ? { unit: String(candidate.unit) } : {}),
      ...(candidate.role ? { role: String(candidate.role) } : {}),
    };
  });
}

function normalizeNarration(
  value: unknown,
  fallback: RagVisualizationNarrationStep[],
): RagVisualizationNarrationStep[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.slice(0, 8).map((item, index) => {
    const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      title: nonEmpty(candidate.title, `讲解 ${index + 1}`),
      narration: nonEmpty(candidate.narration, '观察可视化中的关键变化。'),
    };
  });
}

function normalizeStrings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => String(item).trim()).filter(Boolean).slice(0, 10);
  return items.length ? items : fallback;
}

function ensureCoreControls(controls: string[]): string[] {
  const joined = controls.join(' ');
  const next = [...controls];
  if (!/开始|播放|start|run|play/i.test(joined)) next.unshift('开始/暂停');
  if (!/重置|reset/i.test(joined)) next.push('重置');
  return Array.from(new Set(next));
}

function normalizeVisualizationType(value: unknown): VisualizationType | undefined {
  const valid: VisualizationType[] = [
    'function_graph',
    'force_diagram',
    'algorithm_trace',
    'projectile_motion',
    'interactive_html',
  ];
  return valid.includes(value as VisualizationType) ? value as VisualizationType : undefined;
}

function normalizeConfidence(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const score = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, score));
}

function nonEmpty(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return text || fallback;
}

function inferMetrics(knowledgePoint: string): string[] {
  if (/抛|运动/.test(knowledgePoint)) return ['时间', '水平位移', '竖直位移', '速度分量'];
  if (/函数|图像|极值|单调/.test(knowledgePoint)) return ['x 坐标', 'f(x)', '导数符号', '区间状态'];
  if (/栈|递归|算法/.test(knowledgePoint)) return ['当前步骤', '数据结构状态', '输出结果'];
  return ['当前状态', '关键变量', '观察结果'];
}
