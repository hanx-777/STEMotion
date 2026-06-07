import { generateWithConfiguredModel } from '@/lib/generation/llmClient';
import { parseJsonResponse } from '@/lib/generation/jsonParser';
import { createLogger } from '@/lib/logger';
import { withTimeout } from '@/lib/utils/withTimeout';
import type {
  DeepInteractionType,
  GuidedClarificationAnswer,
  GuidedClarificationQuestion,
  GuidedGenerationPlan,
  GuidedPlanningResult,
  SubjectDomain,
} from '../types';
import { findMatchingSubjectSchema } from '../subject-schemas';
import { findMatchingVerifiedTemplate } from '../verified-experiments';

const log = createLogger('guidedPlanning');
const MAX_CLARIFICATION_ROUNDS = 2;
const MAX_QUESTIONS = 3;

export interface GuidedPlanningInput {
  prompt: string;
  preferredType?: DeepInteractionType;
  planningSessionId: string;
  answers?: GuidedClarificationAnswer[];
  clarificationRound?: number;
}

interface RawPlanningResponse {
  status?: unknown;
  questions?: unknown;
  plan?: unknown;
  assumptions?: unknown;
}

export async function runGuidedPlanningAgent(input: GuidedPlanningInput): Promise<GuidedPlanningResult> {
  const clarificationRound = Math.max(0, Number(input.clarificationRound) || 0);
  const answers = input.answers ?? [];

  if (answers.length === 0 && clarificationRound < MAX_CLARIFICATION_ROUNDS && shouldAskDeterministicClarification(input.prompt)) {
    return {
      status: 'clarification_required',
      planningSessionId: input.planningSessionId,
      clarificationRound: clarificationRound + 1,
      questions: buildDeterministicQuestions(input.prompt, input.preferredType),
      assumptions: [],
    };
  }

  try {
    const raw = await withTimeout(
      generateWithConfiguredModel({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(input, clarificationRound) },
        ],
        temperature: 0.1,
        requestPreset: 'planning',
      }),
      90000,
      'guided planning',
    );

    const parsed = parseJsonResponse(raw) as RawPlanningResponse;
    const status = parsed.status === 'clarification_required' ? 'clarification_required' : 'plan_ready';

    if (status === 'clarification_required' && clarificationRound < MAX_CLARIFICATION_ROUNDS) {
      const questions = normalizeQuestions(parsed.questions);
      if (questions.length > 0) {
        return {
          status: 'clarification_required',
          planningSessionId: input.planningSessionId,
          clarificationRound: clarificationRound + 1,
          questions,
          assumptions: stringArray(parsed.assumptions),
        };
      }
    }

    const plan = normalizePlan(parsed.plan, input, stringArray(parsed.assumptions));
    return {
      status: 'plan_ready',
      planningSessionId: input.planningSessionId,
      clarificationRound,
      plan,
    };
  } catch (error) {
    log.warn('Guided planning failed; returning deterministic fallback plan', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      status: 'plan_ready',
      planningSessionId: input.planningSessionId,
      clarificationRound,
      plan: createFallbackGuidedPlan(input, ['Planning failed; proceed with default generation assumptions.']),
      fallbackUsed: true,
    };
  }
}

export function createFallbackGuidedPlan(input: GuidedPlanningInput, extraAssumptions: string[] = []): GuidedGenerationPlan {
  const searchText = buildSearchText(input);
  const subjectDomain = inferSubjectDomain(searchText);
  const schemaMatch = findMatchingSubjectSchema(subjectDomain, searchText) ?? findMatchingSubjectSchema('other', searchText);
  const templateMatch = findMatchingVerifiedTemplate(searchText);
  const topic = schemaMatch?.schema.topic ?? inferTopic(input.prompt);
  const variables = schemaMatch?.schema.requiredVariables?.length
    ? schemaMatch.schema.requiredVariables
    : inferVariables(searchText);
  const constraints = schemaMatch?.schema.constraints?.length
    ? schemaMatch.schema.constraints.map((constraint) => constraint.description)
    : [`${topic} 的概念、变量和可视化说明需要保持一致。`];

  return {
    planningSessionId: input.planningSessionId,
    topic,
    subjectDomain: schemaMatch?.schema.subjectDomain ?? subjectDomain,
    gradeRange: inferGradeRange(searchText),
    interactionType: input.preferredType ?? 'simulation',
    expectedInsight: `${topic} 的关键规律应通过可操作变量和可观察结果被学生看见。`,
    learningObjectives: [
      `理解${topic}的核心概念。`,
      '通过调节变量观察结果变化。',
      '用公式、数据或阶段说明解释观察结果。',
    ],
    coreVariables: variables,
    knowledgeConstraints: constraints,
    possibleTemplate: templateMatch
      ? {
          templateId: templateMatch.template.id,
          title: templateMatch.template.title,
          confidence: templateMatch.score,
        }
      : undefined,
    interactionStructure: [
      '主舞台展示核心现象或模拟过程。',
      '控制区提供学生可操作的关键变量。',
      '观察区实时解释变量变化带来的结果。',
      '公式或提示区帮助学生把现象连接到学科知识。',
      '小测区检查学生是否形成预期洞察。',
    ],
    qualityFocus: [
      '学科公式、单位、阶段顺序或概念表达正确。',
      '核心变量可操作、结果可观察。',
      '移动端和触控目标可用。',
      '控件反馈清晰，文字不重叠。',
    ],
    assumptions: [
      ...extraAssumptions,
      ...(schemaMatch ? [] : ['未命中内置学科 Schema，将按默认教学生成假设继续。']),
      ...(templateMatch ? [] : ['未发现高置信可信模板，可能进入自由生成路径。']),
    ],
  };
}

function buildUserPrompt(input: GuidedPlanningInput, clarificationRound: number): string {
  return JSON.stringify({
    prompt: input.prompt,
    preferredType: input.preferredType,
    planningSessionId: input.planningSessionId,
    clarificationRound,
    maxClarificationRounds: MAX_CLARIFICATION_ROUNDS,
    answers: input.answers ?? [],
  }, null, 2);
}

const SYSTEM_PROMPT = `你是 STEMotion GuidedPlanningAgent。

任务：在正式生成前，将教师自然语言需求转成教师可审批的生成计划；只有必要时才提出澄清问题。

输出规则：
- 只输出 JSON，不要输出 Markdown 或解释。
- planningSessionId 只用于追踪；不要假设服务端保存会话状态。
- 每次只根据 prompt、answers、clarificationRound 重建上下文。
- prompt 足够明确时输出 plan_ready。
- 缺少学科主题、年级/学习者、核心变量或交互目标，且 clarificationRound < 2 时，可输出 clarification_required，最多 3 个问题。
- clarificationRound >= 2 时必须输出 plan_ready，并把未解决点写入 assumptions。
- guidedPlan 是教师计划，不是工程日志；不要描述内部 Agent 顺序。
- 不确定时仍给出可批准计划，把风险写入 assumptions。

clarification_required JSON:
{
  "status": "clarification_required",
  "questions": [
    { "id": "subject", "question": "string", "options": ["string"], "reason": "string" }
  ],
  "assumptions": ["string"]
}

plan_ready JSON:
{
  "status": "plan_ready",
  "plan": {
    "topic": "string",
    "subjectDomain": "math|physics|chemistry|biology|earth_science|computer_science|engineering|other",
    "gradeRange": [number, number],
    "interactionType": "simulation|3d_visualization|game|mind_map",
    "expectedInsight": "string",
    "learningObjectives": ["string"],
    "coreVariables": ["string"],
    "knowledgeConstraints": ["string"],
    "possibleTemplate": { "templateId": "string", "title": "string", "confidence": number },
    "interactionStructure": ["string"],
    "qualityFocus": ["string"],
    "assumptions": ["string"]
  }
}`;

function normalizeQuestions(value: unknown): GuidedClarificationQuestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): GuidedClarificationQuestion | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const question = typeof record.question === 'string' ? record.question.trim() : '';
      if (!question) return null;
      return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `question_${index + 1}`,
        question,
        options: stringArray(record.options).slice(0, 5),
        reason: typeof record.reason === 'string' ? record.reason : undefined,
      };
    })
    .filter((item): item is GuidedClarificationQuestion => Boolean(item))
    .slice(0, MAX_QUESTIONS);
}

function normalizePlan(value: unknown, input: GuidedPlanningInput, assumptions: string[]): GuidedGenerationPlan {
  const fallback = createFallbackGuidedPlan(input, assumptions);
  if (!value || typeof value !== 'object') return fallback;

  const record = value as Record<string, unknown>;
  const possibleTemplate = normalizeTemplate(record.possibleTemplate) ?? fallback.possibleTemplate;

  return {
    planningSessionId: input.planningSessionId,
    topic: text(record.topic, fallback.topic),
    subjectDomain: text(record.subjectDomain, fallback.subjectDomain),
    gradeRange: normalizeGradeRange(record.gradeRange) ?? fallback.gradeRange,
    interactionType: text(record.interactionType, fallback.interactionType ?? input.preferredType ?? 'simulation'),
    expectedInsight: text(record.expectedInsight, fallback.expectedInsight),
    learningObjectives: stringArray(record.learningObjectives, fallback.learningObjectives).slice(0, 5),
    coreVariables: stringArray(record.coreVariables, fallback.coreVariables).slice(0, 8),
    knowledgeConstraints: stringArray(record.knowledgeConstraints, fallback.knowledgeConstraints).slice(0, 8),
    possibleTemplate,
    interactionStructure: stringArray(record.interactionStructure, fallback.interactionStructure).slice(0, 8),
    qualityFocus: stringArray(record.qualityFocus, fallback.qualityFocus).slice(0, 8),
    assumptions: stringArray(record.assumptions, fallback.assumptions),
  };
}

function normalizeTemplate(value: unknown): GuidedGenerationPlan['possibleTemplate'] {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return {
    templateId: typeof record.templateId === 'string' ? record.templateId : undefined,
    title: typeof record.title === 'string' ? record.title : undefined,
    confidence: typeof record.confidence === 'number' ? clamp(record.confidence, 0, 1) : undefined,
  };
}

function shouldAskDeterministicClarification(prompt: string): boolean {
  const text = prompt.trim();
  if (text.length < 8) return true;
  const hasKnownTopic = Boolean(findMatchingSubjectSchema('other', text) || findMatchingVerifiedTemplate(text));
  const vagueTopic = /^(做|生成|创建|设计)?(一个|一份)?(电学|力学|化学|生物|数学|物理)?(实验|模拟|动画|交互|可视化)$/i.test(text);
  return !hasKnownTopic && vagueTopic;
}

function buildDeterministicQuestions(prompt: string, preferredType?: DeepInteractionType): GuidedClarificationQuestion[] {
  return [
    {
      id: 'topic',
      question: '你希望这个交互聚焦哪个具体概念或实验？',
      options: ['欧姆定律', '二次函数', '酸碱滴定', '有丝分裂'],
      reason: '具体主题会决定学科约束、变量和可用模板。',
    },
    {
      id: 'learners',
      question: '目标学习者大致是哪个年级段？',
      options: ['初中', '高中', '小学高年级'],
      reason: '年级会影响语言、难度和引导程度。',
    },
    {
      id: 'interaction_goal',
      question: `你更希望学生通过${preferredType ?? 'simulation'}观察什么变化或得出什么结论？`,
      options: ['调节变量并观察结果', '按步骤理解过程', '完成小测验巩固概念'],
      reason: '交互目标会影响控件、观察区和质量评审重点。',
    },
  ];
}

function buildSearchText(input: GuidedPlanningInput): string {
  return [
    input.prompt,
    ...(input.answers ?? []).map((answer) => answer.answer),
  ].join(' ');
}

function inferTopic(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return 'STEM 交互实验';
  return trimmed.length > 24 ? `${trimmed.slice(0, 24)}...` : trimmed;
}

function inferSubjectDomain(text: string): SubjectDomain {
  if (/二次函数|函数|抛物线|math|quadratic|parabola/i.test(text)) return 'math';
  if (/电|力|运动|物理|ohm|projectile|physics/i.test(text)) return 'physics';
  if (/酸|碱|滴定|化学|chemistry|titration/i.test(text)) return 'chemistry';
  if (/细胞|有丝|生物|biology|mitosis/i.test(text)) return 'biology';
  if (/地震|地球|earth/i.test(text)) return 'earth_science';
  return 'other';
}

function inferGradeRange(text: string): [number, number] | undefined {
  if (/小学/.test(text)) return [4, 6];
  if (/初中|初一|初二|初三|middle/i.test(text)) return [7, 9];
  if (/高中|高一|高二|高三|high/i.test(text)) return [10, 12];
  return undefined;
}

function inferVariables(text: string): string[] {
  if (/欧姆|电流|电压|电阻|ohm/i.test(text)) return ['U 电压', 'R 电阻', 'I 电流'];
  if (/二次函数|抛物线|quadratic|parabola/i.test(text)) return ['a 开口方向和宽窄', 'b 对称轴位置', 'c 纵截距'];
  if (/滴定|酸碱|titration/i.test(text)) return ['滴加体积', 'pH', '指示剂颜色'];
  if (/有丝|细胞|mitosis/i.test(text)) return ['分裂阶段', '染色体位置', '子细胞数量'];
  return ['可调节变量', '观察结果'];
}

function normalizeGradeRange(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const start = Number(value[0]);
  const end = Number(value[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  return [clamp(Math.round(start), 1, 12), clamp(Math.round(end), 1, 12)];
}

function stringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  const result = value.map((item) => String(item).trim()).filter(Boolean);
  return result.length ? result : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
